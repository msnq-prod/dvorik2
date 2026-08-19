import { closeDatabase, createBackup, db, ensureDatabaseReady, executeDatabaseSql } from "./store";
import { inspectMigrations } from "./migrations";
import { openDatabase } from "./database";
import { loadRuntimeConfig } from "./config";
import { buildNormalizedStateSql, inspectLegacyState } from "./state-migration";

try {
  if (process.argv.includes("--dry-run")) {
    const config = loadRuntimeConfig();
    const database = openDatabase(config.sqliteFile);
    try { console.log(JSON.stringify({ dryRun: true, ...inspectMigrations(database, undefined, { recordLegacyChecksums: false }) }, null, 2)); } finally { database.close(); }
    process.exit(0);
  }
  ensureDatabaseReady();
  const report = inspectLegacyState(db);
  console.log(JSON.stringify({ migrations: "applied", report }, null, 2));

  if (process.argv.includes("--convert-state")) {
    if (report.conflicts.length) process.exitCode = 1;
    else {
      const backup = createBackup();
      executeDatabaseSql(buildNormalizedStateSql(db));
      console.log(JSON.stringify({ converted: true, backup }, null, 2));
    }
  }
} finally {
  closeDatabase();
}
