import path from "node:path";
import { openDatabase } from "./database";
import { runSqliteBackupJob } from "./sqlite-backup";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

function integer(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

const databasePath = required("DVORIK_SQLITE_FILE");
const backupDirectory = required("DVORIK_BACKUP_DIR");
const mediaDirectory = process.env.DVORIK_MEDIA_DIR?.trim() ? path.resolve(process.env.DVORIK_MEDIA_DIR) : undefined;
const database = openDatabase(databasePath, { fileMustExist: true });

try {
  const result = runSqliteBackupJob({
    database,
    backupDirectory,
    ...(mediaDirectory ? { mediaDirectory } : {}),
    retentionDays: integer("DVORIK_BACKUP_RETENTION_DAYS", 31),
    minimumFreeBytes: integer("DVORIK_BACKUP_MIN_FREE_BYTES", 0)
  });
  process.stdout.write(`${JSON.stringify({ event: "backup_job_succeeded", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "backup_job_failed", message: error instanceof Error ? error.message : "Unknown error" })}\n`);
  process.exitCode = 1;
} finally {
  database.close();
}
