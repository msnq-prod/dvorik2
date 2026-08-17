import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyMigrations } from "./migrations";
import { createSeedState } from "./store";
import { buildNormalizedStateSql, inspectLegacyState } from "./state-migration";
import { openDatabase } from "./database";

const state = createSeedState();
state.shifts[0].start = "08:30";
state.shifts[0].end = "17:15";
state.notifications.push({ id: "notification-1", channel: "webapp", userId: "u-seller", type: "test", payload: { message: "ok" }, read: false, createdAt: "2026-07-12T00:00:00.000Z" });
state.notifications.push({ id: "notification-telegram", channel: "telegram", userId: "u-seller", type: "test", payload: { message: "sent" }, read: true, createdAt: "2026-07-12T00:30:00.000Z" });
state.outbox.push({ id: "outbox-processing", channel: "telegram", userId: "u-seller", type: "test", payload: { message: "retry" }, status: "processing", attemptCount: 9, availableAt: "2026-07-12T00:00:00.000Z", createdAt: "2026-07-12T00:00:00.000Z" });
state.swaps.push({ id: "swap-legacy", fromShiftId: "shift-1", fromUserId: "u-seller", toUserId: "u-admin", status: "pending", createdAt: "2026-07-12T00:00:00.000Z" });
state.imports.push({ id: "import-legacy", status: "previewed", fileName: "legacy.csv", hash: "legacy-hash", rows: [], createdAt: "2026-07-12T01:00:00.000Z" });
state.audit.push({ id: "audit-legacy", actorId: "u-admin", entity: "test", entityId: "1", action: "create", changes: {}, createdAt: "2026-07-12T02:00:00.000Z" });
state.idempotency["test:key"] = { ok: true };
const report = inspectLegacyState(state);
assert.equal(report.conflicts.length, 0);
assert.equal(report.counts.productIdentifiers, state.products.reduce((sum, product) => sum + product.identifiers.length, 0));

