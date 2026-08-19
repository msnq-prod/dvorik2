import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyMigrations, inspectMigrations } from "./migrations";
import { openDatabase } from "./database";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-")), "dvorik.sqlite");
const database = openDatabase(file);
const schemaFingerprint = (db: ReturnType<typeof openDatabase>) => db.query<{ type: string; name: string; sql: string | null }>("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");

database.executeScript("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); ");
assert.equal(applyMigrations(database).map((migration) => migration.version).join(","), "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19");
assert.equal(applyMigrations(database).length, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM migration_checksums")[0].count, 18);
assert.equal(database.query<{ versions: string }>("SELECT group_concat(version, ',') AS versions FROM schema_migrations ORDER BY version")[0].versions, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('users','stock_balances','shifts','outbox_messages','audit_entries')")[0].count, 5);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('migration_batches','telegram_updates','webapp_notifications')")[0].count, 3);
for (const [table, columns] of Object.entries({
  users: ["version"],
  sessions: ["token_hash", "version", "updated_at"],
  shifts: ["start_time", "end_time"],
  shift_swap_requests: ["source_shift_version"],
  outbox_messages: ["max_attempts", "lease_owner", "lease_token", "lease_expires_at", "last_error_code", "failed_at", "version", "updated_at"],
  imports: ["source_json", "migration_batch_id", "version", "updated_at"]
  ,products: ["group_id", "manufacturer_id", "inventory_kind", "package_mass_grams", "article"]
})) {
  const actual = new Set(database.query<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((row) => row.name));
  assert.deepEqual(columns.filter((column) => !actual.has(column)), []);
}
database.execute("INSERT INTO users(id, status) VALUES (?, ?)", ["runtime-user", "active"]);
assert.deepEqual(database.query<{ platform_user_id: string; status: string }>("SELECT platform_user_id,status FROM staff_user_snapshots WHERE platform_user_id='runtime-user'"), [{ platform_user_id: "runtime-user", status: "active" }]);
database.execute("UPDATE users SET status='blocked' WHERE id='runtime-user'");
assert.equal(database.query<{ status: string }>("SELECT status FROM staff_user_snapshots WHERE platform_user_id='runtime-user'")[0].status, "blocked");
assert.equal(database.query("PRAGMA foreign_key_list('employee_profiles')").length, 0);
assert.equal(database.query("PRAGMA foreign_key_list('hr_events')").length, 0);
assert.equal(database.query("PRAGMA foreign_key_list('shift_exchange_requests')").length, 0);
assert.throws(() => database.execute("INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?)", ["bad-max", "telegram", "runtime-user", "test", "{}", "pending", 0]), /SQLite execute failed/);
assert.throws(() => database.execute("INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, attempt_count, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["bad-attempts", "telegram", "runtime-user", "test", "{}", "pending", 2, 1]), /SQLite execute failed/);
assert.throws(() => database.execute("INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)", ["bad-lease", "telegram", "runtime-user", "test", "{}", "processing"]), /SQLite execute failed/);
database.execute("INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, lease_owner, lease_token, lease_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["leased", "telegram", "runtime-user", "test", "{}", "processing", "worker", "lease", "2026-07-12T01:00:00.000Z"]);
database.execute("INSERT INTO sessions(id, user_id, method, expires_at, created_at, token_hash) VALUES (?, ?, ?, ?, ?, ?)", ["session-1", "runtime-user", "telegram", "2026-07-13T00:00:00.000Z", "2026-07-12T00:00:00.000Z", "hash"]);
assert.throws(() => database.execute("INSERT INTO sessions(id, user_id, method, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", ["session-unhashed", "runtime-user", "telegram", "2026-07-13T00:00:00.000Z", "2026-07-12T00:00:00.000Z"]), /SQLite execute failed/);
assert.throws(() => database.execute("INSERT INTO sessions(id, user_id, method, expires_at, created_at, token_hash) VALUES (?, ?, ?, ?, ?, ?)", ["session-2", "runtime-user", "telegram", "2026-07-13T00:00:00.000Z", "2026-07-12T00:00:00.000Z", "hash"]), /SQLite execute failed/);
assert.throws(() => database.execute("INSERT INTO webapp_notifications(id, recipient_user_id, type, payload_json, is_read, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["bad-read", "runtime-user", "test", "{}", 1, "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z"]), /SQLite execute failed/);
database.execute("INSERT INTO locations(id, code, name, type, status) VALUES (?, ?, ?, ?, ?)", ["runtime-location", "RUNTIME", "Runtime", "other", "active"]);
database.execute("INSERT INTO products(id, official_name, unit, low_stock_threshold, low_stock_threshold_minor) VALUES (?, ?, ?, ?, ?)", ["runtime-product", "Runtime product", "шт", 1, 1000]);
database.execute("INSERT INTO product_groups(id,name,inventory_kind,created_at,updated_at) VALUES (?,?,?,?,?)", ["weight-group", "Весовые", "weight", "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z"]);
assert.throws(() => database.execute("INSERT INTO products(id,official_name,unit,inventory_kind,group_id) VALUES (?,?,?,?,?)", ["bad-weight", "Bad", "кг", "weight", "weight-group"]), /SQLite execute failed/);
database.execute("INSERT INTO products(id,official_name,unit,inventory_kind,group_id,package_mass_grams) VALUES (?,?,?,?,?,?)", ["weight-product", "Weight", "кг", "weight", "weight-group", 500]);
database.execute("INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES (?,?,?,?,?)", ["runtime-product", "runtime-location", 2, 2000, 1]);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='runtime-product'")[0].quantity_minor, 2000);
database.execute("DELETE FROM inventory_balances WHERE product_id='runtime-product'");
database.execute("INSERT OR IGNORE INTO roles(id, name) VALUES ('admin', 'admin')");
database.execute("DELETE FROM role_permissions WHERE role_id='admin' AND permission_id='saby:manage'");
database.executeScript(fs.readFileSync(path.resolve("src/server/migrations/013_interface_readiness_contracts.sql"), "utf8"));
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='runtime-product'")[0].quantity_minor, 2000);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM role_permissions WHERE role_id='admin' AND permission_id='saby:manage'")[0].count, 1);
database.execute("UPDATE stock_balances SET quantity=1, quantity_minor=1000, version=2 WHERE product_id='runtime-product' AND location_id='runtime-location'");
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='runtime-product'")[0].quantity_minor, 1000);
database.execute("INSERT INTO product_price_history(id,group_id,price_kopecks,price_unit,effective_from,created_at) VALUES (?,?,?,?,?,?)", ["price-1", "weight-group", 19900, "kilogram", "2026-07-12T00:00:00.000Z", "2026-07-12T00:00:00.000Z"]);
assert.throws(() => database.execute("UPDATE product_price_history SET price_kopecks=1 WHERE id='price-1'"), /SQLite execute failed/);
database.execute("INSERT INTO stock_operations(id, type, product_id, to_location_id, quantity, quantity_minor, actor_id) VALUES (?, ?, ?, ?, ?, ?, ?)", ["runtime-original", "receipt", "runtime-product", "runtime-location", 1, 1000, "runtime-user"]);
database.execute("INSERT INTO stock_operations(id, type, product_id, from_location_id, quantity, quantity_minor, actor_id, reversed_operation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["runtime-reversal", "reversal", "runtime-product", "runtime-location", 1, 1000, "runtime-user", "runtime-original"]);
assert.throws(() => database.execute("INSERT INTO stock_operations(id, type, product_id, from_location_id, quantity, quantity_minor, actor_id, reversed_operation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["runtime-reversal-duplicate", "reversal", "runtime-product", "runtime-location", 1, 1000, "runtime-user", "runtime-original"]), /SQLite execute failed/);
database.execute("INSERT INTO schedule_days(id, local_date, location_id, status) VALUES (?, ?, ?, ?)", ["runtime-day", "2026-07-12", "runtime-location", "working"]);
assert.throws(() => database.execute("INSERT INTO shifts(id, schedule_day_id, location_id, local_date, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)", ["bad-time", "runtime-day", "runtime-location", "2026-07-12", "scheduled", "24:00", "23:59"]), /SQLite execute failed/);
database.execute("INSERT INTO users(id, status) VALUES (?, ?)", ["swap-target-a", "active"]);
database.execute("INSERT INTO users(id, status) VALUES (?, ?)", ["swap-target-b", "active"]);
database.execute("INSERT INTO shifts(id, schedule_day_id, location_id, local_date, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)", ["swap-shift", "runtime-day", "runtime-location", "2026-07-12", "scheduled", "08:00", "12:00"]);
database.execute("INSERT INTO shift_assignments(shift_id, user_id) VALUES (?, ?)", ["swap-shift", "runtime-user"]);
database.execute("INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, status) VALUES (?, ?, ?, ?, ?)", ["swap-a", "swap-shift", "runtime-user", "swap-target-a", "pending"]);
database.execute("INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, status) VALUES (?, ?, ?, ?, ?)", ["swap-b", "swap-shift", "runtime-user", "swap-target-b", "pending"]);
assert.throws(() => database.execute("INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, status) VALUES (?, ?, ?, ?, ?)", ["swap-a-duplicate", "swap-shift", "runtime-user", "swap-target-a", "pending"]), /SQLite execute failed/);
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
const freshSchema = schemaFingerprint(database);
database.close();

const checksumDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-checksum-"));
for (const migration of fs.readdirSync(path.resolve("src/server/migrations"))) fs.copyFileSync(path.resolve("src/server/migrations", migration), path.join(checksumDirectory, migration));
const checksumFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-checksum-db-")), "dvorik.sqlite");
const checksumDatabase = openDatabase(checksumFile);
checksumDatabase.executeScript("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); ");
applyMigrations(checksumDatabase, checksumDirectory);
fs.appendFileSync(path.join(checksumDirectory, "002_normalized_schema.sql"), "\n-- mutation\n");
assert.throws(() => inspectMigrations(checksumDatabase, checksumDirectory), /Migration checksum mismatch: 2/);
checksumDatabase.close();

const upgradeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-v3-files-"));
for (const name of ["002_normalized_schema.sql", "003_quantity_minor_units.sql"]) {
  fs.copyFileSync(path.resolve("src/server/migrations", name), path.join(upgradeDirectory, name));
}
const upgradeFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-v3-upgrade-")), "dvorik.sqlite");
const upgradeDatabase = openDatabase(upgradeFile);
upgradeDatabase.executeScript("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); ");
applyMigrations(upgradeDatabase, upgradeDirectory);
upgradeDatabase.execute("INSERT INTO users(id, status) VALUES (?, ?)", ["legacy-user", "active"]);
upgradeDatabase.execute("INSERT INTO users(id, status) VALUES (?, ?)", ["legacy-target", "active"]);
upgradeDatabase.execute("INSERT INTO sessions(id,user_id,method,expires_at,created_at) VALUES (?,?,?,?,?)", ["legacy-raw-session", "legacy-user", "telegram", "2026-07-13T00:00:00.000Z", "2026-07-12T00:00:00.000Z"]);
upgradeDatabase.execute("INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)", ["legacy-processing", "telegram", "legacy-user", "test", "{}", "processing"]);
upgradeDatabase.execute("INSERT INTO locations(id, code, name, type, status) VALUES (?, ?, ?, ?, ?)", ["legacy-location", "LEGACY", "Legacy", "other", "active"]);
upgradeDatabase.execute("INSERT INTO schedule_days(id, local_date, location_id, status) VALUES (?, ?, ?, ?)", ["legacy-day", "2026-07-12", "legacy-location", "working"]);
upgradeDatabase.execute("INSERT INTO shifts(id, schedule_day_id, location_id, local_date, status) VALUES (?, ?, ?, ?, ?)", ["legacy-shift", "legacy-day", "legacy-location", "2026-07-12", "scheduled"]);
upgradeDatabase.execute("INSERT INTO shift_assignments(shift_id, user_id) VALUES (?, ?)", ["legacy-shift", "legacy-user"]);
upgradeDatabase.execute("INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["legacy-pending-swap", "legacy-shift", "legacy-user", "legacy-target", "pending", "2026-07-12T00:00:00.000Z"]);
assert.deepEqual(applyMigrations(upgradeDatabase).map((migration) => migration.version), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
assert.deepEqual(upgradeDatabase.query<{ status: string; last_error_code: string }>("SELECT status, last_error_code FROM outbox_messages WHERE id = ?", ["legacy-processing"]), [{ status: "pending", last_error_code: "RECOVERED_LEGACY_PROCESSING" }]);
assert.equal(upgradeDatabase.query<{ count: number }>("SELECT count(*) count FROM sessions WHERE id='legacy-raw-session'")[0].count, 0);
assert.deepEqual(upgradeDatabase.query<{ status: string; source_shift_version: number; version: number; resolved_at: string }>(
  "SELECT status,source_shift_version,version,resolved_at FROM shift_swap_requests WHERE id='legacy-pending-swap'"
), [{ status: "expired", source_shift_version: 0, version: 1, resolved_at: "2026-07-12T00:00:00.000Z" }]);
assert.deepEqual(schemaFingerprint(upgradeDatabase), freshSchema);
upgradeDatabase.close();

const invalidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-invalid-")), "dvorik.sqlite");
const invalidDatabase = openDatabase(invalidFile);
invalidDatabase.executeScript("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); INSERT INTO schema_migrations VALUES (2, datetime('now'));");
invalidDatabase.executeScript(fs.readFileSync(path.resolve("src/server/migrations/002_normalized_schema.sql"), "utf8"));
invalidDatabase.execute("INSERT INTO products(id, official_name, unit, low_stock_threshold) VALUES (?, ?, ?, ?)", ["invalid-quantity", "Invalid", "кг", 0.0004]);
assert.throws(() => applyMigrations(invalidDatabase), /SQLite execute failed/);
assert.deepEqual(invalidDatabase.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version), [1, 2]);
assert.equal(invalidDatabase.query<{ count: number }>("SELECT count(*) AS count FROM pragma_table_info('products') WHERE name = 'low_stock_threshold_minor'")[0].count, 0);
invalidDatabase.close();

const overprecisionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-overprecision-")), "dvorik.sqlite");
const overprecisionDatabase = openDatabase(overprecisionFile);
overprecisionDatabase.executeScript("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); INSERT INTO schema_migrations VALUES (2, datetime('now'));");
overprecisionDatabase.executeScript(fs.readFileSync(path.resolve("src/server/migrations/002_normalized_schema.sql"), "utf8"));
overprecisionDatabase.execute("INSERT INTO products(id, official_name, unit, low_stock_threshold) VALUES (?, ?, ?, ?)", ["overprecision", "Overprecision", "кг", 1.000001]);
assert.throws(() => applyMigrations(overprecisionDatabase), /SQLite execute failed/);
assert.deepEqual(overprecisionDatabase.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version), [1, 2]);
overprecisionDatabase.close();

const dryRunFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-migrations-dry-run-")), "dvorik.sqlite");
const dryRunDatabase = openDatabase(dryRunFile);
const dryRun = inspectMigrations(dryRunDatabase, undefined, { recordLegacyChecksums: false });
assert.equal(dryRun.pending.length, 18);
assert.equal(dryRunDatabase.query<{ count: number }>("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'migration_checksums')")[0].count, 0);
dryRunDatabase.close();

console.log("migration tests passed");
