// src/server/backup-job.ts
import path2 from "node:path";

// src/server/database.ts
import BetterSqlite3 from "better-sqlite3";
var DatabaseError = class extends Error {
  code;
  operation;
  causeCode;
  constructor(operation, code = "DATABASE_ERROR", cause) {
    super(`SQLite ${operation} failed`);
    this.name = "DatabaseError";
    this.code = code;
    this.operation = operation;
    this.causeCode = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : void 0;
  }
};
var TransactionDatabaseContext = class {
  constructor(database2) {
    this.database = database2;
  }
  database;
  active = true;
  query(sql, parameters) {
    this.assertActive("query");
    return this.database.query(sql, parameters);
  }
  execute(sql, parameters) {
    this.assertActive("execute");
    return this.database.execute(sql, parameters);
  }
  deactivate() {
    this.active = false;
  }
  assertActive(operation) {
    if (!this.active) throw new DatabaseError(operation, "TRANSACTION_CONTEXT_CLOSED");
  }
};
var defaultDatabaseConnectionPolicy = {
  foreignKeys: true,
  journalMode: "WAL",
  busyTimeoutMs: 5e3,
  synchronous: "NORMAL"
};
function normalizeSearchText(value) {
  return typeof value === "string" ? value.toLocaleLowerCase("ru-RU").replace(/ё/g, "\u0435").replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";
}
function invoke(statement, method, parameters) {
  if (parameters === void 0) return statement[method]();
  if (Array.isArray(parameters)) return statement[method](...parameters);
  return statement[method](parameters);
}
function transactionControlKeyword(sql) {
  const statement = sql.replace(/^(?:[\s;]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  return /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.exec(statement)?.[1]?.toUpperCase();
}
var BetterSqliteDatabase = class {
  database;
  policy;
  readonly;
  constructor(filePath, options = {}) {
    this.policy = options.policy || defaultDatabaseConnectionPolicy;
    this.readonly = options.readonly === true;
    try {
      this.database = new BetterSqlite3(filePath, { readonly: this.readonly, ...options.fileMustExist === void 0 ? {} : { fileMustExist: options.fileMustExist } });
      this.database.function("dvorik_normalize_search", { deterministic: true }, normalizeSearchText);
      this.applyConnectionPolicy();
    } catch (error) {
      throw new DatabaseError("open", "DATABASE_OPEN_FAILED", error);
    }
  }
  query(sql, parameters) {
    this.assertOpen("query");
    try {
      return invoke(this.database.prepare(sql), "all", parameters);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("query", "DATABASE_QUERY_FAILED", error);
    }
  }
  execute(sql, parameters) {
    this.assertOpen("execute");
    if (transactionControlKeyword(sql)) throw new DatabaseError("execute", "TRANSACTION_CONTROL_FORBIDDEN");
    try {
      return invoke(this.database.prepare(sql), "run", parameters);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("execute", "DATABASE_EXECUTE_FAILED", error);
    }
  }
  executeScript(sql) {
    this.assertOpen("execute");
    if (this.database.inTransaction) throw new DatabaseError("execute", "SCRIPT_DURING_TRANSACTION_FORBIDDEN");
    try {
      this.database.exec(sql);
      if (this.database.inTransaction) {
        this.database.exec("ROLLBACK");
        throw new DatabaseError("execute", "INCOMPLETE_SCRIPT_TRANSACTION");
      }
      this.applyConnectionPolicy();
    } catch (error) {
      if (this.database.inTransaction) {
        try {
          this.database.exec("ROLLBACK");
        } catch {
        }
      }
      try {
        this.applyConnectionPolicy();
      } catch {
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("execute", "DATABASE_EXECUTE_FAILED", error);
    }
  }
  transaction(run, options = {}) {
    this.assertOpen("transaction");
    if (this.database.inTransaction) throw new DatabaseError("transaction", "NESTED_TRANSACTION_FORBIDDEN");
    try {
      const transaction = this.database.transaction(() => {
        const context = new TransactionDatabaseContext(this);
        try {
          const result = run(context);
          if (result && typeof result === "object" && typeof result.then === "function") {
            void Promise.resolve(result).catch(() => void 0);
            throw new DatabaseError("transaction", "ASYNC_TRANSACTION_FORBIDDEN");
          }
          return result;
        } finally {
          context.deactivate();
        }
      });
      return options.mode === "immediate" ? transaction.immediate() : transaction.deferred();
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("transaction", "DATABASE_TRANSACTION_FAILED", error);
    }
  }
  close() {
    if (!this.database.open) return;
    if (this.database.inTransaction) throw new DatabaseError("close", "CLOSE_DURING_TRANSACTION_FORBIDDEN");
    try {
      if (!this.readonly) {
        const checkpoint = this.database.pragma("wal_checkpoint(TRUNCATE)");
        if (checkpoint[0]?.busy) throw new Error("WAL checkpoint busy");
      }
      this.database.close();
    } catch (error) {
      throw new DatabaseError("close", "DATABASE_CLOSE_FAILED", error);
    }
  }
  assertOpen(operation) {
    if (!this.database.open) throw new DatabaseError(operation, "DATABASE_CLOSED");
  }
  applyConnectionPolicy() {
    this.database.pragma("foreign_keys = ON");
    this.database.pragma(`busy_timeout = ${this.policy.busyTimeoutMs}`);
    this.database.pragma(`synchronous = ${this.policy.synchronous}`);
    if (this.readonly) {
      const journal = String(this.database.pragma("journal_mode", { simple: true })).toLowerCase();
      if (journal !== "wal") throw new Error("Readonly database is not in WAL mode");
    } else {
      const journal = String(this.database.pragma(`journal_mode = ${this.policy.journalMode}`, { simple: true })).toLowerCase();
      if (journal !== "wal") throw new Error("WAL mode is required");
    }
    if (Number(this.database.pragma("foreign_keys", { simple: true })) !== 1) throw new Error("Foreign keys are required");
  }
};
function openDatabase(filePath, options) {
  return new BetterSqliteDatabase(filePath, options);
}

// src/server/sqlite-backup.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}
function filesUnder(root, prefix = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute, relative) : entry.isFile() ? [relative] : [];
  });
}
function sqliteLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function manifestFor(bundlePath, createdAt) {
  const files = filesUnder(bundlePath).filter((relative) => relative !== "manifest.json").sort().map((relative) => {
    const filename = path.join(bundlePath, relative);
    return { path: relative, bytes: fs.statSync(filename).size, sha256: sha256(filename) };
  });
  return { schemaVersion: 1, createdAt, files };
}
function readManifest(bundlePath) {
  const parsed = JSON.parse(fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf8"));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) || typeof parsed.createdAt !== "string") throw new Error("Invalid backup manifest");
  return parsed;
}
function verifySqliteBackupBundle(bundlePath) {
  const manifest = readManifest(bundlePath);
  if (!manifest.files.some((file) => file.path === "database.sqlite")) throw new Error("Backup database is missing");
  for (const file of manifest.files) {
    if (!/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(file.path)) throw new Error("Invalid backup manifest path");
    const filename = path.join(bundlePath, file.path);
    if (!fs.existsSync(filename) || fs.statSync(filename).size !== file.bytes || sha256(filename) !== file.sha256) throw new Error(`Backup integrity mismatch: ${file.path}`);
  }
  const database2 = openDatabase(path.join(bundlePath, "database.sqlite"));
  try {
    const integrity = database2.query("PRAGMA integrity_check")[0]?.integrity_check;
    if (integrity !== "ok") throw new Error("SQLite integrity check failed");
    const migrations = database2.query("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
    if (!migrations.length) throw new Error("Backup schema migrations are missing");
    return { manifest, migrations };
  } finally {
    database2.close();
  }
}
function listSqliteBackupBundles(backupDirectory2) {
  if (!fs.existsSync(backupDirectory2)) return [];
  return fs.readdirSync(backupDirectory2, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^dvorik-backup-[0-9TZ-]+$/.test(entry.name)).map((entry) => {
    const bundlePath = path.join(backupDirectory2, entry.name);
    const manifest = readManifest(bundlePath);
    return { name: entry.name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function createSqliteBackupBundle(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const name = `dvorik-backup-${now.toISOString().replace(/[:.]/g, "-")}`;
  const bundlePath = path.join(input.backupDirectory, name);
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  fs.mkdirSync(bundlePath, { recursive: false });
  const databasePath2 = path.join(bundlePath, "database.sqlite");
  try {
    input.database.execute(`VACUUM INTO ${sqliteLiteral(databasePath2)}`);
    const snapshot = openDatabase(databasePath2);
    snapshot.close();
    if (input.mediaDirectory && fs.existsSync(input.mediaDirectory)) fs.cpSync(input.mediaDirectory, path.join(bundlePath, "media"), { recursive: true, errorOnExist: true });
    const manifest = manifestFor(bundlePath, now.toISOString());
    fs.writeFileSync(path.join(bundlePath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`, { mode: 384 });
    verifySqliteBackupBundle(bundlePath);
    return { name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
  } catch (error) {
    fs.rmSync(bundlePath, { recursive: true, force: true });
    throw error;
  }
}
function runSqliteBackupJob(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
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
    ...input.mediaDirectory ? { mediaDirectory: input.mediaDirectory } : {},
    now
  });
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1e3;
  const removed = [];
  for (const candidate of listSqliteBackupBundles(input.backupDirectory)) {
    if (candidate.name === backup.name || new Date(candidate.createdAt).getTime() >= cutoff) continue;
    const resolved = path.resolve(candidate.path);
    if (path.dirname(resolved) !== path.resolve(input.backupDirectory)) throw new Error("Backup retention path escaped backup directory");
    fs.rmSync(resolved, { recursive: true, force: false });
    removed.push(candidate.name);
  }
  return { backup, removed, freeBytes, retentionDays };
}

// src/server/backup-job.ts
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return path2.resolve(value);
}
function integer(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
var databasePath = required("DVORIK_SQLITE_FILE");
var backupDirectory = required("DVORIK_BACKUP_DIR");
var mediaDirectory = process.env.DVORIK_MEDIA_DIR?.trim() ? path2.resolve(process.env.DVORIK_MEDIA_DIR) : void 0;
var database = openDatabase(databasePath, { fileMustExist: true });
try {
  const result = runSqliteBackupJob({
    database,
    backupDirectory,
    ...mediaDirectory ? { mediaDirectory } : {},
    retentionDays: integer("DVORIK_BACKUP_RETENTION_DAYS", 31),
    minimumFreeBytes: integer("DVORIK_BACKUP_MIN_FREE_BYTES", 0)
  });
  process.stdout.write(`${JSON.stringify({ event: "backup_job_succeeded", ...result })}
`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "backup_job_failed", message: error instanceof Error ? error.message : "Unknown error" })}
`);
  process.exitCode = 1;
} finally {
  database.close();
}
