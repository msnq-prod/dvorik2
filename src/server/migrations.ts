import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DatabaseAdapter } from "./database";

export type AppliedMigration = {
  version: number;
  name: string;
};

export type PlannedMigration = AppliedMigration & Readonly<{ sha256: string }>;

export type MigrationInspection = {
  applied: PlannedMigration[];
  pending: PlannedMigration[];
  unrecordedApplied: PlannedMigration[];
};

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function listMigrations(directory = migrationsDirectory): AppliedMigration[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .map((name) => {
      const match = /^(\d+)_([\w-]+)\.sql$/.exec(name);
      return match ? { version: Number(match[1]), name } : null;
    })
    .filter((item): item is AppliedMigration => Boolean(item))
    .sort((left, right) => left.version - right.version);
}

function checksum(directory: string, migration: AppliedMigration) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, migration.name))).digest("hex");
}

function tableExists(database: DatabaseAdapter, table: string) {
  return database.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length > 0;
}

export function inspectMigrations(database: DatabaseAdapter, directory = migrationsDirectory, options: { recordLegacyChecksums?: boolean } = {}): MigrationInspection {
  const recordLegacyChecksums = options.recordLegacyChecksums ?? true;
  const hasSchemaMigrations = tableExists(database, "schema_migrations");
  const hasChecksums = tableExists(database, "migration_checksums");
  if (recordLegacyChecksums) {
    database.executeScript(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migration_checksums (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );`);
  }
  const migrations = listMigrations(directory).map((migration) => ({ ...migration, sha256: checksum(directory, migration) }));
  const applied = new Set(hasSchemaMigrations ? database.query<{ version: number }>("SELECT version FROM schema_migrations").map((row) => row.version) : []);
  const recorded = new Map((hasChecksums || recordLegacyChecksums
    ? database.query<{ version: number; name: string; sha256: string }>("SELECT version,name,sha256 FROM migration_checksums")
    : []).map((row) => [row.version, row]));
  const unrecordedApplied: PlannedMigration[] = [];
  for (const migration of migrations) {
    const existing = recorded.get(migration.version);
    if (existing && (existing.name !== migration.name || existing.sha256 !== migration.sha256)) throw new Error(`Migration checksum mismatch: ${migration.version}`);
    if (applied.has(migration.version) && !existing) {
      if (recordLegacyChecksums) database.execute("INSERT INTO migration_checksums(version,name,sha256,recorded_at) VALUES (?,?,?,?)", [migration.version, migration.name, migration.sha256, new Date().toISOString()]);
      else unrecordedApplied.push(migration);
    }
  }
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  if ([...applied].some((version) => version !== 1 && !knownVersions.has(version))) throw new Error("Applied migration file is missing");
  return { applied: migrations.filter((migration) => applied.has(migration.version)), pending: migrations.filter((migration) => !applied.has(migration.version)), unrecordedApplied };
}

/** Applies only new migrations; an already-applied migration is never re-run. */
export function applyMigrations(database: DatabaseAdapter, directory = migrationsDirectory) {
  const plan = inspectMigrations(database, directory);
  const pending = plan.pending;
  for (const migration of pending) {
    const sql = fs.readFileSync(path.join(directory, migration.name), "utf8");
    database.executeScript(`BEGIN IMMEDIATE;\n${sql}\nINSERT INTO schema_migrations(version, applied_at)
      VALUES (${migration.version}, datetime('now'));\nINSERT INTO migration_checksums(version,name,sha256,recorded_at)
      VALUES (${migration.version}, '${migration.name.replace(/'/g, "''")}', '${migration.sha256}', datetime('now'));\nCOMMIT;`);
  }
  return pending;
}
