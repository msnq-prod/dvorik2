import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { normalizeSabyOrder, SabySyncService } from "./saby-sync-service";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-saby-sync-"));
const database = openDatabase(path.join(root, "database.sqlite"));
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin');
  INSERT INTO users(id,first_name,status,created_at,updated_at,version) VALUES ('u-admin','Admin','active','2026-07-21T00:00:00.000Z','2026-07-21T00:00:00.000Z',0);
  INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES ('u-admin','admin','2026-07-21T00:00:00.000Z');
  INSERT INTO products(id,official_name,unit,status,inventory_kind,package_mass_grams,article,created_at,updated_at) VALUES
    ('piece','Piece','шт','active','piece',NULL,'','2026-07-21T00:00:00.000Z','2026-07-21T00:00:00.000Z'),
    ('weight','Weight','шт','active','weight',500,'', '2026-07-21T00:00:00.000Z','2026-07-21T00:00:00.000Z');
  INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES
    ('piece',10000,0,'2026-07-21T00:00:00.000Z'),('weight',5000,0,'2026-07-21T00:00:00.000Z');
`);

let now = new Date("2026-07-21T01:00:00.000Z");
let nextOrders: Record<string, unknown>[] = [];
const service = new SabySyncService(database, { listOrders: async () => nextOrders }, { pointId: 55, timezone: "Asia/Vladivostok", overlapMinutes: 30, initialLookbackHours: 24, now: () => now });
const sale = (overrides: Record<string, unknown> = {}) => ({
  Key: "sale-1", Sale: 1, ClosedWTZ: "2026-07-21 10:00:00", Updated: "2026-07-21 10:01:00", TotalPrice: 180,
  Payments: [{ Nonfiscal: false, ClosedWTZ: "2026-07-21 10:00:00", FiscalNumber: "100" }],
  SaleNomenclatures: [{ Key: "line-1", NomenclatureUUID: "uuid-piece", Name: "External piece", Barcode: "4601", NomenclatureNumber: "A1", Quantity: 2, TotalPrice: 180, TotalDiscount: 20 }],
  ...overrides
});

assert.equal(normalizeSabyOrder(sale(), 55).totalKopecks, 18000);
nextOrders = [sale()];
assert.equal((await service.synchronize()).ordersChanged, 1);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='piece'")[0].quantity_minor, 10000);
assert.equal(database.query<{ total: number }>("SELECT sum(revenue_delta_kopecks) total FROM saby_sale_deltas")[0].total, 18000);
assert.equal(service.listMappings()[0].productId, null);
assert.deepEqual(service.saveMapping({ uuid: "uuid-piece", productId: "piece", actorId: "u-admin", idempotencyKey: "map-piece" }), { nomenclatureUuid: "uuid-piece", productId: "piece" });
assert.deepEqual(service.saveMapping({ uuid: "uuid-piece", productId: "piece", actorId: "u-admin", idempotencyKey: "map-piece" }), { nomenclatureUuid: "uuid-piece", productId: "piece" });
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='piece'")[0].quantity_minor, 8000);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM stock_operations WHERE idempotency_key LIKE 'saby:%'")[0].count, 1);

assert.equal((await service.synchronize()).ordersChanged, 0);
nextOrders = [sale({ Updated: "2026-07-21 10:02:00", TotalPrice: 270, SaleNomenclatures: [{ Key: "line-1", NomenclatureUUID: "uuid-piece", Name: "External piece", Quantity: 3, TotalPrice: 270, TotalDiscount: 30 }] })];
assert.equal((await service.synchronize()).ordersChanged, 1);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='piece'")[0].quantity_minor, 7000);
assert.equal(database.query<{ total: number }>("SELECT sum(revenue_delta_kopecks) total FROM saby_sale_deltas")[0].total, 27000);

nextOrders = [sale({ Deleted: true, Updated: "2026-07-21 10:03:00", TotalPrice: 270, SaleNomenclatures: [{ Key: "line-1", NomenclatureUUID: "uuid-piece", Name: "External piece", Quantity: 3, TotalPrice: 270 }] })];
await service.synchronize();
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='piece'")[0].quantity_minor, 10000);
assert.equal(database.query<{ total: number }>("SELECT sum(revenue_delta_kopecks) total FROM saby_sale_deltas")[0].total, 0);

nextOrders = [sale({ Key: "return-1", Sale: 2, Return: true, ReturnSaleKey: "sale-1", Updated: "2026-07-21 10:04:00" })];
await service.synchronize();
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='piece'")[0].quantity_minor, 12000);
assert.equal(database.query<{ total: number }>("SELECT sum(revenue_delta_kopecks) total FROM saby_sale_deltas")[0].total, -18000);

nextOrders = [sale({ Key: "weight-sale", Sale: 3, Updated: "2026-07-21 10:05:00", SaleNomenclatures: [{ Key: "weight-line", NomenclatureUUID: "uuid-weight", Name: "Weight", Quantity: 1, TotalPrice: 180 }] })];
await service.synchronize();
service.saveMapping({ uuid: "uuid-weight", productId: "weight", actorId: "u-admin", idempotencyKey: "map-weight" });
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='weight'")[0].quantity_minor, 5000);

const signal = service.recordWebhookSignal({ Key: "signal-only" });
assert.equal(signal.accepted, true);
assert.equal(service.hasPendingSignal(), true);
nextOrders = [];
await service.synchronize();
assert.equal(service.hasPendingSignal(), false);

now = new Date("2026-07-21T02:00:00.000Z");
assert.throws(() => service.saveMapping({ uuid: "uuid-piece", productId: "weight", actorId: "u-admin", idempotencyKey: "map-piece" }), /IDEMPOTENCY_CONFLICT/);
database.close();
console.log("saby sync service tests passed");
