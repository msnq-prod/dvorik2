import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { createSqliteBackupBundle, listSqliteBackupBundles, runSqliteBackupJob, verifySqliteBackupBundle } from "./sqlite-backup";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-backup-job-"));
const backupDirectory = path.join(root, "backups");
const database = openDatabase(path.join(root, "database.sqlite"));
applyMigrations(database);

const old = createSqliteBackupBundle({ database, backupDirectory, now: new Date("2026-05-01T00:00:00.000Z") });
const recent = createSqliteBackupBundle({ database, backupDirectory, now: new Date("2026-07-10T00:00:00.000Z") });
const result = runSqliteBackupJob({ database, backupDirectory, now: new Date("2026-07-21T00:00:00.000Z"), retentionDays: 31 });
assert.deepEqual(result.removed, [old.name]);
assert.equal(fs.existsSync(old.path), false);
assert.equal(fs.existsSync(recent.path), true);
assert.equal(verifySqliteBackupBundle(result.backup.path).migrations.length > 1, true);
assert.equal(listSqliteBackupBundles(backupDirectory).length, 2);
assert.equal(result.freeBytes > 0, true);
assert.throws(() => runSqliteBackupJob({ database, backupDirectory, retentionDays: 0 }), /retention/);
assert.throws(() => runSqliteBackupJob({ database, backupDirectory, minimumFreeBytes: Number.MAX_SAFE_INTEGER }), /free space/);
database.close();
console.log("backup job tests passed");
