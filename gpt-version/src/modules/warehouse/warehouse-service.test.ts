import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../../server/database";
import { applyMigrations } from "../../server/migrations";
import { buildNormalizedStateSql } from "../../server/state-migration";
import { createSeedState } from "../../server/store";
import { inspectSupplyFile, parseSupplyFile } from "../../server/supply-file-parser";
import { allocateDeliveryByMass, WarehouseService } from "./warehouse-service";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-warehouse-module-"));
const database = openDatabase(path.join(root, "warehouse.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,datetime('now'));");
applyMigrations(database);
database.executeScript(buildNormalizedStateSql(createSeedState()));
database.execute("INSERT INTO product_price_history(id,product_id,price_kopecks,price_unit,effective_from,created_at) VALUES ('price-test','p-1',180000,'piece','2026-01-01','2026-01-01')");
const service = new WarehouseService(database, () => "2026-07-27T00:00:00.000Z");

assert.equal(service.suppliers().some((supplier) => supplier.id === "sup-1"), true);
assert.equal(service.balances().find((balance) => balance.productId === "p-1")?.remainingPackageMilli, 0);
assert.equal(service.catalog().find((product) => product.id === "p-1")?.unit, "кг");

assert.equal(service.cutoverReadiness().ready, false);
assert.deepEqual(service.applyCashEvent({
  eventId: "cash-before-cutover", eventType: "SaleStockDelta", eventVersion: 1, producer: "cash", aggregateId: "sale-before-cutover", occurredAt: "2026-07-27T00:00:00.000Z",
  payload: { externalSaleKey: "sale-before-cutover", externalLineKey: "line-before-cutover", revision: "r0", productId: "p-2", quantityPackageMilli: 1, revenueDeltaKopecks: 1, isReturn: false }
}), { eventId: "cash-before-cutover", status: "requires_action", code: "WAREHOUSE_CUTOVER_REQUIRED" });
const opening = service.registerOpeningLot({ productId: "p-1", packageCount: 8, packageMassGrams: 1250, totalCostKopecks: 800000, observedAccountingQuantityMinor: 10000, actorId: "u-admin", recordedAt: "2026-07-26T00:00:00.000Z" });
assert.equal(opening.lotIds.length, 1);
assert.equal(service.reconciliation().find((row) => row.productId === "p-1")?.difference, 0);
const supply = service.acceptSupply({
  supplierId: "sup-1", invoiceNumber: "TEST-1", deliveredAt: "2026-07-27T00:00:00.000Z", actorId: "u-admin",
  lines: [{ productId: "p-1", packageCount: 4, packageMassGrams: 1250, purchaseCostKopecks: 400000 }]
});
assert.equal(supply.lotIds.length, 1);
const replayedSupply = service.acceptSupply({
  supplierId: "sup-1", invoiceNumber: "TEST-IDEMPOTENT", deliveredAt: "2026-07-27T00:00:00.000Z", actorId: "core-user-created-after-seed", idempotencyKey: "supply-replay-1",
  lines: [{ productId: "p-2", packageCount: 1, packageMassGrams: 1250, purchaseCostKopecks: 100000 }]
});
assert.equal(service.acceptSupply({
  supplierId: "sup-1", invoiceNumber: "TEST-IDEMPOTENT", deliveredAt: "2026-07-27T00:00:00.000Z", actorId: "core-user-created-after-seed", idempotencyKey: "supply-replay-1",
  lines: [{ productId: "p-2", packageCount: 1, packageMassGrams: 1250, purchaseCostKopecks: 100000 }]
}).supplyId, replayedSupply.supplyId);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM users WHERE id='core-user-created-after-seed'")[0].count, 1);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-1'")[0].quantity_minor, 15000);
assert.equal(service.balances().find((balance) => balance.productId === "p-1")?.remainingPackageMilli, 12000);

const sale = {
  eventId: "cash-event-1", eventType: "SaleStockDelta" as const, eventVersion: 1 as const, producer: "cash" as const,
  aggregateId: "sale-1", occurredAt: "2026-07-27T01:00:00.000Z",
  payload: { externalSaleKey: "sale-1", externalLineKey: "line-1", revision: "r1", productId: "p-1", quantityPackageMilli: 500, revenueDeltaKopecks: 90000, isReturn: false }
};
assert.equal(service.applyCashEvent(sale).status, "applied");
assert.equal(service.applyCashEvent(sale).status, "duplicate");
assert.equal(database.query<{ quantity_package_milli: number }>("SELECT quantity_package_milli FROM fifo_allocations WHERE event_id='cash-event-1'")[0].quantity_package_milli, 500);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-1'")[0].quantity_minor, 14375);
assert.equal(service.profitability("p-1", true).actual.availability, "available");
assert.equal(service.profitability("p-1", false).actual.availability, "unavailable");
assert.equal(service.reconciliation().find((row) => row.productId === "p-1")?.difference, 0);
assert.equal(service.cutoverReadiness().ready, false);

