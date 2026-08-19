import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseAdapter } from "./database";
import { openDatabase } from "./database";

export type BackupManifest = Readonly<{
  schemaVersion: 1;
  createdAt: string;
  files: readonly Readonly<{ path: string; bytes: number; sha256: string }>[];
}>;

function sha256(filename: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function filesUnder(root: string, prefix = ""): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute, relative) : entry.isFile() ? [relative] : [];
  });
}

function sqliteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function manifestFor(bundlePath: string, createdAt: string): BackupManifest {
  const files = filesUnder(bundlePath)
    .filter((relative) => relative !== "manifest.json")
    .sort()
    .map((relative) => {
      const filename = path.join(bundlePath, relative);
      return { path: relative, bytes: fs.statSync(filename).size, sha256: sha256(filename) };
    });
  return { schemaVersion: 1, createdAt, files };
}

function readManifest(bundlePath: string): BackupManifest {
  const parsed = JSON.parse(fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf8")) as BackupManifest;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) || typeof parsed.createdAt !== "string") throw new Error("Invalid backup manifest");
  return parsed;
}

export function verifySqliteBackupBundle(bundlePath: string) {
  const manifest = readManifest(bundlePath);
  if (!manifest.files.some((file) => file.path === "database.sqlite")) throw new Error("Backup database is missing");
  for (const file of manifest.files) {
    if (!/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(file.path)) throw new Error("Invalid backup manifest path");
    const filename = path.join(bundlePath, file.path);
    if (!fs.existsSync(filename) || fs.statSync(filename).size !== file.bytes || sha256(filename) !== file.sha256) throw new Error(`Backup integrity mismatch: ${file.path}`);
  }
  const database = openDatabase(path.join(bundlePath, "database.sqlite"));
  try {
    const integrity = database.query<{ integrity_check: string }>("PRAGMA integrity_check")[0]?.integrity_check;
    if (integrity !== "ok") throw new Error("SQLite integrity check failed");
    const migrations = database.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
    if (!migrations.length) throw new Error("Backup schema migrations are missing");
    return { manifest, migrations };
  } finally {
    database.close();
  }
}

export function listSqliteBackupBundles(backupDirectory: string) {
  if (!fs.existsSync(backupDirectory)) return [];
  return fs.readdirSync(backupDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^dvorik-backup-[0-9TZ-]+$/.test(entry.name))
    .map((entry) => {
      const bundlePath = path.join(backupDirectory, entry.name);
      const manifest = readManifest(bundlePath);
      return { name: entry.name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createSqliteBackupBundle(input: Readonly<{
  database: DatabaseAdapter;
  backupDirectory: string;
  mediaDirectory?: string;
  now?: Date;
}>) {
  const now = input.now ?? new Date();
  const name = `dvorik-backup-${now.toISOString().replace(/[:.]/g, "-")}`;
  const bundlePath = path.join(input.backupDirectory, name);
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  fs.mkdirSync(bundlePath, { recursive: false });
  const databasePath = path.join(bundlePath, "database.sqlite");
  try {
    input.database.execute(`VACUUM INTO ${sqliteLiteral(databasePath)}`);
    const snapshot = openDatabase(databasePath);
    snapshot.close();
    if (input.mediaDirectory && fs.existsSync(input.mediaDirectory)) fs.cpSync(input.mediaDirectory, path.join(bundlePath, "media"), { recursive: true, errorOnExist: true });
    const manifest = manifestFor(bundlePath, now.toISOString());
    fs.writeFileSync(path.join(bundlePath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    verifySqliteBackupBundle(bundlePath);
    return { name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
  } catch (error) {
    fs.rmSync(bundlePath, { recursive: true, force: true });
    throw error;
  }
}

export function runSqliteBackupJob(input: Readonly<{
  database: DatabaseAdapter;
  backupDirectory: string;
  mediaDirectory?: string;
  now?: Date;
  retentionDays?: number;
  minimumFreeBytes?: number;
}>) {
  const now = input.now ?? new Date();
  const retentionDays = input.retentionDays ?? 31;
  const minimumFreeBytes = input.minimumFreeBytes ?? 0;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error("Invalid backup retention days");
  if (!Number.isSafeInteger(minimumFreeBytes) || minimumFreeBytes < 0) throw new Error("Invalid backup minimum free bytes");
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  const stats = fs.statfsSync(input.backupDirectory);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  if (freeBytes < minimumFreeBytes) throw new Error("Insufficient free space for backup");
  const backup = createSqliteBackupBundle({
    database: input.database,
    backupDirectory: input.backupDirectory,
    ...(input.mediaDirectory ? { mediaDirectory: input.mediaDirectory } : {}),
    now
  });
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const candidate of listSqliteBackupBundles(input.backupDirectory)) {
    if (candidate.name === backup.name || new Date(candidate.createdAt).getTime() >= cutoff) continue;
    const resolved = path.resolve(candidate.path);
    if (path.dirname(resolved) !== path.resolve(input.backupDirectory)) throw new Error("Backup retention path escaped backup directory");
    fs.rmSync(resolved, { recursive: true, force: false });
    removed.push(candidate.name);
  }
  return { backup, removed, freeBytes, retentionDays } as const;
}

export function restoreSqliteBackupBundle(input: Readonly<{
  bundlePath: string;
  databasePath: string;
  mediaDirectory?: string;
}>) {
  const verified = verifySqliteBackupBundle(input.bundlePath);
  if (fs.existsSync(input.databasePath)) throw new Error("Restore database path already exists");
  fs.mkdirSync(path.dirname(input.databasePath), { recursive: true });
  fs.copyFileSync(path.join(input.bundlePath, "database.sqlite"), input.databasePath, fs.constants.COPYFILE_EXCL);
  if (input.mediaDirectory && fs.existsSync(path.join(input.bundlePath, "media"))) {
    if (fs.existsSync(input.mediaDirectory)) throw new Error("Restore media path already exists");
    fs.mkdirSync(path.dirname(input.mediaDirectory), { recursive: true });
    fs.cpSync(path.join(input.bundlePath, "media"), input.mediaDirectory, { recursive: true, errorOnExist: true });
  }
  return { restoredAt: new Date().toISOString(), migrations: verified.migrations };
}