const invalid = structuredClone(state);
invalid.products[1].identifiers.push({ ...invalid.products[0].identifiers[1], id: "duplicate-barcode", productId: invalid.products[1].id });
assert.match(inspectLegacyState(invalid).conflicts.join("\n"), /barcode/);
assert.throws(() => buildNormalizedStateSql(invalid), /State migration blocked/);

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-state-convert-")), "dvorik.sqlite");
const database = openDatabase(file);
applyMigrations(database);
database.executeScript(buildNormalizedStateSql(state));
const count = (table: string) => database.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`)[0].count;
assert.equal(count("users"), state.users.length);
assert.equal(count("products"), state.products.length);
assert.equal(count("product_identifiers"), report.counts.productIdentifiers);
assert.equal(count("stock_balances"), state.balances.length);
assert.equal(count("stock_operations"), state.operations.length);
assert.equal(count("shifts"), state.shifts.length);
assert.equal(count("shift_assignments"), 2);
assert.deepEqual(database.query<{ start_time: string; end_time: string }>("SELECT start_time, end_time FROM shifts WHERE id = ?", ["shift-1"]), [{ start_time: "08:30", end_time: "17:15" }]);
assert.equal(count("webapp_notifications"), 1);
assert.equal(database.query<{ payload_json: string }>("SELECT payload_json FROM webapp_notifications WHERE id = ?", ["notification-1"])[0].payload_json, JSON.stringify({ schemaVersion: 1, value: { message: "ok" } }));
assert.equal(database.query<{ updated_at: string }>("SELECT updated_at FROM outbox_messages WHERE id = ?", ["notification-telegram"])[0].updated_at, "2026-07-12T00:30:00.000Z");
assert.deepEqual(database.query<{ status: string; max_attempts: number; last_error_code: string }>("SELECT status, max_attempts, last_error_code FROM outbox_messages WHERE id = ?", ["outbox-processing"]), [{ status: "pending", max_attempts: 9, last_error_code: "RECOVERED_LEGACY_PROCESSING" }]);
assert.deepEqual(database.query<{ status: string; source_shift_version: number; resolved_at: string; updated_at: string }>(
  "SELECT status,source_shift_version,resolved_at,updated_at FROM shift_swap_requests WHERE id = ?",
  ["swap-legacy"]
), [{ status: "expired", source_shift_version: 0, resolved_at: "2026-07-12T00:00:00.000Z", updated_at: "2026-07-12T00:00:00.000Z" }]);
assert.equal(database.query<{ updated_at: string }>("SELECT updated_at FROM imports WHERE id = ?", ["import-legacy"])[0].updated_at, "2026-07-12T01:00:00.000Z");
assert.equal(database.query<{ updated_at: string }>("SELECT updated_at FROM audit_entries WHERE id = ?", ["audit-legacy"])[0].updated_at, "2026-07-12T02:00:00.000Z");
assert.notEqual(database.query<{ updated_at: string }>("SELECT updated_at FROM idempotency_keys WHERE scope = ? AND key = ?", ["test", "key"])[0].updated_at, "1970-01-01T00:00:00.000Z");
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id = ? AND location_id = ?", ["p-1", "loc-main"])[0].quantity_minor, 8_000);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_operations WHERE id = ?", ["op-seed-1"])[0].quantity_minor, 8_000);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id = ?", ["p-1"])[0].quantity_minor, 10_000);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM role_permissions WHERE role_id='admin' AND permission_id='saby:manage'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM role_permissions WHERE role_id='super_admin' AND permission_id='saby:manage'")[0].count, 1);
assert.equal(database.query<{ low_stock_threshold_minor: number }>("SELECT low_stock_threshold_minor FROM products WHERE id = ?", ["p-1"])[0].low_stock_threshold_minor, 3_000);
assert.throws(() => database.execute("UPDATE stock_balances SET quantity = ?, quantity_minor = ? WHERE product_id = ? AND location_id = ?", [0.0004, 0, "p-1", "loc-main"]), /SQLite execute failed/);
assert.throws(() => database.execute("INSERT INTO products(id, official_name, unit, low_stock_threshold, low_stock_threshold_minor) VALUES (?, ?, ?, ?, ?)", ["overprecision", "Overprecision", "кг", 1.000001, 1000]), /SQLite execute failed/);
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
database.execute("INSERT INTO sessions(id,user_id,method,expires_at,created_at,token_hash,version,updated_at) VALUES (?,?,?,?,?,?,?,?)", [
  "runtime-session", "u-admin", "telegram", "2026-07-13T00:00:00.000Z", "2026-07-12T00:00:00.000Z",
  "hmac-sha256:runtime", 0, "2026-07-12T00:00:00.000Z"
]);
database.execute("INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,changes_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", [
  "runtime-session-audit", "u-admin", "session", "runtime-session", "rotate", "{}",
  "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z"
]);
database.executeScript(buildNormalizedStateSql(state, { preserveSessions: true }));
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM sessions WHERE id='runtime-session'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE id='runtime-session-audit'")[0].count, 1);
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
database.execute("INSERT INTO users(id, telegram_user_id, first_name, status, version) VALUES (?, ?, ?, ?, ?)", ["sql-only-user", "999001", "SQL", "active", 3]);
database.execute("INSERT INTO user_roles(user_id, role_id, assigned_at) VALUES (?, ?, ?)", ["sql-only-user", "seller", "2026-07-12T03:00:00.000Z"]);
database.execute("INSERT INTO sessions(id,user_id,method,expires_at,created_at,token_hash,version,updated_at) VALUES (?,?,?,?,?,?,?,?)", [
  "sql-only-session", "sql-only-user", "telegram", "2026-07-13T03:00:00.000Z", "2026-07-12T03:00:00.000Z",
  "hmac-sha256:sql-only", 0, "2026-07-12T03:00:00.000Z"
]);
database.execute("INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,idempotency_key,max_attempts,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [
  "sql-only-outbox", "telegram", "sql-only-user", "identity_access_changed", JSON.stringify({ schemaVersion: 1, value: { text: "changed" } }),
  "pending", "identity:sql-only", 8, "2026-07-12T03:00:00.000Z", "2026-07-12T03:00:00.000Z"
]);
database.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,response_status,response_json,created_at,completed_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [
  "identity.user.update", "sql-only-command", "sha256:sql-only", "completed", 200,
  JSON.stringify({ schemaVersion: 1, value: { ok: true } }), "2026-07-12T03:00:00.000Z", "2026-07-12T03:00:00.000Z", 1, "2026-07-12T03:00:00.000Z"
]);
database.executeScript(buildNormalizedStateSql(state, {
  preserveSessions: true,
  preserveIdentity: true,
  preserveCommandTables: true
}));
assert.deepEqual(database.query<{ status: string; version: number }>("SELECT status, version FROM users WHERE id='sql-only-user'"), [{ status: "active", version: 3 }]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM sessions WHERE id='sql-only-session'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE id='sql-only-outbox'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE scope='identity.user.update' AND key='sql-only-command'")[0].count, 1);
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
const emptyUsersState = structuredClone(state);
emptyUsersState.users = [];
emptyUsersState.sessions = [];
emptyUsersState.operations = [];
emptyUsersState.shifts = [];
emptyUsersState.swaps = [];
emptyUsersState.audit = [];
emptyUsersState.notifications = [];
emptyUsersState.outbox = [];
emptyUsersState.labelJobs = [];
database.executeScript(buildNormalizedStateSql(emptyUsersState, { preserveSessions: true }));
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM sessions")[0].count, 0);
assert.equal(database.query<{ actor_id: string | null }>("SELECT actor_id FROM audit_entries WHERE id='runtime-session-audit'")[0].actor_id, null);
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
database.executeScript(buildNormalizedStateSql(state));
assert.equal(count("products"), state.products.length);
database.close();

console.log("state migration tests passed");