const returned = { ...sale, eventId: "cash-event-2", eventType: "ReturnRecorded" as const, payload: { ...sale.payload, isReturn: true, revenueDeltaKopecks: -90000 } };
assert.equal(service.applyCashEvent(returned).status, "applied");
assert.equal(database.query<{ remaining_package_milli: number }>("SELECT remaining_package_milli FROM inventory_lots WHERE id=?", [opening.lotIds[0]])[0].remaining_package_milli, 8000);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-1'")[0].quantity_minor, 15000);
const writeOff=service.writeOff({productId:"p-1",quantityPackageMilli:1000,reason:"damaged",actorId:"u-admin"});
assert.ok(writeOff.costKopecks>0);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-1'")[0].quantity_minor, 13750);
assert.throws(()=>service.adjust({productId:"p-1",deltaPackageMilli:1000,reason:"count",actorId:"u-admin"}),/ADJUSTMENT_COST_REQUIRED/);
service.adjust({productId:"p-1",deltaPackageMilli:1000,totalCostKopecks:100000,reason:"count",actorId:"u-admin"});
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-1'")[0].quantity_minor, 15000);
assert.deepEqual(new Set(database.query<{event_type:string}>("SELECT event_type FROM domain_outbox").map((row)=>row.event_type)),new Set(["SupplyAccepted","StockChanged","LotConsumed","CostRecognized","ProductProfitabilityUpdated"]));

assert.deepEqual(allocateDeliveryByMass(5_000_000, [
  { productId: "p-1", packageCount: 20, packageMassGrams: 1000, purchaseCostKopecks: 100_000 },
  { productId: "p-2", packageCount: 20, packageMassGrams: 1500, purchaseCostKopecks: 100_000 }
]), [2_000_000, 3_000_000]);
assert.equal(allocateDeliveryByMass(101, [
  { productId: "p-1", packageCount: 1, packageMassGrams: 1000, purchaseCostKopecks: 1 },
  { productId: "p-2", packageCount: 1, packageMassGrams: 1000, purchaseCostKopecks: 1 }
]).reduce((sum,value)=>sum+value,0),101);

const parsedRows=await parseSupplyFile("supply.csv","Артикул;Наименование;Упаковок;Масса упаковки;Стоимость\nSKU-1;Мармелад;4;1500;12 345,67");
assert.deepEqual(parsedRows,[{sourceName:"Мармелад",sourceArticle:"SKU-1",packageCount:4,packageMassGrams:1500,purchaseCostKopecks:1_234_567}]);
const unknownHeaders="Код поставщика;Описание позиции;Коробки;Вес нетто;Сумма счета\nNEW-1;Новый товар;3;900;1200";
const manualPreview=await inspectSupplyFile("manual.csv",unknownHeaders);
assert.equal(manualPreview.needsMapping,true);
assert.deepEqual(await parseSupplyFile("manual.csv",unknownHeaders,{article:0,name:1,count:2,mass:3,total:4}),[
  {sourceName:"Новый товар",sourceArticle:"NEW-1",packageCount:3,packageMassGrams:900,purchaseCostKopecks:120_000}
]);
const createdFromSupply=service.createCatalogProduct({officialName:"Новый товар",article:"NEW-1",supplierId:"sup-1",inventoryKind:"piece",packageMassGrams:900,actorId:"u-admin"});
assert.equal(service.catalog().find((product)=>product.id===createdFromSupply.id)?.article,"NEW-1");
assert.throws(()=>service.createCatalogProduct({officialName:"Дубль",article:"NEW-1",supplierId:"sup-1",inventoryKind:"piece",packageMassGrams:900,actorId:"u-admin"}),/PRODUCT_ARTICLE_CONFLICT/);

const category=service.createPriceCategory({name:"Новая весовая категория",inventoryKind:"weight",actorId:"u-admin"});
service.assignProductToCategory(category.id,{productId:"p-1",actorId:"u-admin"});
service.addCategoryPrice(category.id,{priceKopecks:199_900,effectiveFrom:"2026-07-27T00:00:00.000Z",actorId:"u-admin"});
assert.equal(service.priceCategory(category.id).products.some((product)=>product.id==="p-1"),true);
assert.equal(service.priceCategory(category.id).prices[0].priceKopecks,199_900);

database.close();
console.log("warehouse module tests passed");
