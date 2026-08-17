import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations, inspectMigrations } from "./migrations";
import { createSqliteBackupBundle, restoreSqliteBackupBundle, verifySqliteBackupBundle } from "./sqlite-backup";

for (const rehearsal of ["first", "second"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `dvorik-${rehearsal}-rehearsal-`));
  const sourcePath = path.join(root, "source.sqlite");
  const source = openDatabase(sourcePath);
  source.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
  const dryRun = inspectMigrations(source);
  assert.equal(dryRun.pending.length, 16);
  assert.equal(applyMigrations(source).length, 16);
  assert.equal(inspectMigrations(source).pending.length, 0);
  source.execute("INSERT INTO roles(id,name) VALUES ('seller','seller')");
  const media = path.join(root, "media");
  fs.mkdirSync(media);
  fs.writeFileSync(path.join(media, `${rehearsal}.txt`), rehearsal);
  const backup = createSqliteBackupBundle({ database: source, backupDirectory: path.join(root, "backups"), mediaDirectory: media });
  assert.equal(verifySqliteBackupBundle(backup.path).migrations.length, 17);
  source.execute("INSERT INTO roles(id,name) VALUES ('post-backup','post-backup')");
  source.close();
  const rollbackPath = path.join(root, "rollback.sqlite");
  const rollbackMedia = path.join(root, "rollback-media");
  restoreSqliteBackupBundle({ bundlePath: backup.path, databasePath: rollbackPath, mediaDirectory: rollbackMedia });
  const rollback = openDatabase(rollbackPath);
  assert.deepEqual(rollback.query<{ id: string }>("SELECT id FROM roles ORDER BY id"), [{ id: "seller" }]);
  rollback.close();
  assert.equal(fs.readFileSync(path.join(rollbackMedia, `${rehearsal}.txt`), "utf8"), rehearsal);
}

console.log("production migration/rollback rehearsals passed");
