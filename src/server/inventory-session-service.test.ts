import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandMetadata } from "./command-context";
import { openDatabase } from "./database";
import { InventorySessionService } from "./inventory-session-service";
import { applyMigrations } from "./migrations";
import { createSqliteInventorySessionRepositories } from "./sqlite-inventory-session-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-inventory-session-"));
const database = openDatabase(path.join(directory, "inventory.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller'),('admin','admin');
  INSERT INTO permissions(id,code) VALUES ('inventory:write','inventory:write');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('seller','inventory:write');
  INSERT INTO users(id,status) VALUES ('u-one','active'),('u-two','active'),('u-viewer','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-one','seller'),('u-two','seller'),('u-viewer','admin');
  INSERT INTO products(id,official_name,unit,status,inventory_kind,package_mass_grams) VALUES
    ('p-a','Весовой A','кг','active','weight',500),('p-b','Весовой B','кг','active','weight',250),('p-piece','Штучный','шт','active','piece',NULL);
  INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES
    ('p-a',10000,0,'2026-07-20T00:00:00.000Z'),('p-b',5000,0,'2026-07-20T00:00:00.000Z'),('p-piece',3000,0,'2026-07-20T00:00:00.000Z');
`);

let id = 0;
const service = new InventorySessionService(
  new CommandExecutor(new UnitOfWork(database, createSqliteInventorySessionRepositories), { now: () => "2026-07-20T11:00:00.000Z" }, { resolve: (reference) => reference }),
  { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, createId: (kind) => `${kind}-${++id}` }
);
function metadata(key: string, userId = "u-one"): CommandMetadata {
  return { actorReference: { kind: "user", userId, authenticatedBy: "web_session" }, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
function total(productId: string) { return database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?", [productId])[0].quantity_minor; }

assert.equal(service.start(metadata("forbidden", "u-viewer")).status, 403);
const started = service.start(metadata("start"));
assert.equal(started.status, 201);
assert.deepEqual(service.start(metadata("start")), { ...started, outcome: "replayed" });
assert.equal(service.start(metadata("second", "u-two")).status, 409);
if (!("body" in started)) throw new Error("session response missing");
const session = started.body.session as unknown as { id: string };
const rows = started.body.rows as unknown as Array<{ productId: string; expected: number }>;
assert.equal(rows.length, 2);
assert.equal(rows.some((row) => row.productId === "p-piece"), false);
assert.equal(service.consume(metadata("blocked-consume"), { productId: "p-a", quantity: 1 }).status, 409);
assert.equal(service.close(metadata("wrong-owner", "u-two"), session.id, { rows: rows.map((row) => ({ productId: row.productId, actual: row.expected })) }).status, 403);

const badClose = service.close(metadata("bad-close"), session.id, { rows: rows.map((row) => ({ productId: row.productId, actual: row.productId === "p-a" ? 1.5 : row.expected })) });
assert.equal(badClose.status, 400);
assert.equal(database.query<{ status: string }>("SELECT status FROM inventory_sessions WHERE id=?", [session.id])[0].status, "active");
assert.equal(total("p-a"), 10000);

const closed = service.close(metadata("close"), session.id, { comment: "Еженедельный пересчёт", rows: rows.map((row) => ({ productId: row.productId, actual: row.productId === "p-a" ? 7 : row.expected })) });
assert.equal(closed.status, 200);
assert.deepEqual(service.close(metadata("close"), session.id, { comment: "Еженедельный пересчёт", rows: rows.map((row) => ({ productId: row.productId, actual: row.productId === "p-a" ? 7 : row.expected })) }), { ...closed, outcome: "replayed" });
assert.equal(total("p-a"), 7000);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM consumption_records WHERE product_id='p-a' AND source='inventory'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM stock_operations WHERE product_id='p-a' AND from_location_id IS NULL AND to_location_id IS NULL")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM stock_balances WHERE product_id='p-a'")[0].count, 0);

const consumed = service.consume(metadata("consume"), { productId: "p-piece", quantity: 1, comment: "Использовано", source: "manual" });
assert.equal(consumed.status, 201);
assert.deepEqual(service.consume(metadata("consume"), { productId: "p-piece", quantity: 1, comment: "Использовано", source: "manual" }), { ...consumed, outcome: "replayed" });
assert.equal(total("p-piece"), 2000);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM consumption_records WHERE product_id='p-piece'")[0].count, 1);
assert.equal(service.consume(metadata("consume-conflict"), { productId: "p-piece", quantity: 3 }).status, 409);
assert.equal(total("p-piece"), 2000);
assert.equal(service.adjust(metadata("adjust"), { productId: "p-piece", delta: 2, comment: "Корректировка" }).status, 201);
assert.equal(total("p-piece"), 4000);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("inventory session service tests passed");
