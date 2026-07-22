import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandMetadata } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import { NotificationPreferenceService, type NotificationPreferenceCommandRepositories } from "./notification-preference-service";
import { createSqliteNotificationPreferenceCommandRepositories } from "./sqlite-stock-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-preferences-"));
const database = openDatabase(path.join(directory, "preferences.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller');
  INSERT INTO users(id,status) VALUES ('u-seller','active'),('u-blocked','blocked');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-seller','seller'),('u-blocked','seller');
`);

function createService(factory: (connection: DatabaseContext) => NotificationPreferenceCommandRepositories = createSqliteNotificationPreferenceCommandRepositories) {
  return new NotificationPreferenceService(
    new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-20T09:00:00.000Z" }, { resolve: (reference) => reference }),
    { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, createId: () => "audit-pref" }
  );
}
function metadata(key: string, userId = "u-seller"): CommandMetadata {
  return { actorReference: { kind: "user", userId, authenticatedBy: "web_session" }, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}

const service = createService();
assert.equal(service.save(metadata("blocked", "u-blocked"), { channel: "telegram", eventType: "stock.zero", deliveryMode: "instant" }).status, 403);
assert.equal(service.save(metadata("bad"), { channel: "email", eventType: "stock.zero", deliveryMode: "instant" }).status, 400);
assert.equal(service.save(metadata("daily"), { channel: "telegram", eventType: "stock.zero", deliveryMode: "daily" }).status, 404);

const saved = service.save(metadata("save"), { channel: "telegram", eventType: "stock.zero", deliveryMode: "instant" });
assert.equal(saved.outcome, "executed");
assert.equal(saved.status, 200);
assert.deepEqual(service.save(metadata("save"), { channel: "telegram", eventType: "stock.zero", deliveryMode: "instant" }), { ...saved, outcome: "replayed" });
assert.deepEqual(service.list("u-seller"), [{ userId: "u-seller", channel: "telegram", eventType: "stock.zero", deliveryMode: "instant" }]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE entity_type='notification_preference'")[0].count, 1);

const faulting = createService((connection) => {
  const repositories = createSqliteNotificationPreferenceCommandRepositories(connection);
  return { ...repositories, audit: { append() { throw new Error("audit fault"); } } };
});
assert.throws(() => faulting.save(metadata("rollback"), { channel: "webapp", eventType: "stock.threshold", deliveryMode: "instant" }), /transaction/i);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM notification_preferences WHERE channel='webapp'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='rollback'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("notification preference service tests passed");
await import("./inventory-reminder-service.test");
