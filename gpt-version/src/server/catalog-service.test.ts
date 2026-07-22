import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CatalogService, type CatalogCommandRepositories } from "./catalog-service";
import { CommandExecutor, type CommandActorResolver, type CommandMetadata } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import { createSqliteCatalogCommandRepositories } from "./sqlite-stock-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-catalog-service-"));
const database = openDatabase(path.join(directory, "catalog.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin'),('seller','seller'),('super_admin','super_admin');
  INSERT INTO permissions(id,code) VALUES ('products:write','products:write');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','products:write'),('super_admin','products:write');
  INSERT INTO users(id,status) VALUES ('u-admin','active'),('u-seller','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin'),('u-seller','seller');
`);

const admin = Object.freeze({ userId: "u-admin" });
const seller = Object.freeze({ userId: "u-seller" });
const resolver: CommandActorResolver = {
  resolve(reference) {
    const userId = reference === admin ? "u-admin" : reference === seller ? "u-seller" : undefined;
    if (!userId) throw new Error("untrusted actor");
    return { kind: "user", userId, authenticatedBy: "web_session" };
  }
};
let id = 0;

function service(factory: (connection: DatabaseContext) => CatalogCommandRepositories = createSqliteCatalogCommandRepositories) {
  return new CatalogService(
    new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-20T08:00:00.000Z" }, resolver),
    { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, createId: (kind) => `${kind}-${++id}` }
  );
}

function metadata(key: string, actorReference: unknown = admin): CommandMetadata {
  return { actorReference, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}

const catalog = service();
const location = catalog.saveLocation(metadata("location"), { code: "SHELF-A", name: "Полка A", type: "counter" });
assert.equal(location.status, 201);
assert.deepEqual(catalog.saveLocation(metadata("location"), { code: "SHELF-A", name: "Полка A", type: "counter" }), { ...location, outcome: "replayed" });
assert.equal(catalog.saveLocation(metadata("location-forbidden", seller), { code: "SHELF-B", name: "Полка B", type: "counter" }).status, 403);
if (!("body" in location) || typeof location.body.id !== "string") throw new Error("location missing");
assert.equal(catalog.saveLocation(metadata("location-archive"), { id: location.body.id, code: "SHELF-A", name: "Полка A", type: "counter", status: "archived" }).status, 200);
const groupResult = catalog.createGroup(metadata("group"), { name: "Сладости", inventoryKind: "weight" });
assert.equal(groupResult.status, 201);
assert.deepEqual(catalog.createGroup(metadata("group"), { name: "Сладости", inventoryKind: "weight" }), { ...groupResult, outcome: "replayed" });
assert.equal(catalog.createGroup(metadata("group-forbidden", seller), { name: "Вода", inventoryKind: "piece" }).status, 403);
const manufacturerResult = catalog.createManufacturer(metadata("manufacturer"), { name: "Фабрика" });
assert.equal(manufacturerResult.status, 201);
if (!("body" in groupResult) || typeof groupResult.body.id !== "string" || !("body" in manufacturerResult) || typeof manufacturerResult.body.id !== "string") throw new Error("catalog references missing");
assert.equal(catalog.create(metadata("weight-no-mass"), { officialName: "Весовой", unit: "кг", inventoryKind: "weight", groupId: groupResult.body.id }).status, 400);
const weighted = catalog.create(metadata("weight"), { officialName: "Весовой", unit: "кг", inventoryKind: "weight", packageMassGrams: 500, groupId: groupResult.body.id, manufacturerId: manufacturerResult.body.id, article: "001" });
assert.equal(weighted.status, 201);
if (!("body" in weighted) || typeof weighted.body.id !== "string") throw new Error("weight product missing");
assert.equal(catalog.addPackaging(metadata("packaging"), { productId: weighted.body.id, name: "Пачка 500 г", unitsPerPackage: 1, massGrams: 500, isPrimary: true }).status, 201);
assert.equal(catalog.addPrice(metadata("price"), { groupId: groupResult.body.id, priceKopecks: 19900, priceUnit: "kilogram", effectiveFrom: "2026-07-20T00:00:00.000Z" }).status, 201);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM product_packagings WHERE product_id = ?", [weighted.body.id])[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM product_price_history WHERE group_id = ?", [groupResult.body.id])[0].count, 1);
const input = {
  officialName: "Мармелад",
  localName: "Мармелад весовой",
  unit: "кг" as const,
  inventoryKind: "weight" as const,
  packageMassGrams: 500,
  category: "Сладости",
  lowStockThreshold: 1.25,
  identifiers: [{ type: "barcode" as const, value: "04601234567890" }]
};
assert.equal(catalog.create(metadata("forbidden", seller), input).status, 403);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM products WHERE official_name='Мармелад'")[0].count, 0);

const created = catalog.create(metadata("create"), input);
assert.equal(created.outcome, "executed");
assert.equal(created.status, 201);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM products WHERE official_name='Мармелад'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE entity_type='product' AND action='create' AND entity_id = (SELECT id FROM products WHERE official_name='Мармелад')")[0].count, 1);
assert.deepEqual(catalog.create(metadata("create"), input), { ...created, outcome: "replayed" });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM products WHERE official_name='Мармелад'")[0].count, 1);
assert.equal(catalog.create(metadata("create", admin), { ...input, officialName: "Другое" }).status, 409);
assert.equal(catalog.create(metadata("duplicate-barcode"), { ...input, officialName: "Другое" }).status, 409);

if (!("body" in created) || typeof created.body.id !== "string") throw new Error("created product id missing");
const updated = catalog.update(metadata("update"), { productId: created.body.id, status: "archived", category: "Архив" });
assert.equal(updated.status, 200);
assert.equal(database.query<{ status: string }>("SELECT status FROM products WHERE id = ?", [created.body.id])[0].status, "archived");
assert.deepEqual(catalog.update(metadata("update"), { productId: created.body.id, status: "archived", category: "Архив" }), { ...updated, outcome: "replayed" });

const faulting = service((connection) => {
  const repositories = createSqliteCatalogCommandRepositories(connection);
  return { ...repositories, audit: { append() { throw new Error("audit fault"); } } };
});
assert.throws(() => faulting.create(metadata("rollback"), { ...input, officialName: "Rollback", identifiers: [] }), /transaction/i);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='rollback'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM products WHERE official_name='Rollback'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("catalog service tests passed");
