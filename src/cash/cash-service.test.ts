import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/database";
import { applyMigrations } from "../server/migrations";
import { CashService } from "./cash-service";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-cash-service-"));
const database = openDatabase(path.join(root, "cash.sqlite"));
applyMigrations(database, path.resolve("src/cash/migrations"));
database.execute("INSERT INTO cash_external_items(nomenclature_uuid,name,first_seen_at,last_seen_at) VALUES ('uuid-1','Мармелад','2026-07-27','2026-07-27')");

const delivered: string[] = [];
const service = new CashService(database, {
  async listOrders() {
    return [{
      Key: "sale-1", ClosedWTZ: "2026-07-27 10:00:00", Updated: "2026-07-27 10:00:01", TotalPrice: 900,
      Payments: [{ FiscalNumber: "1" }],
      SaleNomenclatures: [{ Key: "line-1", NomenclatureUUID: "uuid-1", Name: "Мармелад", Quantity: 0.625, TotalPrice: 900, TotalDiscount: 0 }]
    }];
  }
}, {
  pointId: 1, timezone: "Asia/Vladivostok", overlapMinutes: 30, initialLookbackHours: 24,
  coreBaseUrl: "http://core.test", internalSecret: "internal-secret-at-least-32-bytes",
  now: () => new Date("2026-07-27T00:00:00.000Z"),
  fetcher: async (url, init) => {
    if (String(url).includes("/internal/v1/catalog/products/")) {
      return new Response(JSON.stringify({ id: "p-1", status: "active", inventoryKind: "weight" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    delivered.push(String(init?.body));
    return new Response(JSON.stringify({ eventId: JSON.parse(String(init?.body)).eventId, status: "applied" }), { status: 200, headers: { "content-type": "application/json" } });
  }
});
service.saveMapping({ nomenclatureUuid: "uuid-1", productId: "p-1", packageMassGrams: 1250, inventoryKind: "weight", actorId: "u-admin", idempotencyKey: "map-1" });
assert.equal((await service.synchronize()).ordersChanged, 1);
assert.equal(await service.dispatchPending(), 1);
assert.equal(delivered.length, 1);
const event = JSON.parse(delivered[0]) as { eventType: string; payload: { quantityPackageMilli: number } };
assert.equal(event.eventType, "SaleStockDelta");
assert.equal(event.payload.quantityPackageMilli, 500);
await service.validateMapping({ productId: "p-1", inventoryKind: "weight" });
await assert.rejects(() => service.validateMapping({ productId: "p-1", inventoryKind: "piece" }), { message: "MAPPING_INVENTORY_KIND_MISMATCH" });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name IN ('products','users','inventory_balances')")[0].count, 0);
database.close();
console.log("cash service tests passed");
