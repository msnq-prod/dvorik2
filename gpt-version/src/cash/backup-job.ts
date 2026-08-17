import path from "node:path";
import { openDatabase } from "../server/database";
import { runSqliteBackupJob } from "../server/sqlite-backup";

const databasePath = process.env.DVORIK_CASH_SQLITE_FILE?.trim();
const backupDirectory = process.env.DVORIK_CASH_BACKUP_DIR?.trim();
if (!databasePath || !backupDirectory) throw new Error("DVORIK_CASH_SQLITE_FILE and DVORIK_CASH_BACKUP_DIR are required");
const database = openDatabase(path.resolve(databasePath), { fileMustExist: true });
try {
  const result = runSqliteBackupJob({
    database,
    backupDirectory: path.resolve(backupDirectory),
    retentionDays: Number(process.env.DVORIK_CASH_BACKUP_RETENTION_DAYS || 31)
  });
  process.stdout.write(`${JSON.stringify({ event: "cash_backup_job_succeeded", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "cash_backup_job_failed", message: error instanceof Error ? error.message : "Unknown error" })}\n`);
  process.exitCode = 1;
} finally {
  database.close();
}
