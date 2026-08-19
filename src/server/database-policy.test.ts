import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { checkDatabaseReadiness, DatabaseError, openDatabase, type DatabaseConnectionPolicy } from "./database";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-database-policy-"));
const file = path.join(directory, "policy.sqlite");
const policy: DatabaseConnectionPolicy = { foreignKeys: true, journalMode: "WAL", busyTimeoutMs: 200, synchronous: "NORMAL" };
const first = openDatabase(file, { policy });
const second = openDatabase(file, { policy });

for (const database of [first, second]) {
  assert.equal(database.query<{ foreign_keys: number }>("PRAGMA foreign_keys")[0].foreign_keys, 1);
  assert.equal(database.query<{ journal_mode: string }>("PRAGMA journal_mode")[0].journal_mode.toLowerCase(), "wal");
  assert.equal(database.query<{ synchronous: number }>("PRAGMA synchronous")[0].synchronous, 1);
  assert.equal(database.query<{ timeout: number }>("PRAGMA busy_timeout")[0].timeout, policy.busyTimeoutMs);
}

first.executeScript("CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE children(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id));");
assert.throws(() => second.execute("INSERT INTO children(id, parent_id) VALUES (?, ?)", [1, 999]), (error) => error instanceof DatabaseError && error.causeCode === "SQLITE_CONSTRAINT_FOREIGNKEY");
assert.equal(first.query<{ count: number }>("SELECT count(*) AS count FROM children")[0].count, 0);

first.executeScript("CREATE TABLE writer_probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
first.transaction((transaction) => {
  transaction.execute("INSERT INTO writer_probe(id, value) VALUES (?, ?)", [1, "first"]);
  const started = performance.now();
  assert.throws(() => second.execute("INSERT INTO writer_probe(id, value) VALUES (?, ?)", [2, "second"]), (error) => error instanceof DatabaseError && error.causeCode === "SQLITE_BUSY");
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= policy.busyTimeoutMs * 0.8, `busy wait was ${elapsed}ms`);
});

first.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); INSERT INTO schema_migrations VALUES (2, datetime('now'));");
assert.deepEqual(checkDatabaseReadiness(first, [1, 2], ["schema_migrations", "writer_probe"]), { ready: true, schemaVersions: [1, 2] });
assert.deepEqual(checkDatabaseReadiness(first, [1, 2], ["schema_migrations", "products"]), { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions: [1, 2] });
first.execute("DELETE FROM schema_migrations WHERE version = 2");
assert.deepEqual(checkDatabaseReadiness(first, [1, 2], ["schema_migrations"]), { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions: [1] });
first.execute("INSERT INTO schema_migrations VALUES (?, datetime('now'))", [3]);
assert.deepEqual(checkDatabaseReadiness(first, [1, 2], ["schema_migrations"]), { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions: [1, 3] });

second.close();
first.close();
const readonly = openDatabase(file, { readonly: true, fileMustExist: true, policy });
assert.deepEqual(checkDatabaseReadiness(readonly, [1, 3], ["schema_migrations"]), { ready: false, code: "DATABASE_UNAVAILABLE" });
readonly.close();
const reopened = openDatabase(file, { policy });
assert.equal(reopened.query<{ integrity_check: string }>("PRAGMA integrity_check")[0].integrity_check, "ok");
reopened.close();
console.log("database policy tests passed");
