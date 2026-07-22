var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/permissions.ts
function hasPermission(user, permission) {
  return user.status === "active" && (user.permissions.includes(permission) || rolePermissions[user.role].includes(permission));
}
var rolePermissions;
var init_permissions = __esm({
  "src/server/permissions.ts"() {
    "use strict";
    rolePermissions = {
      seller: [
        "products:read",
        "stock:move",
        "inventory:write",
        "labels:print"
      ],
      admin: [
        "products:read",
        "products:write",
        "stock:move",
        "inventory:write",
        "reports:read",
        "imports:write",
        "merge:write",
        "schedule:manage",
        "staff:manage",
        "saby:manage",
        "users:manage",
        "techlog:read",
        "labels:print"
      ],
      super_admin: [
        "products:read",
        "products:write",
        "stock:move",
        "inventory:write",
        "reports:read",
        "imports:write",
        "merge:write",
        "schedule:manage",
        "staff:manage",
        "saby:manage",
        "users:manage",
        "roles:manage",
        "techlog:read",
        "labels:print"
      ]
    };
  }
});

// src/server/domain-core.ts
function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw new DomainError("FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432", 403, { permission });
  }
}
var DomainError;
var init_domain_core = __esm({
  "src/server/domain-core.ts"() {
    "use strict";
    init_permissions();
    DomainError = class extends Error {
      constructor(code, message, status = 400, details) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
      }
      code;
      status;
      details;
    };
  }
});

// src/server/report-rendering.ts
import PDFDocument from "pdfkit";
function isReportType(value) {
  return reportTypes.includes(value);
}
function reportTitle(type) {
  return titles[type];
}
function displayCell(value) {
  if (value === null || value === void 0) return "-";
  return String(value).replace(/[\r\n]+/g, " ");
}
async function renderReportPdfRows(type, rows, query = {}) {
  const document = new PDFDocument({ size: "A4", margin: 36 });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const pdf = new Promise((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font(fontPath).fontSize(16).fillColor("#111111").text(`\u041E\u0442\u0447\u0451\u0442: ${reportTitle(type)}`);
  const period = [query.from, query.to].filter(Boolean).join(" - ");
  if (period) document.moveDown(0.25).fontSize(9).text(`\u041F\u0435\u0440\u0438\u043E\u0434: ${period}`);
  document.moveDown(0.7);
  if (!rows.length) document.fontSize(10).text("\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434.");
  else {
    document.fontSize(8);
    rows.forEach((row, index) => {
      const line = Object.entries(row).map(([key, value]) => `${key}: ${displayCell(value)}`).join(" | ");
      const needed = document.heightOfString(`${index + 1}. ${line}`, { width: 523 });
      if (document.y + needed > document.page.height - 36) document.addPage();
      document.text(`${index + 1}. ${line}`, { width: 523 });
    });
  }
  document.end();
  return pdf;
}
var reportTypes, movementReportColumns, titles, fontPath;
var init_report_rendering = __esm({
  "src/server/report-rendering.ts"() {
    "use strict";
    reportTypes = ["low", "zero", "all", "archive", "movements", "discrepancies"];
    movementReportColumns = [
      "id",
      "occurredAt",
      "type",
      "productId",
      "productName",
      "fromLocationId",
      "fromLocationName",
      "toLocationId",
      "toLocationName",
      "quantity",
      "actorId",
      "actorName",
      "reason",
      "reversedOperationId",
      "inventoryExpected",
      "inventoryActual",
      "inventoryDelta"
    ];
    titles = {
      low: "\u041D\u0438\u0437\u043A\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A",
      zero: "\u041D\u0443\u043B\u0435\u0432\u043E\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A",
      all: "\u0412\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B",
      archive: "\u0410\u0440\u0445\u0438\u0432",
      movements: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u044F \u0441\u043A\u043B\u0430\u0434\u0430",
      discrepancies: "\u0420\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438"
    };
    fontPath = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
  }
});

// src/server/config.ts
import fs2 from "node:fs";
import path2 from "node:path";
function positiveInteger(env, name, fallback) {
  const raw = env[name]?.trim();
  if (!raw && fallback !== void 0) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function httpsUrl(env, name, fallback) {
  const value = env[name]?.trim() || fallback;
  try {
    if (new URL(value).protocol !== "https:") throw new Error();
  } catch {
    throw new Error(`${name} must be an HTTPS URL`);
  }
  return value.replace(/\/$/, "");
}
function sabyConfig(env) {
  if (env.DVORIK_SABY_ENABLED !== "1") return void 0;
  const webhookSecret = required(env, "DVORIK_SABY_WEBHOOK_SECRET");
  if (Buffer.byteLength(webhookSecret, "utf8") < 32) throw new Error("DVORIK_SABY_WEBHOOK_SECRET must be at least 32 bytes");
  if (!/^[A-Za-z0-9_-]+$/.test(webhookSecret)) throw new Error("DVORIK_SABY_WEBHOOK_SECRET must be URL-safe");
  return {
    pointId: positiveInteger(env, "DVORIK_SABY_POINT_ID"),
    appClientId: required(env, "DVORIK_SABY_APP_CLIENT_ID"),
    appSecret: required(env, "DVORIK_SABY_APP_SECRET"),
    secretKey: required(env, "DVORIK_SABY_SECRET_KEY"),
    webhookSecret,
    authUrl: httpsUrl(env, "DVORIK_SABY_AUTH_URL", "https://online.sbis.ru/oauth/service/"),
    apiBaseUrl: httpsUrl(env, "DVORIK_SABY_API_BASE_URL", "https://api.sbis.ru"),
    overlapMinutes: positiveInteger(env, "DVORIK_SABY_OVERLAP_MINUTES", 30),
    initialLookbackHours: positiveInteger(env, "DVORIK_SABY_INITIAL_LOOKBACK_HOURS", 24)
  };
}
function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required production config: ${name}`);
  return value;
}
function absolute(env, name) {
  const value = required(env, name);
  if (!path2.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}
function directory(env, name) {
  const value = absolute(env, name);
  try {
    const stat = fs2.statSync(value);
    fs2.accessSync(value, fs2.constants.R_OK | fs2.constants.W_OK);
    if (!stat.isDirectory()) throw new Error();
  } catch {
    throw new Error(`${name} must be an existing readable and writable directory`);
  }
  return value;
}
function timezone(value) {
  try {
    Intl.DateTimeFormat(void 0, { timeZone: value });
  } catch {
    throw new Error("DVORIK_TIMEZONE must be a valid IANA timezone");
  }
  return value;
}
function productionConfig(env) {
  if (env.DVORIK_STATE_FILE?.trim()) throw new Error("DVORIK_STATE_FILE is forbidden in production");
  const configuredTimezone = timezone(required(env, "DVORIK_TIMEZONE"));
  const release = required(env, "DVORIK_RELEASE_VERSION");
  if (/^(dev|test|local|unknown)$/i.test(release)) throw new Error("DVORIK_RELEASE_VERSION must not be a development value");
  const token = required(env, "TELEGRAM_BOT_TOKEN");
  const webhookSecret = required(env, "TELEGRAM_WEBHOOK_SECRET");
  if (devTokens.has(token) || devTokens.has(webhookSecret)) throw new Error("Development Telegram secrets are forbidden in production");
  const endpoint = required(env, "DVORIK_OBJECT_STORAGE_ENDPOINT");
  const publicBaseUrl = required(env, "DVORIK_OBJECT_STORAGE_PUBLIC_URL");
  for (const [name, value] of [["DVORIK_OBJECT_STORAGE_ENDPOINT", endpoint], ["DVORIK_OBJECT_STORAGE_PUBLIC_URL", publicBaseUrl]]) {
    try {
      if (new URL(value).protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`${name} must be an HTTPS URL`);
    }
  }
  const cookieSameSite = required(env, "DVORIK_COOKIE_SAME_SITE").toLowerCase();
  if (cookieSameSite !== "lax") throw new Error("DVORIK_COOKIE_SAME_SITE must be lax");
  const sessionSecret = required(env, "DVORIK_SESSION_SECRET");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32) throw new Error("DVORIK_SESSION_SECRET must be at least 32 bytes");
  const mediaDir2 = directory(env, "DVORIK_MEDIA_DIR");
  const backupDir = directory(env, "DVORIK_BACKUP_DIR");
  if (path2.resolve(mediaDir2) === path2.resolve(backupDir)) throw new Error("DVORIK_MEDIA_DIR and DVORIK_BACKUP_DIR must be different directories");
  return {
    production: true,
    devToolsEnabled: false,
    sqliteFile: absolute(env, "DVORIK_SQLITE_FILE"),
    mediaDir: mediaDir2,
    backupDir,
    timezone: configuredTimezone,
    telegramBotToken: token,
    telegramWebhookSecret: webhookSecret,
    ...sabyConfig(env) ? { saby: sabyConfig(env) } : {},
    objectStorage: {
      endpoint,
      bucket: required(env, "DVORIK_OBJECT_STORAGE_BUCKET"),
      publicBaseUrl,
      token: required(env, "DVORIK_OBJECT_STORAGE_TOKEN")
    },
    sessionCookie: { name: "__Host-dvorik_session", secret: sessionSecret, secure: true, sameSite: cookieSameSite, maxAgeMs: 8 * 60 * 60 * 1e3 }
  };
}
function loadRuntimeConfig(env = process.env) {
  if (env.NODE_ENV === "production") return productionConfig(env);
  return {
    production: false,
    devToolsEnabled: env.DVORIK_DEV_TOOLS === "1",
    sqliteFile: env.DVORIK_SQLITE_FILE || path2.resolve(process.cwd(), "data/dvorik.sqlite"),
    stateFile: env.DVORIK_STATE_FILE || path2.resolve(process.cwd(), "data/dvorik-state.json"),
    mediaDir: env.DVORIK_MEDIA_DIR || path2.resolve(process.cwd(), "data/media"),
    backupDir: env.DVORIK_BACKUP_DIR || path2.resolve(process.cwd(), "backups"),
    timezone: timezone(env.DVORIK_TIMEZONE || "Asia/Vladivostok"),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || "dev-token",
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET || "dev-webhook-secret",
    ...sabyConfig(env) ? { saby: sabyConfig(env) } : {},
    sessionCookie: {
      name: "dvorik_session",
      secret: env.DVORIK_SESSION_SECRET || "development-session-secret-32-bytes-minimum",
      secure: false,
      sameSite: "lax",
      maxAgeMs: 8 * 60 * 60 * 1e3
    }
  };
}
function assertRuntimeConfig(env = process.env) {
  return loadRuntimeConfig(env);
}
var devTokens;
var init_config = __esm({
  "src/server/config.ts"() {
    "use strict";
    devTokens = /* @__PURE__ */ new Set(["dev-token", "test-token", "dev-webhook-secret", "test-webhook-secret"]);
  }
});

// src/server/database.ts
import BetterSqlite3 from "better-sqlite3";
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
function openDatabase(filePath, options) {
  return new BetterSqliteDatabase(filePath, options);
}
function checkDatabaseReadiness(database2, expectedSchemaVersions3, expectedTables) {
  try {
    const schemaVersions = database2.query("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
    if (schemaVersions.length !== expectedSchemaVersions3.length || schemaVersions.some((version2, index) => version2 !== expectedSchemaVersions3[index])) {
      return { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions };
    }
    const requiredTables = [...new Set(expectedTables)];
    if (requiredTables.length) {
      const placeholders = requiredTables.map(() => "?").join(",");
      const presentTables = new Set(database2.query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
        requiredTables
      ).map((row) => row.name));
      if (requiredTables.some((table) => !presentTables.has(table))) {
        return { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions };
      }
    }
    database2.executeScript("BEGIN IMMEDIATE; UPDATE schema_migrations SET applied_at = applied_at WHERE version = (SELECT min(version) FROM schema_migrations); ROLLBACK;");
    return { ready: true, schemaVersions };
  } catch {
    return { ready: false, code: "DATABASE_UNAVAILABLE" };
  }
}
var DatabaseError, TransactionDatabaseContext, defaultDatabaseConnectionPolicy, BetterSqliteDatabase;
var init_database = __esm({
  "src/server/database.ts"() {
    "use strict";
    DatabaseError = class extends Error {
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
    TransactionDatabaseContext = class {
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
    defaultDatabaseConnectionPolicy = {
      foreignKeys: true,
      journalMode: "WAL",
      busyTimeoutMs: 5e3,
      synchronous: "NORMAL"
    };
    BetterSqliteDatabase = class {
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
  }
});

// src/server/migrations.ts
import fs3 from "node:fs";
import path3 from "node:path";
import crypto2 from "node:crypto";
import { fileURLToPath } from "node:url";
function listMigrations(directory2 = migrationsDirectory) {
  if (!fs3.existsSync(directory2)) return [];
  return fs3.readdirSync(directory2).map((name) => {
    const match = /^(\d+)_([\w-]+)\.sql$/.exec(name);
    return match ? { version: Number(match[1]), name } : null;
  }).filter((item) => Boolean(item)).sort((left, right) => left.version - right.version);
}
function checksum(directory2, migration) {
  return crypto2.createHash("sha256").update(fs3.readFileSync(path3.join(directory2, migration.name))).digest("hex");
}
function tableExists(database2, table) {
  return database2.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length > 0;
}
function inspectMigrations(database2, directory2 = migrationsDirectory, options = {}) {
  const recordLegacyChecksums = options.recordLegacyChecksums ?? true;
  const hasSchemaMigrations = tableExists(database2, "schema_migrations");
  const hasChecksums = tableExists(database2, "migration_checksums");
  if (recordLegacyChecksums) {
    database2.executeScript(`CREATE TABLE IF NOT EXISTS schema_migrations (
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
  const migrations = listMigrations(directory2).map((migration) => ({ ...migration, sha256: checksum(directory2, migration) }));
  const applied = new Set(hasSchemaMigrations ? database2.query("SELECT version FROM schema_migrations").map((row) => row.version) : []);
  const recorded = new Map((hasChecksums || recordLegacyChecksums ? database2.query("SELECT version,name,sha256 FROM migration_checksums") : []).map((row) => [row.version, row]));
  const unrecordedApplied = [];
  for (const migration of migrations) {
    const existing = recorded.get(migration.version);
    if (existing && (existing.name !== migration.name || existing.sha256 !== migration.sha256)) throw new Error(`Migration checksum mismatch: ${migration.version}`);
    if (applied.has(migration.version) && !existing) {
      if (recordLegacyChecksums) database2.execute("INSERT INTO migration_checksums(version,name,sha256,recorded_at) VALUES (?,?,?,?)", [migration.version, migration.name, migration.sha256, (/* @__PURE__ */ new Date()).toISOString()]);
      else unrecordedApplied.push(migration);
    }
  }
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  if ([...applied].some((version2) => version2 !== 1 && !knownVersions.has(version2))) throw new Error("Applied migration file is missing");
  return { applied: migrations.filter((migration) => applied.has(migration.version)), pending: migrations.filter((migration) => !applied.has(migration.version)), unrecordedApplied };
}
function applyMigrations(database2, directory2 = migrationsDirectory) {
  const plan = inspectMigrations(database2, directory2);
  const pending = plan.pending;
  for (const migration of pending) {
    const sql = fs3.readFileSync(path3.join(directory2, migration.name), "utf8");
    database2.executeScript(`BEGIN IMMEDIATE;
${sql}
INSERT INTO schema_migrations(version, applied_at)
      VALUES (${migration.version}, datetime('now'));
INSERT INTO migration_checksums(version,name,sha256,recorded_at)
      VALUES (${migration.version}, '${migration.name.replace(/'/g, "''")}', '${migration.sha256}', datetime('now'));
COMMIT;`);
  }
  return pending;
}
var migrationsDirectory;
var init_migrations = __esm({
  "src/server/migrations.ts"() {
    "use strict";
    migrationsDirectory = path3.resolve(path3.dirname(fileURLToPath(import.meta.url)), "migrations");
  }
});

// src/shared/quantity.ts
function quantityToMinor(value, unit) {
  if (!Number.isFinite(value)) throw new QuantityError("NOT_FINITE");
  const scaled = value * QUANTITY_SCALE;
  const minor = Math.round(scaled);
  const floatingTolerance = Math.max(1e-7, Math.abs(scaled) * Number.EPSILON * 2);
  if (Math.abs(scaled - minor) > floatingTolerance) throw new QuantityError("PRECISION");
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_QUANTITY_MINOR) throw new QuantityError("OVERFLOW");
  if (unit === "\u0448\u0442" && minor % QUANTITY_SCALE !== 0) throw new QuantityError("PIECES_FRACTION");
  return minor;
}
function quantityFromMinor(minor) {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_QUANTITY_MINOR) throw new QuantityError("OVERFLOW");
  return minor / QUANTITY_SCALE;
}
function normalizeQuantity(value, unit) {
  return quantityFromMinor(quantityToMinor(value, unit));
}
function requireQuantity(value, options = {}) {
  const normalized = normalizeQuantity(value, options.unit);
  if (normalized < 0) throw new QuantityError("NEGATIVE");
  if (options.allowZero === false && normalized === 0) throw new QuantityError("NOT_POSITIVE");
  return normalized;
}
function addQuantity(left, right, unit) {
  return quantityFromMinor(quantityToMinor(left, unit) + quantityToMinor(right, unit));
}
function subtractQuantity(left, right, unit) {
  return quantityFromMinor(quantityToMinor(left, unit) - quantityToMinor(right, unit));
}
var QUANTITY_SCALE, MAX_QUANTITY_MINOR, QuantityError;
var init_quantity = __esm({
  "src/shared/quantity.ts"() {
    "use strict";
    QUANTITY_SCALE = 1e3;
    MAX_QUANTITY_MINOR = 9e12;
    QuantityError = class extends Error {
      constructor(code) {
        super(`Invalid quantity: ${code}`);
        this.code = code;
        this.name = "QuantityError";
      }
      code;
    };
  }
});

// src/server/state-migration.ts
function inspectLegacyState(state) {
  const counts = {
    users: state.users.length,
    products: state.products.length,
    productIdentifiers: state.products.reduce((total, product) => total + product.identifiers.length, 0),
    locations: state.locations.length,
    balances: state.balances.length,
    operations: state.operations.length,
    shifts: state.shifts.length,
    scheduleDays: state.scheduleDays.length,
    swaps: state.swaps.length,
    imports: state.imports.length,
    merges: state.merges.length,
    labelJobs: state.labelJobs.length,
    notifications: state.notifications.length,
    outbox: state.outbox.length,
    notificationPreferences: state.notificationPreferences.length,
    auditEntries: state.audit.length,
    sessions: state.sessions.length
  };
  const conflicts = [];
  const users2 = new Set(state.users.map((item) => item.id));
  const products2 = new Set(state.products.map((item) => item.id));
  const locations2 = new Set(state.locations.map((item) => item.id));
  const shifts = new Set(state.shifts.map((item) => item.id));
  const barcodeOwners = /* @__PURE__ */ new Map();
  const locationCodes = /* @__PURE__ */ new Set();
  const importHashes = /* @__PURE__ */ new Set();
  for (const product of state.products) {
    for (const identifier2 of product.identifiers) {
      if (identifier2.productId !== product.id) conflicts.push(`identifier ${identifier2.id}: productId does not match owner`);
      if (identifier2.type !== "barcode") continue;
      const key = normalize(identifier2.value);
      const owner = barcodeOwners.get(key);
      if (owner && owner !== product.id) conflicts.push(`barcode ${identifier2.value}: belongs to ${owner} and ${product.id}`);
      barcodeOwners.set(key, product.id);
    }
  }
  for (const balance of state.balances) {
    if (!products2.has(balance.productId)) conflicts.push(`balance: missing product ${balance.productId}`);
    if (!locations2.has(balance.locationId)) conflicts.push(`balance: missing location ${balance.locationId}`);
  }
  for (const location of state.locations) {
    const code = normalize(location.code);
    if (locationCodes.has(code)) conflicts.push(`location code ${location.code}: duplicate`);
    locationCodes.add(code);
  }
  for (const item of state.imports) {
    if (importHashes.has(item.hash)) conflicts.push(`import ${item.id}: duplicate content hash`);
    importHashes.add(item.hash);
  }
  for (const operation of state.operations) {
    if (!products2.has(operation.productId)) conflicts.push(`operation ${operation.id}: missing product`);
    if (!users2.has(operation.actorId)) conflicts.push(`operation ${operation.id}: missing actor`);
    if (operation.fromLocationId && !locations2.has(operation.fromLocationId)) conflicts.push(`operation ${operation.id}: missing source location`);
    if (operation.toLocationId && !locations2.has(operation.toLocationId)) conflicts.push(`operation ${operation.id}: missing target location`);
  }
  for (const shift of state.shifts) {
    if (!locations2.has(shift.locationId)) conflicts.push(`shift ${shift.id}: missing location`);
    for (const userId of shift.employeeIds) if (!users2.has(userId)) conflicts.push(`shift ${shift.id}: missing employee ${userId}`);
  }
  for (const swap of state.swaps) {
    if (!shifts.has(swap.fromShiftId)) conflicts.push(`swap ${swap.id}: missing shift`);
    if (!users2.has(swap.fromUserId) || !users2.has(swap.toUserId)) conflicts.push(`swap ${swap.id}: missing participant`);
  }
  for (const notification of state.notifications) {
    if (!users2.has(notification.userId)) conflicts.push(`notification ${notification.id}: missing recipient`);
  }
  for (const product of state.products) {
    try {
      requireQuantity(product.lowStockThreshold, { unit: product.unit });
    } catch {
      conflicts.push(`product ${product.id}: invalid low stock threshold`);
    }
  }
  for (const balance of state.balances) {
    const product = state.products.find((item) => item.id === balance.productId);
    try {
      requireQuantity(balance.quantity, { unit: product?.unit });
    } catch {
      conflicts.push(`balance ${balance.productId}/${balance.locationId}: invalid quantity`);
    }
  }
  for (const operation of state.operations) {
    const product = state.products.find((item) => item.id === operation.productId);
    try {
      requireQuantity(operation.quantity, { unit: product?.unit, allowZero: false });
    } catch {
      conflicts.push(`operation ${operation.id}: invalid quantity`);
    }
  }
  return { counts, conflicts };
}
function buildNormalizedStateSql(state, options = {}) {
  const report = inspectLegacyState(state);
  if (report.conflicts.length) throw new Error(`State migration blocked: ${report.conflicts.join("; ")}`);
  const userIds = new Set(state.users.map((user) => user.id));
  const supplierIds = [...new Set(
    state.products.flatMap((product) => product.identifiers.map((identifier2) => identifier2.supplierId)).filter((id) => Boolean(id))
  )];
  const statements = ["PRAGMA foreign_keys = OFF", "BEGIN IMMEDIATE"];
  if (options.preserveSessions && !options.preserveIdentity) {
    if (state.users.length) {
      const userList = state.users.map((user) => quote(user.id)).join(", ");
      statements.push(`DELETE FROM sessions WHERE user_id NOT IN (${userList})`);
      statements.push(`UPDATE audit_entries SET actor_id = NULL WHERE actor_id IS NOT NULL AND actor_id NOT IN (${userList})`);
    } else {
      statements.push("DELETE FROM sessions");
      statements.push("UPDATE audit_entries SET actor_id = NULL WHERE actor_id IS NOT NULL");
    }
  }
  const tables = [
    ...options.preserveIdentity ? [] : ["role_permissions", "user_roles"],
    ...options.preserveSessions ? [] : ["sessions"],
    "product_identifiers",
    "supplier_skus",
    "product_aliases",
    "stock_operations",
    "inventory_balances",
    "stock_balances",
    "shift_assignments",
    "shift_swap_requests",
    "shifts",
    "schedule_days",
    "rotation_templates",
    "import_rows",
    "imports",
    "merge_jobs",
    "label_jobs",
    "notification_preferences",
    "webapp_notifications",
    ...options.preserveCommandTables ? [] : ["outbox_messages"],
    ...options.preserveSessions ? [] : ["audit_entries"],
    ...options.preserveCommandTables ? [] : ["idempotency_keys"],
    "products",
    "suppliers",
    "locations",
    ...options.preserveIdentity ? [] : ["permissions", "roles", "users"]
  ];
  statements.push(...tables.map((table) => `DELETE FROM ${table}`));
  const roles3 = [.../* @__PURE__ */ new Set([
    ...Object.keys(rolePermissions),
    ...state.users.map((user) => user.role)
  ])];
  const permissions2 = [.../* @__PURE__ */ new Set([
    ...Object.values(rolePermissions).flat(),
    ...state.users.flatMap((user) => user.permissions)
  ])];
  if (!options.preserveIdentity) {
    statements.push(...roles3.map((role) => `INSERT INTO roles(id, name) VALUES (${quote(role)}, ${quote(role)})`));
    statements.push(...permissions2.map((permission) => `INSERT INTO permissions(id, code) VALUES (${quote(permission)}, ${quote(permission)})`));
    statements.push(...state.users.map((user) => `INSERT INTO users(id, telegram_user_id, first_name, last_name, username, status) VALUES (${quote(user.id)}, ${quote(user.telegramUserId)}, ${quote(user.firstName)}, ${quote(user.lastName)}, ${quote(user.username)}, ${quote(user.status)})`));
    statements.push(...state.users.map((user) => `INSERT INTO user_roles(user_id, role_id) VALUES (${quote(user.id)}, ${quote(user.role)})`));
    statements.push(...Object.entries(rolePermissions).flatMap(([role, assignedPermissions]) => assignedPermissions.map((permission) => `INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (${quote(role)}, ${quote(permission)})`)));
    statements.push(...state.users.flatMap((user) => user.permissions.map((permission) => `INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (${quote(user.role)}, ${quote(permission)})`)));
  }
  statements.push(...state.locations.map((location) => `INSERT INTO locations(id, code, name, type, parent_id, status) VALUES (${quote(location.id)}, ${quote(location.code)}, ${quote(location.name)}, ${quote(location.type)}, ${quote(location.parentId)}, ${quote(location.status)})`));
  statements.push(...supplierIds.map((id) => `INSERT INTO suppliers(id, name) VALUES (${quote(id)}, ${quote(`Legacy supplier ${id}`)})`));
  statements.push(...state.products.map((product) => `INSERT INTO products(id, official_name, local_name, unit, photo_url, category, tags_json, status, low_stock_threshold, low_stock_threshold_minor) VALUES (${quote(product.id)}, ${quote(product.officialName)}, ${quote(product.localName)}, ${quote(product.unit)}, ${quote(product.photoUrl)}, ${quote(product.category)}, ${json2(product.tags)}, ${quote(product.status)}, ${product.lowStockThreshold}, ${quantityToMinor(product.lowStockThreshold, product.unit)})`));
  statements.push(...state.products.flatMap((product) => product.identifiers.map((identifier2) => `INSERT INTO product_identifiers(id, product_id, supplier_id, type, value, normalized_value) VALUES (${quote(identifier2.id)}, ${quote(product.id)}, ${quote(identifier2.supplierId)}, ${quote(identifier2.type)}, ${quote(identifier2.value)}, ${quote(normalize(identifier2.value))})`)));
  statements.push(...state.balances.map((balance) => {
    const product = state.products.find((item) => item.id === balance.productId);
    return `INSERT INTO stock_balances(product_id, location_id, quantity, quantity_minor, version) VALUES (${quote(balance.productId)}, ${quote(balance.locationId)}, ${balance.quantity}, ${quantityToMinor(balance.quantity, product?.unit)}, ${balance.version})`;
  }));
  statements.push("INSERT OR IGNORE INTO inventory_balances(product_id, quantity_minor, version, updated_at) SELECT id, 0, 0, datetime('now') FROM products");
  statements.push(...state.operations.map((operation) => {
    const product = state.products.find((item) => item.id === operation.productId);
    return `INSERT INTO stock_operations(id, type, product_id, from_location_id, to_location_id, quantity, quantity_minor, actor_id, reason, idempotency_key, reversed_operation_id, metadata_json, created_at) VALUES (${quote(operation.id)}, ${quote(operation.type)}, ${quote(operation.productId)}, ${quote(operation.fromLocationId)}, ${quote(operation.toLocationId)}, ${operation.quantity}, ${quantityToMinor(operation.quantity, product?.unit)}, ${quote(operation.actorId)}, ${quote(operation.reason)}, ${quote(operation.idempotencyKey)}, ${quote(operation.reversedOperationId)}, ${json2(operation.metadata || {})}, ${quote(operation.createdAt)})`;
  }));
  const derivedDays = state.shifts.map((shift) => ({ id: dayId(shift.date, shift.locationId), date: shift.date, locationId: shift.locationId, status: "working", comment: "", version: 0 }));
  const daysByKey = new Map([...derivedDays, ...state.scheduleDays].map((day) => [`${day.date}:${day.locationId}`, day]));
  const days = [...daysByKey.values()];
  statements.push(...days.map((day) => `INSERT INTO schedule_days(id, local_date, location_id, status, comment, version) VALUES (${quote(day.id)}, ${quote(day.date)}, ${quote(day.locationId)}, ${quote(day.status)}, ${quote(day.comment)}, ${day.version})`));
  statements.push(...state.shifts.map((shift) => `INSERT INTO shifts(id, schedule_day_id, location_id, local_date, start_time, end_time, status, comment) VALUES (${quote(shift.id)}, ${quote(daysByKey.get(`${shift.date}:${shift.locationId}`)?.id || dayId(shift.date, shift.locationId))}, ${quote(shift.locationId)}, ${quote(shift.date)}, ${quote(shift.start)}, ${quote(shift.end)}, ${quote(shift.status)}, ${quote(shift.comment)})`));
  statements.push(...state.shifts.flatMap((shift) => shift.employeeIds.map((userId) => `INSERT INTO shift_assignments(shift_id, user_id) VALUES (${quote(shift.id)}, ${quote(userId)})`)));
  statements.push(...state.swaps.map((swap) => {
    const status = swap.status === "pending" ? "expired" : swap.status;
    const resolvedAt = swap.status === "pending" ? swap.createdAt : void 0;
    return `INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, source_shift_version, status, created_at, resolved_at, updated_at) VALUES (${quote(swap.id)}, ${quote(swap.fromShiftId)}, ${quote(swap.fromUserId)}, ${quote(swap.toUserId)}, 0, ${quote(status)}, ${quote(swap.createdAt)}, ${quote(resolvedAt)}, ${quote(swap.createdAt)})`;
  }));
  statements.push(...state.imports.map((item) => `INSERT INTO imports(id, status, file_name, content_hash, preview_json, result_json, created_at, committed_at, reverted_at, updated_at) VALUES (${quote(item.id)}, ${quote(item.status)}, ${quote(item.fileName)}, ${quote(item.hash)}, ${json2({ rows: item.rows })}, ${json2(item.result || {})}, ${quote(item.createdAt)}, ${quote(item.status === "committed" ? item.createdAt : void 0)}, ${quote(item.status === "reverted" ? item.createdAt : void 0)}, ${quote(item.createdAt)})`));
  statements.push(...state.imports.flatMap((item) => item.rows.map((row, index) => `INSERT INTO import_rows(id, import_id, row_number, raw_json, status, updated_at) VALUES (${quote(`${item.id}:${index + 1}`)}, ${quote(item.id)}, ${index + 1}, ${json2(row)}, ${quote(item.status === "committed" ? "committed" : "pending")}, ${quote(item.createdAt)})`)));
  statements.push(...state.merges.map((item) => `INSERT INTO merge_jobs(id, status, source_product_id, target_product_id, snapshot_json, created_at, committed_at, reverted_at, updated_at) VALUES (${quote(item.id)}, ${quote(item.status)}, ${quote(item.sourceProductId)}, ${quote(item.targetProductId)}, ${json2(item.snapshot)}, ${quote(item.createdAt)}, ${quote(item.committedAt)}, ${quote(item.status === "reverted" ? item.createdAt : void 0)}, ${quote(item.committedAt || item.createdAt)})`));
  statements.push(...state.labelJobs.map((job) => `INSERT INTO label_jobs(id, actor_id, template_id, geometry_json, labels_json, created_at, updated_at) VALUES (${quote(job.id)}, ${quote(userIds.has(job.actorId) ? job.actorId : void 0)}, ${quote(job.templateId)}, ${json2(job.geometry)}, ${json2(job.labels)}, ${quote(job.createdAt)}, ${quote(job.createdAt)})`));
  statements.push(...state.audit.map((entry) => `INSERT INTO audit_entries(id, actor_id, entity_type, entity_id, action, changes_json, created_at, updated_at) VALUES (${quote(entry.id)}, ${quote(userIds.has(entry.actorId) ? entry.actorId : void 0)}, ${quote(entry.entity)}, ${quote(entry.entityId)}, ${quote(entry.action)}, ${json2(entry.changes)}, ${quote(entry.createdAt)}, ${quote(entry.createdAt)})${options.preserveSessions ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.notifications.filter((notification) => notification.channel === "webapp").map((notification) => `INSERT INTO webapp_notifications(id, recipient_user_id, type, payload_json, is_read, created_at, read_at, updated_at) VALUES (${quote(notification.id)}, ${quote(notification.userId)}, ${quote(notification.type)}, ${json2({ schemaVersion: 1, value: notification.payload })}, ${notification.read ? 1 : 0}, ${quote(notification.createdAt)}, ${quote(notification.read ? notification.createdAt : void 0)}, ${quote(notification.createdAt)})`));
  statements.push(...state.notifications.filter((notification) => notification.channel === "telegram").map((notification) => `INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, sent_at, created_at, updated_at) VALUES (${quote(notification.id)}, 'telegram', ${quote(notification.userId)}, ${quote(notification.type)}, ${json2({ schemaVersion: 1, value: notification.payload })}, 'sent', ${quote(notification.createdAt)}, ${quote(notification.createdAt)}, ${quote(notification.createdAt)})${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.outbox.map((message) => `INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, idempotency_key, attempt_count, max_attempts, available_at, last_error, last_error_code, sent_at, created_at, updated_at) VALUES (${quote(message.id)}, ${quote(message.channel)}, ${quote(message.userId)}, ${quote(message.type)}, ${json2({ schemaVersion: 1, value: message.payload })}, ${quote(message.status === "processing" ? "pending" : message.status)}, ${quote(message.idempotencyKey)}, ${message.attemptCount}, ${Math.max(8, message.attemptCount)}, ${quote(message.availableAt)}, ${quote(message.lastError)}, ${quote(message.status === "processing" ? "RECOVERED_LEGACY_PROCESSING" : void 0)}, ${quote(message.sentAt)}, ${quote(message.createdAt)}, ${quote(message.sentAt || message.createdAt)})${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.notificationPreferences.map((preference) => `INSERT INTO notification_preferences(user_id, channel, event_type, delivery_mode, updated_at) VALUES (${quote(preference.userId)}, ${quote(preference.channel)}, ${quote(preference.eventType)}, ${quote(preference.deliveryMode)}, datetime('now'))`));
  statements.push(...Object.entries(state.idempotency).map(([key, response8]) => {
    const separator = key.indexOf(":");
    const scope = separator < 0 ? "legacy" : key.slice(0, separator);
    const idempotencyKey = separator < 0 ? key : key.slice(separator + 1);
    return `INSERT INTO idempotency_keys(scope, key, request_hash, status, response_status, response_json, created_at, completed_at, updated_at) VALUES (${quote(scope)}, ${quote(idempotencyKey)}, ${quote(`legacy:${key}`)}, 'completed', 200, ${json2(response8)}, datetime('now'), datetime('now'), datetime('now'))${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`;
  }));
  statements.push("COMMIT", "PRAGMA foreign_keys = ON");
  return statements.join(";\n");
}
var quote, json2, normalize, dayId;
var init_state_migration = __esm({
  "src/server/state-migration.ts"() {
    "use strict";
    init_quantity();
    init_permissions();
    quote = (value) => value === void 0 || value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;
    json2 = (value) => quote(JSON.stringify(value));
    normalize = (value) => value.trim().toLocaleLowerCase("ru-RU");
    dayId = (date2, locationId) => `legacy-day:${date2}:${locationId}`;
  }
});

// src/server/store.ts
var store_exports = {};
__export(store_exports, {
  appendAudit: () => appendAudit,
  audit: () => audit,
  closeDatabase: () => closeDatabase,
  createBackup: () => createBackup,
  createSeedState: () => createSeedState,
  databaseReadiness: () => databaseReadiness,
  db: () => db,
  ensureDatabaseReady: () => ensureDatabaseReady,
  executeDatabaseSql: () => executeDatabaseSql,
  findBalance: () => findBalance,
  findBalanceIn: () => findBalanceIn,
  listBackups: () => listBackups,
  loadState: () => loadState,
  normalizeState: () => normalizeState,
  restoreBackup: () => restoreBackup,
  saveState: () => saveState,
  stateTransaction: () => stateTransaction
});
import { nanoid as nanoid14 } from "nanoid";
import fs5 from "node:fs";
import path5 from "node:path";
function database() {
  sqliteDatabase ||= openDatabase(sqliteFile);
  return sqliteDatabase;
}
function createSeedState() {
  return {
    users: structuredClone(users),
    products: structuredClone(products),
    locations: structuredClone(locations),
    balances: structuredClone(balances),
    operations: [
      {
        id: "op-seed-1",
        type: "receipt",
        productId: "p-1",
        toLocationId: "loc-main",
        quantity: 18.5,
        actorId: "u-admin",
        reason: "\u041D\u0430\u0447\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u0438\u0445\u043E\u0434",
        idempotencyKey: "seed-1",
        createdAt: now()
      }
    ],
    shifts: [
      {
        id: "shift-1",
        date: "2026-06-26",
        start: "00:00",
        end: "23:59",
        locationId: "loc-counter",
        employeeIds: ["u-seller"],
        status: "scheduled",
        comment: "\u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u0442\u043E\u0447\u043A\u0438"
      },
      {
        id: "shift-2",
        date: "2026-06-27",
        start: "00:00",
        end: "23:59",
        locationId: "loc-house",
        employeeIds: ["u-admin"],
        status: "scheduled",
        comment: "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u0432\u0438\u0442\u0440\u0438\u043D\u044B"
      }
    ],
    scheduleDays: [],
    swaps: [],
    audit: [],
    notifications: [],
    outbox: [],
    notificationPreferences: [],
    imports: [],
    merges: [],
    labelJobs: [],
    sessions: [],
    idempotency: {}
  };
}
function normalizeState(parsed) {
  const seed = createSeedState();
  const normalized = {
    ...seed,
    ...parsed,
    sessions: (parsed.sessions || []).filter((session2) => !session2.revokedAt && new Date(session2.expiresAt).getTime() > Date.now()),
    scheduleDays: parsed.scheduleDays || [],
    outbox: parsed.outbox || [],
    notificationPreferences: parsed.notificationPreferences || [],
    imports: parsed.imports || [],
    merges: parsed.merges || [],
    labelJobs: parsed.labelJobs || [],
    idempotency: parsed.idempotency || {}
  };
  const units = new Map(normalized.products.map((product) => [product.id, product.unit]));
  normalized.products = normalized.products.map((product) => ({ ...product, lowStockThreshold: requireQuantity(product.lowStockThreshold, { unit: product.unit }) }));
  normalized.balances = normalized.balances.map((balance) => ({ ...balance, quantity: requireQuantity(balance.quantity, { unit: units.get(balance.productId) }) }));
  normalized.operations = normalized.operations.map((operation) => ({ ...operation, quantity: requireQuantity(operation.quantity, { unit: units.get(operation.productId), allowZero: false }) }));
  return normalized;
}
function loadState(filePath = stateFile) {
  if (process.env.NODE_ENV === "test" && filePath === stateFile) return createSeedState();
  if (filePath === stateFile && !useJsonState) return loadSqliteState();
  if (!fs5.existsSync(filePath)) return createSeedState();
  const parsed = JSON.parse(fs5.readFileSync(filePath, "utf8"));
  return normalizeState(parsed);
}
function saveState(filePath = stateFile, state = db) {
  if (process.env.NODE_ENV === "test" && filePath === stateFile) return;
  if (filePath === stateFile && !useJsonState) {
    saveSqliteState(state);
    return;
  }
  saveJsonState(filePath, state);
}
function saveJsonState(filePath, state) {
  fs5.mkdirSync(path5.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs5.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs5.renameSync(tmpPath, filePath);
}
function loadSqliteState() {
  initSqlite();
  const payload = database().query("SELECT payload FROM app_state WHERE id = ?", ["main"])[0]?.payload;
  if (payload) return normalizeState(JSON.parse(payload));
  const initial = fs5.existsSync(stateFile) ? normalizeState(JSON.parse(fs5.readFileSync(stateFile, "utf8"))) : createSeedState();
  saveSqliteState(initial);
  return initial;
}
function saveSqliteState(state) {
  initSqlite();
  const normalizedRows = database().query("SELECT count(*) AS count FROM products")[0]?.count ?? 0;
  if (normalizedRows === 0) {
    database().executeScript(buildNormalizedStateSql(state));
  }
  database().execute(`
    INSERT INTO app_state(id, payload, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at
  `, ["main", JSON.stringify(state)]);
}
function initSqlite() {
  if (sqliteInitialized) return;
  fs5.mkdirSync(path5.dirname(sqliteFile), { recursive: true });
  database().executeScript(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
  `);
  applyMigrations(database());
  const readiness = checkDatabaseReadiness(database(), expectedSchemaVersions, expectedRuntimeTables);
  if (!readiness.ready) throw new Error(`Database readiness failed: ${readiness.code}`);
  sqliteInitialized = true;
  if (runtimeConfig.production) console.log(JSON.stringify({ event: "sqlite_connection_policy", ...defaultDatabaseConnectionPolicy, schemaVersions: expectedSchemaVersions }));
}
function ensureDatabaseReady() {
  initSqlite();
}
function databaseReadiness() {
  try {
    initSqlite();
    return checkDatabaseReadiness(database(), expectedSchemaVersions, expectedRuntimeTables);
  } catch {
    return { ready: false, code: "DATABASE_UNAVAILABLE" };
  }
}
function executeDatabaseSql(sql) {
  ensureDatabaseReady();
  database().executeScript(sql);
}
function closeDatabase() {
  sqliteDatabase?.close();
  sqliteDatabase = void 0;
  sqliteInitialized = false;
}
function defaultBackupDir() {
  return runtimeConfig.backupDir;
}
function createBackup(nowDate = /* @__PURE__ */ new Date(), filePath = stateFile, backupDir = defaultBackupDir()) {
  saveState(filePath);
  fs5.mkdirSync(backupDir, { recursive: true });
  const stamp = nowDate.toISOString().replace(/[:.]/g, "-");
  const backupPath = path5.join(backupDir, `dvorik-state-${stamp}.json`);
  if (filePath === stateFile && !useJsonState) {
    fs5.writeFileSync(backupPath, JSON.stringify(db, null, 2));
  } else {
    fs5.copyFileSync(filePath, backupPath);
  }
  return { path: backupPath, createdAt: nowDate.toISOString(), bytes: fs5.statSync(backupPath).size };
}
function listBackups(backupDir = defaultBackupDir()) {
  if (!fs5.existsSync(backupDir)) return [];
  return fs5.readdirSync(backupDir).filter((name) => /^dvorik-state-.+\.json$/.test(name)).map((name) => {
    const backupPath = path5.join(backupDir, name);
    const stat = fs5.statSync(backupPath);
    return { name, path: backupPath, createdAt: stat.mtime.toISOString(), bytes: stat.size };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function restoreBackup(backupName, backupDir = defaultBackupDir()) {
  if (!/^dvorik-state-.+\.json$/.test(backupName)) throw new Error("Invalid backup name");
  const backupPath = path5.join(backupDir, backupName);
  if (!fs5.existsSync(backupPath)) throw new Error("Backup not found");
  const restored = normalizeState(JSON.parse(fs5.readFileSync(backupPath, "utf8")));
  for (const key of Object.keys(db)) {
    db[key] = restored[key];
  }
  saveState();
  return { name: backupName, path: backupPath, restoredAt: now() };
}
function appendAudit(state, actorId, entity, entityId, action, changes) {
  const entry = { id: nanoid14(), actorId, entity, entityId, action, changes, createdAt: now() };
  state.audit.unshift(entry);
  return entry;
}
function stateTransaction(run) {
  const rollback = structuredClone(db);
  try {
    const result = run(db);
    saveState();
    return result;
  } catch (error) {
    for (const key of Object.keys(db)) {
      const live = db[key];
      const saved = rollback[key];
      if (Array.isArray(live) && Array.isArray(saved)) {
        const liveItems = live;
        const savedItems = saved;
        const existingById = new Map(liveItems.filter((item) => typeof item.id === "string").map((item) => [String(item.id), item]));
        const restored = savedItems.map((item) => {
          if (!item || typeof item !== "object" || !("id" in item)) return item;
          const existing = existingById.get(String(item.id));
          return existing ? Object.assign(existing, item) : item;
        });
        liveItems.splice(0, liveItems.length, ...restored);
      } else if (live && typeof live === "object" && saved && typeof saved === "object") {
        Object.assign(live, saved);
        for (const property of Object.keys(live)) if (!(property in saved)) delete live[property];
      } else {
        db[key] = saved;
      }
    }
    throw error;
  }
}
function audit(actorId, entity, entityId, action, changes) {
  const entry = appendAudit(db, actorId, entity, entityId, action, changes);
  saveState();
  return entry;
}
function findBalanceIn(state, productId, locationId) {
  let balance = state.balances.find((item) => item.productId === productId && item.locationId === locationId);
  if (!balance) {
    balance = { productId, locationId, quantity: 0, version: 0 };
    state.balances.push(balance);
  }
  return balance;
}
function findBalance(productId, locationId) {
  return findBalanceIn(db, productId, locationId);
}
var now, runtimeConfig, stateFile, sqliteFile, useJsonState, sqliteDatabase, sqliteInitialized, expectedSchemaVersions, expectedRuntimeTables, users, locations, products, balances, db;
var init_store = __esm({
  "src/server/store.ts"() {
    "use strict";
    init_permissions();
    init_migrations();
    init_state_migration();
    init_config();
    init_database();
    init_quantity();
    now = () => (/* @__PURE__ */ new Date()).toISOString();
    runtimeConfig = assertRuntimeConfig();
    stateFile = runtimeConfig.stateFile || path5.resolve(process.cwd(), "data/dvorik-state.json");
    sqliteFile = runtimeConfig.sqliteFile;
    useJsonState = Boolean(runtimeConfig.stateFile) && !process.env.DVORIK_SQLITE_FILE;
    sqliteInitialized = false;
    expectedSchemaVersions = [1, ...listMigrations().map((migration) => migration.version)].filter((version2, index, versions) => versions.indexOf(version2) === index).sort((left, right) => left - right);
    expectedRuntimeTables = [
      "schema_migrations",
      "app_state",
      "roles",
      "permissions",
      "users",
      "user_roles",
      "role_permissions",
      "sessions",
      "suppliers",
      "products",
      "product_identifiers",
      "supplier_skus",
      "product_aliases",
      "locations",
      "stock_balances",
      "stock_operations",
      "schedule_days",
      "shifts",
      "shift_assignments",
      "shift_swap_requests",
      "rotation_templates",
      "imports",
      "import_rows",
      "merge_jobs",
      "label_jobs",
      "notification_preferences",
      "outbox_messages",
      "audit_entries",
      "idempotency_keys",
      "migration_batches",
      "telegram_updates",
      "webapp_notifications"
    ];
    users = [
      {
        id: "u-super",
        telegramUserId: "1001",
        firstName: "\u0410\u043D\u043D\u0430",
        lastName: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446",
        username: "anna_owner",
        status: "active",
        role: "super_admin",
        permissions: rolePermissions.super_admin
      },
      {
        id: "u-admin",
        telegramUserId: "1002",
        firstName: "\u041E\u043B\u0435\u0433",
        lastName: "\u0410\u0434\u043C\u0438\u043D",
        username: "oleg_admin",
        status: "active",
        role: "admin",
        permissions: rolePermissions.admin
      },
      {
        id: "u-seller",
        telegramUserId: "1003",
        firstName: "\u041C\u0430\u0448\u0430",
        lastName: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446",
        username: "masha_shop",
        status: "active",
        role: "seller",
        permissions: rolePermissions.seller
      },
      {
        id: "u-blocked",
        telegramUserId: "1004",
        firstName: "\u0418\u0433\u043E\u0440\u044C",
        lastName: "\u0411\u043B\u043E\u043A",
        username: "blocked",
        status: "blocked",
        role: "seller",
        permissions: rolePermissions.seller
      }
    ];
    locations = [
      { id: "loc-main", code: "WAREHOUSE", name: "\u0421\u043A\u043B\u0430\u0434", type: "warehouse", status: "active" },
      { id: "loc-counter", code: "COUNTER", name: "\u0417\u0430 \u0441\u0442\u043E\u0439\u043A\u043E\u0439", type: "counter", status: "active" },
      { id: "loc-house", code: "HOUSE-1", name: "\u0414\u043E\u043C\u0438\u043A 1", type: "house", status: "active" }
    ];
    products = [
      {
        id: "p-1",
        officialName: "\u041C\u0430\u0440\u043C\u0435\u043B\u0430\u0434 \u0430\u0441\u0441\u043E\u0440\u0442\u0438",
        localName: "\u0410\u0441\u0441\u043E\u0440\u0442\u0438",
        unit: "\u043A\u0433",
        photoUrl: "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=900&q=80",
        category: "\u0412\u0435\u0441\u043E\u0432\u043E\u0439 \u0442\u043E\u0432\u0430\u0440",
        tags: ["\u0445\u0438\u0442", "\u0441\u043B\u0430\u0434\u043A\u043E\u0435"],
        status: "active",
        identifiers: [
          { id: "i-1", productId: "p-1", type: "supplier_article", value: "A-100", supplierId: "sup-1" },
          { id: "i-2", productId: "p-1", type: "barcode", value: "4601234567890" }
        ],
        lowStockThreshold: 5
      },
      {
        id: "p-2",
        officialName: "\u041F\u0430\u0441\u0442\u0438\u043B\u0430 \u044F\u0431\u043B\u043E\u0447\u043D\u0430\u044F",
        localName: "\u041F\u0430\u0441\u0442\u0438\u043B\u0430 \u044F\u0431\u043B\u043E\u043A\u043E",
        unit: "\u0448\u0442",
        photoUrl: "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=900&q=80",
        category: "\u0428\u0442\u0443\u0447\u043D\u044B\u0439 \u0442\u043E\u0432\u0430\u0440",
        tags: ["\u0431\u0435\u0437 \u0441\u0430\u0445\u0430\u0440\u0430"],
        status: "active",
        identifiers: [
          { id: "i-3", productId: "p-2", type: "supplier_article", value: "A-100", supplierId: "sup-2" },
          { id: "i-4", productId: "p-2", type: "barcode", value: "2000000000022" }
        ],
        lowStockThreshold: 12
      },
      {
        id: "p-3",
        officialName: "\u0428\u043E\u043A\u043E\u043B\u0430\u0434 \u0444\u0438\u0433\u0443\u0440\u043D\u044B\u0439",
        localName: "\u0424\u0438\u0433\u0443\u0440\u043A\u0438",
        unit: "\u0448\u0442",
        photoUrl: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?auto=format&fit=crop&w=900&q=80",
        category: "\u041F\u043E\u0434\u0430\u0440\u043A\u0438",
        tags: ["\u0441\u0435\u0437\u043E\u043D"],
        status: "active",
        identifiers: [{ id: "i-5", productId: "p-3", type: "legacy_article", value: "LEG-77" }],
        lowStockThreshold: 10
      }
    ];
    balances = [
      { productId: "p-1", locationId: "loc-main", quantity: 18.5, version: 1 },
      { productId: "p-1", locationId: "loc-counter", quantity: 3, version: 1 },
      { productId: "p-2", locationId: "loc-main", quantity: 32, version: 1 },
      { productId: "p-2", locationId: "loc-house", quantity: 6, version: 1 },
      { productId: "p-3", locationId: "loc-main", quantity: 8, version: 1 }
    ];
    db = runtimeConfig.production ? createSeedState() : loadState();
  }
});

// src/server/domain.ts
var domain_exports = {};
__export(domain_exports, {
  DomainError: () => DomainError,
  acceptSwap: () => acceptSwap,
  applyBufferedStockOperations: () => applyBufferedStockOperations,
  applyInventory: () => applyInventory,
  applyStockOperation: () => applyStockOperation,
  cancelSwap: () => cancelSwap,
  commitArchiveCandidates: () => commitArchiveCandidates,
  commitCsvImport: () => commitCsvImport,
  commitFutureReplacement: () => commitFutureReplacement,
  commitProductMerge: () => commitProductMerge,
  commitRotation: () => commitRotation,
  copyShift: () => copyShift,
  createShift: () => createShift,
  createSwapRequest: () => createSwapRequest,
  declineSwap: () => declineSwap,
  detectImportColumnMapping: () => detectImportColumnMapping,
  detectImportHeaderRow: () => detectImportHeaderRow,
  inventorySnapshot: () => inventorySnapshot,
  listInventoryDiscrepancies: () => listInventoryDiscrepancies,
  listVisibleScheduleShifts: () => listVisibleScheduleShifts,
  listVisibleScheduleSwaps: () => listVisibleScheduleSwaps,
  parseImportRows: () => parseImportRows,
  previewArchiveCandidates: () => previewArchiveCandidates,
  previewCsvImport: () => previewCsvImport,
  previewFutureReplacement: () => previewFutureReplacement,
  previewProductMerge: () => previewProductMerge,
  previewRotation: () => previewRotation,
  refreshScheduleState: () => refreshScheduleState,
  requirePermission: () => requirePermission,
  reverseOperation: () => reverseOperation,
  roundQty: () => roundQty,
  setScheduleDay: () => setScheduleDay,
  undoCsvImport: () => undoCsvImport,
  undoProductMerge: () => undoProductMerge,
  updateShift: () => updateShift
});
import { nanoid as nanoid15 } from "nanoid";
import crypto5 from "node:crypto";
import zlib from "node:zlib";
function listVisibleScheduleShifts(user) {
  if (user.status !== "active") return [];
  return db.shifts;
}
function listVisibleScheduleSwaps(user) {
  if (hasPermission(user, "schedule:manage")) return db.swaps;
  return db.swaps.filter((swap) => swap.fromUserId === user.id || swap.toUserId === user.id).map(({ fromShiftId: _fromShiftId, ...swap }) => swap);
}
function domainQuantity(quantity3, unit, allowZero = false) {
  try {
    return requireQuantity(quantity3, { unit, allowZero });
  } catch (error) {
    if (!(error instanceof QuantityError)) throw error;
    throw new DomainError("BAD_QUANTITY", "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0443\u043B\u044F");
  }
}
function requireIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey.trim()) throw new DomainError("IDEMPOTENCY_REQUIRED", "\u041D\u0443\u0436\u0435\u043D idempotency key");
}
function requireProduct(productId, state = db) {
  const product = state.products.find((item) => item.id === productId && item.status !== "deleted");
  if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404, { productId });
  return product;
}
function requireLocation(locationId, role, state = db) {
  if (!locationId) return void 0;
  const location = state.locations.find((item) => item.id === locationId && item.status === "active");
  if (!location) throw new DomainError("LOCATION_NOT_FOUND", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404, { locationId, role });
  return location;
}
function minutesFromTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new DomainError("BAD_SHIFT_TIME", "\u0412\u0440\u0435\u043C\u044F \u0441\u043C\u0435\u043D\u044B \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 HH:MM");
  return Number(match[1]) * 60 + Number(match[2]);
}
function requireDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new DomainError("BAD_SHIFT_DATE", "\u0414\u0430\u0442\u0430 \u0441\u043C\u0435\u043D\u044B \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 YYYY-MM-DD");
  }
  return value;
}
function requireShiftStatus(value) {
  const status = String(value || "scheduled");
  if (!shiftStatuses2.includes(status)) throw new DomainError("BAD_SHIFT_STATUS", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u043C\u0435\u043D\u044B");
  return status;
}
function vladivostokNow(date2) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Vladivostok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date2).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}
function nextAutomaticShiftStatus(shift, current) {
  if (shift.status === "draft" || shift.status === "completed" || shift.status === "cancelled") return shift.status;
  if (shift.date < current.date) return "completed";
  if (shift.date > current.date) return shift.status;
  const end = minutesFromTime(shift.end);
  if (current.minutes >= end) return "completed";
  const start = minutesFromTime(shift.start);
  if (current.minutes >= start && shift.status === "scheduled") return "in_progress";
  return shift.status;
}
function refreshScheduleState(date2 = /* @__PURE__ */ new Date(), actorId = "system") {
  const current = vladivostokNow(date2);
  const changed = [];
  for (const shift of db.shifts) {
    const nextStatus = nextAutomaticShiftStatus(shift, current);
    if (nextStatus !== shift.status) {
      const previousStatus = shift.status;
      shift.status = nextStatus;
      changed.push({ entity: "shift", id: shift.id, from: previousStatus, to: nextStatus });
    }
  }
  for (const swap of db.swaps) {
    const shift = db.shifts.find((item) => item.id === swap.fromShiftId);
    if (swap.status === "pending" && (!shift || shift.status !== "scheduled")) {
      swap.status = "expired";
      changed.push({ entity: "shift_swap", id: swap.id, from: "pending", to: "expired" });
    }
  }
  for (const item of changed) {
    audit(actorId, item.entity, item.id, "auto_status", { from: item.from, to: item.to });
  }
  return changed;
}
function requireShiftEmployee(employeeIds, state = db) {
  const ids = Array.isArray(employeeIds) ? [...new Set(employeeIds.map(String).filter(Boolean))] : [];
  if (!ids.length) throw new DomainError("BAD_SHIFT_EMPLOYEES", "\u041D\u0443\u0436\u043D\u043E \u043D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430");
  const missing = ids.filter((id) => !state.users.some((user) => user.id === id && user.status === "active"));
  if (missing.length) throw new DomainError("BAD_SHIFT_EMPLOYEES", "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 400, missing);
  return ids;
}
function assertNoShiftOverlap(input, state = db) {
  const start = minutesFromTime(input.start);
  const end = minutesFromTime(input.end);
  if (end <= start) throw new DomainError("BAD_SHIFT_TIME", "\u041E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435 \u0441\u043C\u0435\u043D\u044B \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043F\u043E\u0437\u0436\u0435 \u043D\u0430\u0447\u0430\u043B\u0430");
  const conflicts = state.shifts.filter((shift) => {
    if (shift.id === input.excludeShiftId || shift.date !== input.date || shift.status === "cancelled") return false;
    if (!shift.employeeIds.some((id) => input.employeeIds.includes(id))) return false;
    return start < minutesFromTime(shift.end) && end > minutesFromTime(shift.start);
  });
  if (conflicts.length) {
    throw new DomainError("SHIFT_OVERLAP", "\u0423 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0441\u043C\u0435\u043D\u0430 \u0432 \u044D\u0442\u043E\u0442 \u0434\u0435\u043D\u044C", 409, conflicts.map((shift) => shift.id));
  }
}
function getScheduleDay(state, date2, locationId) {
  return state.scheduleDays.find((day) => day.date === date2 && day.locationId === locationId);
}
function requireWorkingScheduleDay(state, date2, locationId) {
  const day = getScheduleDay(state, date2, locationId);
  if (day?.status === "closed") throw new DomainError("SCHEDULE_DAY_CLOSED", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u0430 \u0432 \u044D\u0442\u0443 \u0434\u0430\u0442\u0443", 409, { date: date2, locationId });
  return day;
}
function setScheduleDay(user, input) {
  requirePermission(user, "schedule:manage");
  return stateTransaction((state) => {
    const date2 = requireDate(input.date);
    requireLocation(input.locationId, "target", state);
    if (input.status !== "working" && input.status !== "closed") throw new DomainError("BAD_SCHEDULE_DAY_STATUS", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0434\u043D\u044F");
    const affected = state.shifts.filter((shift) => shift.date === date2 && shift.locationId === input.locationId && (shift.status === "draft" || shift.status === "scheduled"));
    if (input.status === "closed" && affected.length) throw new DomainError("SCHEDULE_DAY_HAS_SHIFTS", "\u041D\u0435\u043B\u044C\u0437\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0434\u0435\u043D\u044C \u0441 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u043C\u0438 \u0441\u043C\u0435\u043D\u0430\u043C\u0438", 409, affected.map((shift) => shift.id));
    const existing = getScheduleDay(state, date2, input.locationId);
    const day = existing || { id: nanoid15(), date: date2, locationId: input.locationId, status: input.status, comment: "", version: 0 };
    day.status = input.status;
    day.comment = String(input.comment || "");
    day.version += existing ? 1 : 0;
    if (!existing) state.scheduleDays.unshift(day);
    appendAudit(state, user.id, "schedule_day", day.id, existing ? "update" : "create", { date: date2, locationId: input.locationId, status: day.status });
    return day;
  });
}
function rotationDates(startDate, endDate) {
  const start = requireDate(startDate);
  const end = requireDate(endDate);
  if (start > end) throw new DomainError("BAD_ROTATION_RANGE", "\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u0440\u0430\u043D\u044C\u0448\u0435 \u0434\u0430\u0442\u044B \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F");
  const dates = [];
  const cursor = /* @__PURE__ */ new Date(`${start}T00:00:00.000Z`);
  const limit = (/* @__PURE__ */ new Date(`${end}T00:00:00.000Z`)).getTime();
  while (cursor.getTime() <= limit) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length > 370) throw new DomainError("BAD_ROTATION_RANGE", "\u041F\u0435\u0440\u0438\u043E\u0434 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0442\u044C 370 \u0434\u043D\u0435\u0439");
  return dates;
}
function previewRotationIn(state, input) {
  requireLocation(input.locationId, "target", state);
  const employees = requireShiftEmployee(input.employeeIds, state);
  const preview = { shifts: [], skippedClosedDays: [], conflicts: [] };
  rotationDates(input.startDate, input.endDate).forEach((date2, index) => {
    if (getScheduleDay(state, date2, input.locationId)?.status === "closed") {
      preview.skippedClosedDays.push(date2);
      return;
    }
    const employeeId = employees[index % employees.length];
    const conflicts = state.shifts.filter((shift) => shift.date === date2 && shift.status !== "cancelled" && shift.employeeIds.includes(employeeId)).map((shift) => shift.id);
    if (conflicts.length) {
      preview.conflicts.push({ date: date2, employeeId, shiftIds: conflicts });
      return;
    }
    preview.shifts.push({ date: date2, locationId: input.locationId, employeeIds: [employeeId], status: "scheduled", comment: String(input.comment || "") });
  });
  return preview;
}
function previewRotation(user, input) {
  requirePermission(user, "schedule:manage");
  return previewRotationIn(db, input);
}
function commitRotation(user, input) {
  requirePermission(user, "schedule:manage");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `rotation:${input.idempotencyKey}`;
    const cached = state.idempotency[cacheKey];
    if (cached) return cached;
    const preview = previewRotationIn(state, input);
    if (preview.conflicts.length) throw new DomainError("ROTATION_CONFLICT", "\u0413\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u044B", 409, preview);
    const shiftIds = preview.shifts.map((item) => {
      const shift = { id: nanoid15(), start: DAY_SHIFT_START, end: DAY_SHIFT_END, ...item };
      state.shifts.unshift(shift);
      return shift.id;
    });
    const result = { ...preview, shiftIds };
    state.idempotency[cacheKey] = result;
    appendAudit(state, user.id, "schedule_rotation", input.idempotencyKey, "commit", { shifts: shiftIds, skippedClosedDays: preview.skippedClosedDays });
    return result;
  });
}
function previewFutureReplacementIn(state, input) {
  const dates = new Set(rotationDates(input.startDate, input.endDate));
  const target = state.users.find((user) => user.id === input.toUserId && user.status === "active");
  if (!target || input.fromUserId === input.toUserId) throw new DomainError("BAD_REPLACEMENT_TARGET", "\u041D\u0443\u0436\u0435\u043D \u0434\u0440\u0443\u0433\u043E\u0439 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A");
  const preview = { replacements: [], conflicts: [] };
  for (const shift of state.shifts.filter((shift2) => dates.has(shift2.date) && (shift2.status === "draft" || shift2.status === "scheduled") && shift2.employeeIds.includes(input.fromUserId))) {
    const conflictShiftIds = state.shifts.filter((candidate) => candidate.id !== shift.id && candidate.date === shift.date && candidate.status !== "cancelled" && candidate.employeeIds.includes(input.toUserId)).map((candidate) => candidate.id);
    if (conflictShiftIds.length) preview.conflicts.push({ shiftId: shift.id, date: shift.date, conflictShiftIds });
    else preview.replacements.push({ shiftId: shift.id, date: shift.date, locationId: shift.locationId });
  }
  return preview;
}
function previewFutureReplacement(user, input) {
  requirePermission(user, "schedule:manage");
  return previewFutureReplacementIn(db, input);
}
function commitFutureReplacement(user, input) {
  requirePermission(user, "schedule:manage");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `future-replacement:${input.idempotencyKey}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey];
    const preview = previewFutureReplacementIn(state, input);
    if (preview.conflicts.length) throw new DomainError("FUTURE_REPLACEMENT_CONFLICT", "\u0417\u0430\u043C\u0435\u043D\u0430 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u044B", 409, preview);
    for (const replacement of preview.replacements) {
      const shift = state.shifts.find((item) => item.id === replacement.shiftId);
      shift.employeeIds = shift.employeeIds.map((id) => id === input.fromUserId ? input.toUserId : id);
    }
    state.idempotency[cacheKey] = preview;
    appendAudit(state, user.id, "schedule_future_replacement", input.idempotencyKey, "commit", { fromUserId: input.fromUserId, toUserId: input.toUserId, shifts: preview.replacements.map((item) => item.shiftId) });
    return preview;
  });
}
function previewArchiveCandidates(user, inactiveDays, nowDate = /* @__PURE__ */ new Date()) {
  requirePermission(user, "products:write");
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1) throw new DomainError("BAD_ARCHIVE_DAYS", "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043D\u0435\u0439 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u043C \u0446\u0435\u043B\u044B\u043C");
  const cutoff = nowDate.getTime() - inactiveDays * 864e5;
  return db.products.filter((product) => product.status === "active").filter((product) => {
    if (db.balances.some((balance) => balance.productId === product.id && balance.quantity !== 0)) return false;
    const lastReceipt = db.operations.filter((operation) => operation.productId === product.id && operation.type === "receipt").map((operation) => new Date(operation.createdAt).getTime()).sort((a, b) => b - a)[0];
    return !lastReceipt || lastReceipt < cutoff;
  }).map((product) => ({ id: product.id, name: product.localName || product.officialName }));
}
function commitArchiveCandidates(user, input) {
  requirePermission(user, "products:write");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `archive:${input.idempotencyKey}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey];
    const candidates = new Set(previewArchiveCandidates(user, input.inactiveDays).map((item) => item.id));
    const ids = [...new Set(input.productIds)].filter((id) => candidates.has(id));
    if (ids.length !== input.productIds.length) throw new DomainError("ARCHIVE_CANDIDATE_CHANGED", "\u0421\u043F\u0438\u0441\u043E\u043A \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F", 409);
    for (const product of state.products.filter((product2) => ids.includes(product2.id))) product.status = "archived";
    state.idempotency[cacheKey] = ids;
    appendAudit(state, user.id, "product_archive", input.idempotencyKey, "commit", { productIds: ids, inactiveDays: input.inactiveDays });
    return ids;
  });
}
function applyStockOperation(input) {
  requirePermission(input.user, "stock:move");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `stock:${input.idempotencyKey}`;
    const cached = state.idempotency[cacheKey];
    if (cached) return cached;
    const product = requireProduct(input.productId, state);
    const quantity3 = domainQuantity(input.quantity, product.unit, false);
    requireLocation(input.fromLocationId, "source", state);
    requireLocation(input.toLocationId, "target", state);
    const from = input.fromLocationId ? findBalanceIn(state, input.productId, input.fromLocationId) : void 0;
    const to = input.toLocationId ? findBalanceIn(state, input.productId, input.toLocationId) : void 0;
    if (input.type === "transfer") {
      if (!from || !to) throw new DomainError("BAD_TRANSFER", "\u041D\u0443\u0436\u043D\u044B \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435");
      if (input.fromLocationId === input.toLocationId) throw new DomainError("BAD_TRANSFER", "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F");
      if (from.quantity < quantity3) throw new DomainError("NEGATIVE_STOCK_BLOCKED", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u0442\u0430\u0442\u044C \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C");
      from.quantity = subtractQuantity(from.quantity, quantity3, product.unit);
      from.version += 1;
      to.quantity = addQuantity(to.quantity, quantity3, product.unit);
      to.version += 1;
    } else if (input.type === "write_off") {
      if (!from) throw new DomainError("BAD_WRITE_OFF", "\u041D\u0443\u0436\u0435\u043D \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
      if (from.quantity < quantity3) throw new DomainError("NEGATIVE_STOCK_BLOCKED", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u0442\u0430\u0442\u044C \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C");
      from.quantity = subtractQuantity(from.quantity, quantity3, product.unit);
      from.version += 1;
    } else if (input.type === "receipt" || input.type === "correction") {
      if (!to) throw new DomainError("BAD_RECEIPT", "\u041D\u0443\u0436\u043D\u043E \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0430");
      to.quantity = addQuantity(to.quantity, quantity3, product.unit);
      to.version += 1;
    } else {
      throw new DomainError("UNSUPPORTED_OPERATION", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0430\u043D\u0430 \u044D\u0442\u0438\u043C endpoint");
    }
    const operation = { id: nanoid15(), type: input.type, productId: input.productId, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, quantity: quantity3, actorId: input.user.id, reason: input.reason || "\u0411\u0435\u0437 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F", idempotencyKey: input.idempotencyKey, createdAt: now2() };
    state.operations.unshift(operation);
    state.idempotency[cacheKey] = operation;
    appendAudit(state, input.user.id, "stock_operation", operation.id, "create", operation);
    return operation;
  });
}
function applyBufferedStockOperations(user, entries, idempotencyKey) {
  requireIdempotencyKey(idempotencyKey);
  if (!entries.length) throw new DomainError("EMPTY_BUFFER", "\u0411\u0443\u0444\u0435\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439 \u043F\u0443\u0441\u0442", 400);
  const results = [];
  for (const [index, entry] of entries.entries()) {
    const key = `${idempotencyKey}:${entry.id || index}`;
    try {
      if (!entry.reason?.trim()) throw new DomainError("COMMENT_REQUIRED", "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438", 400);
      if (entry.type === "inventory") {
        if (!entry.toLocationId) throw new DomainError("BAD_INVENTORY_LOCATION", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u0446\u0438\u044E \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438", 400);
        if (!Number.isFinite(entry.actual) || (entry.actual ?? 0) < 0) {
          throw new DomainError("BAD_INVENTORY_ACTUAL", "\u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0443\u043B\u0451\u043C \u0438\u043B\u0438 \u0431\u043E\u043B\u044C\u0448\u0435", 400);
        }
        const snapshot = inventorySnapshot(entry.toLocationId);
        const row = snapshot.find((item) => item.productId === entry.productId);
        if (!row) throw new DomainError("NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043B\u043E\u043A\u0430\u0446\u0438\u0438", 404);
        const operations = applyInventory(user, [{ ...row, actual: entry.actual }], entry.reason, key);
        results.push({ id: entry.id, status: "applied", operationIds: operations.map((operation) => operation.id) });
      } else {
        const operation = applyStockOperation({
          user,
          type: entry.type,
          productId: entry.productId,
          fromLocationId: entry.fromLocationId,
          toLocationId: entry.toLocationId,
          quantity: entry.quantity ?? 0,
          reason: entry.reason,
          idempotencyKey: key
        });
        results.push({ id: entry.id, status: "applied", operationIds: [operation.id] });
      }
    } catch (error) {
      results.push({ id: entry.id, status: "failed", error: error instanceof Error ? error.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E" });
      break;
    }
  }
  audit(user.id, "stock_buffer", idempotencyKey, "apply", { total: entries.length, applied: results.filter((item) => item.status === "applied").length });
  return results;
}
function reverseOperation(user, operationId, idempotencyKey) {
  requirePermission(user, "techlog:read");
  requireIdempotencyKey(idempotencyKey);
  const cacheKey = `reversal:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached;
  const original = db.operations.find((item) => item.id === operationId);
  if (!original) throw new DomainError("NOT_FOUND", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  if (original.type === "reversal") throw new DomainError("BAD_REVERSAL_TARGET", "\u041D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E \u043E\u0442\u043C\u0435\u043D\u044B");
  if (db.operations.some((item) => item.reversedOperationId === operationId)) {
    throw new DomainError("ALREADY_REVERSED", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430");
  }
  const reverseType = "reversal";
  const product = requireProduct(original.productId);
  const from = original.toLocationId ? findBalance(original.productId, original.toLocationId) : void 0;
  const to = original.fromLocationId ? findBalance(original.productId, original.fromLocationId) : void 0;
  if (from && from.quantity < original.quantity) {
    throw new DomainError("NEGATIVE_STOCK_BLOCKED", "\u041E\u0442\u043C\u0435\u043D\u0430 \u043F\u0440\u0438\u0432\u0435\u0434\u0451\u0442 \u043A \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u043C\u0443 \u043E\u0441\u0442\u0430\u0442\u043A\u0443");
  }
  if (from) {
    from.quantity = subtractQuantity(from.quantity, original.quantity, product.unit);
    from.version += 1;
  }
  if (to) {
    to.quantity = addQuantity(to.quantity, original.quantity, product.unit);
    to.version += 1;
  }
  const reversal = {
    id: nanoid15(),
    type: reverseType,
    productId: original.productId,
    fromLocationId: original.toLocationId,
    toLocationId: original.fromLocationId,
    quantity: original.quantity,
    actorId: user.id,
    reason: `\u041E\u0442\u043C\u0435\u043D\u0430 ${original.id}`,
    idempotencyKey,
    reversedOperationId: original.id,
    createdAt: now2()
  };
  db.operations.unshift(reversal);
  db.idempotency[cacheKey] = reversal;
  audit(user.id, "stock_operation", reversal.id, "reverse", { originalId: original.id });
  return reversal;
}
function inventorySnapshot(locationId) {
  requireLocation(locationId, "target");
  return db.balances.filter((balance) => balance.locationId === locationId).map((balance) => ({
    productId: balance.productId,
    locationId,
    expected: balance.quantity,
    version: balance.version
  }));
}
function applyInventory(user, rows, comment, idempotencyKey) {
  requirePermission(user, "inventory:write");
  requireIdempotencyKey(idempotencyKey);
  if (!comment.trim()) throw new DomainError("COMMENT_REQUIRED", "\u0414\u043B\u044F \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439");
  const cacheKey = `inventory:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached;
  const normalizedRows = rows.map((row) => {
    const product = requireProduct(row.productId);
    requireLocation(row.locationId, "target");
    if (row.actual === void 0) return { row, invalid: true };
    try {
      return { row: { ...row, actual: requireQuantity(row.actual, { unit: product.unit }) }, invalid: false };
    } catch {
      return { row, invalid: true };
    }
  });
  const invalidRows = normalizedRows.filter((item) => item.invalid).map((item) => item.row);
  if (invalidRows.length) {
    throw new DomainError("BAD_INVENTORY_ACTUAL", "\u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0443\u043B\u0451\u043C \u0438\u043B\u0438 \u0431\u043E\u043B\u044C\u0448\u0435", 400, invalidRows);
  }
  const validRows = normalizedRows.filter((item) => !item.invalid).map((item) => item.row);
  const conflicts = validRows.filter((row) => findBalance(row.productId, row.locationId).version !== row.version);
  if (conflicts.length) {
    throw new DomainError("INVENTORY_CONFLICT", "\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0441\u043B\u0435 snapshot", 409, conflicts);
  }
  const operations = [];
  for (const row of validRows) {
    const balance = findBalance(row.productId, row.locationId);
    const product = requireProduct(row.productId);
    const actual = row.actual ?? 0;
    const delta = subtractQuantity(actual, balance.quantity, product.unit);
    if (delta === 0) continue;
    balance.quantity = normalizeQuantity(actual, product.unit);
    balance.version += 1;
    const operation = {
      id: nanoid15(),
      type: "inventory_adjustment",
      productId: row.productId,
      toLocationId: row.locationId,
      quantity: Math.abs(delta),
      actorId: user.id,
      reason: comment,
      idempotencyKey: `${idempotencyKey}:${row.productId}:${row.locationId}`,
      metadata: { expected: balance.quantity - delta, actual, delta },
      createdAt: now2()
    };
    db.operations.unshift(operation);
    operations.push(operation);
  }
  db.idempotency[cacheKey] = operations;
  audit(user.id, "inventory", idempotencyKey, "apply", { rows: operations.length, comment });
  return operations;
}
function listInventoryDiscrepancies(user, input = {}) {
  requirePermission(user, "reports:read");
  const from = input.from || "0000-01-01";
  const to = input.to || "9999-12-31";
  return db.operations.filter((operation) => operation.type === "inventory_adjustment").filter((operation) => operation.createdAt.slice(0, 10) >= from && operation.createdAt.slice(0, 10) <= to).filter((operation) => !input.productId || operation.productId === input.productId).filter((operation) => !input.locationId || operation.toLocationId === input.locationId).map((operation) => {
    const metadata = operation.metadata || {};
    const numberOrNull = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const product = db.products.find((item) => item.id === operation.productId);
    const location = db.locations.find((item) => item.id === operation.toLocationId);
    const actor3 = db.users.find((item) => item.id === operation.actorId);
    return {
      id: operation.id,
      createdAt: operation.createdAt,
      productId: operation.productId,
      productName: product?.localName || product?.officialName || operation.productId,
      locationId: operation.toLocationId || "",
      locationName: location?.name || operation.toLocationId || "",
      actorId: operation.actorId,
      actorName: [actor3?.firstName, actor3?.lastName].filter(Boolean).join(" ") || actor3?.username || operation.actorId,
      expected: numberOrNull(metadata.expected),
      actual: numberOrNull(metadata.actual),
      delta: numberOrNull(metadata.delta),
      quantity: operation.quantity,
      reason: operation.reason
    };
  });
}
function createShift(user, input) {
  requirePermission(user, "schedule:manage");
  return stateTransaction((state) => {
    const shift = {
      id: nanoid15(),
      date: requireDate(String(input.date || "")),
      start: DAY_SHIFT_START,
      end: DAY_SHIFT_END,
      locationId: String(input.locationId || ""),
      employeeIds: requireShiftEmployee(input.employeeIds, state),
      status: requireShiftStatus(input.status),
      comment: String(input.comment || "")
    };
    requireLocation(shift.locationId, "target", state);
    requireWorkingScheduleDay(state, shift.date, shift.locationId);
    assertNoShiftOverlap(shift, state);
    state.shifts.unshift(shift);
    appendAudit(state, user.id, "shift", shift.id, "create", shift);
    return shift;
  });
}
function updateShift(user, shiftId, input) {
  requirePermission(user, "schedule:manage");
  const shift = db.shifts.find((item) => item.id === shiftId);
  if (!shift) throw new DomainError("NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  const next = {
    ...shift,
    date: input.date !== void 0 ? requireDate(String(input.date)) : shift.date,
    start: DAY_SHIFT_START,
    end: DAY_SHIFT_END,
    locationId: input.locationId !== void 0 ? String(input.locationId) : shift.locationId,
    employeeIds: input.employeeIds !== void 0 ? requireShiftEmployee(input.employeeIds) : requireShiftEmployee(shift.employeeIds),
    status: input.status !== void 0 ? requireShiftStatus(input.status) : shift.status,
    comment: input.comment !== void 0 ? String(input.comment) : shift.comment
  };
  requireLocation(next.locationId, "target");
  requireWorkingScheduleDay(db, next.date, next.locationId);
  assertNoShiftOverlap({ ...next, excludeShiftId: shift.id });
  Object.assign(shift, next);
  audit(user.id, "shift", shift.id, "update", input);
  return shift;
}
function copyShift(user, shiftId, date2) {
  requirePermission(user, "schedule:manage");
  const source = db.shifts.find((item) => item.id === shiftId);
  if (!source) throw new DomainError("NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  return createShift(user, {
    date: date2,
    start: source.start,
    end: source.end,
    locationId: source.locationId,
    employeeIds: source.employeeIds,
    status: source.status === "cancelled" ? "draft" : source.status,
    comment: source.comment
  });
}
function createSwapRequest(user, fromShiftId, toUserId) {
  return stateTransaction((state) => {
    const shift = state.shifts.find((item) => item.id === fromShiftId);
    if (!shift || !shift.employeeIds.includes(user.id)) throw new DomainError("FORBIDDEN", "\u041C\u043E\u0436\u043D\u043E \u043E\u0431\u043C\u0435\u043D\u0438\u0432\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u044E \u0441\u043C\u0435\u043D\u0443", 403);
    if (shift.status !== "scheduled") throw new DomainError("BAD_SWAP_SHIFT", "\u041E\u0431\u043C\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0441\u043C\u0435\u043D\u044B");
    if (toUserId === user.id) throw new DomainError("BAD_SWAP_TARGET", "\u041D\u0435\u043B\u044C\u0437\u044F \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u043E\u0431\u043C\u0435\u043D \u0441\u0430\u043C\u043E\u043C\u0443 \u0441\u0435\u0431\u0435");
    const target = state.users.find((item) => item.id === toUserId && item.status === "active");
    if (!target) throw new DomainError("BAD_SWAP_TARGET", "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C \u043E\u0431\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 400, { toUserId });
    const swap = { id: nanoid15(), fromShiftId: shift.id, fromUserId: user.id, toUserId, status: "pending", createdAt: now2() };
    state.swaps.unshift(swap);
    const idempotencyKey = `tg-swap-request:${swap.id}`;
    const message = {
      id: nanoid15(),
      channel: "telegram",
      userId: target.id,
      type: "telegram_swap_request",
      status: "pending",
      attemptCount: 0,
      availableAt: now2(),
      createdAt: now2(),
      idempotencyKey,
      payload: {
        text: `${user.firstName || "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A"} \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u0442 \u043F\u043E\u0434\u043C\u0435\u043D\u0443 \u043D\u0430 ${shift.date}, ${shift.start}\u2013${shift.end}.`,
        reply_markup: { inline_keyboard: [[
          { text: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C", callback_data: `swap:accept:${swap.id}` },
          { text: "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C", callback_data: `swap:decline:${swap.id}` }
        ]] }
      }
    };
    if (!state.outbox.some((item) => item.channel === "telegram" && item.idempotencyKey === idempotencyKey)) state.outbox.unshift(message);
    appendAudit(state, user.id, "shift_swap", swap.id, "create", swap);
    return swap;
  });
}
function cancelSwap(user, swapId) {
  const swap = db.swaps.find((item) => item.id === swapId);
  if (!swap) throw new DomainError("NOT_FOUND", "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  if (swap.fromUserId !== user.id) throw new DomainError("FORBIDDEN", "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443 \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u043E\u0440", 403);
  if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u0430");
  swap.status = "cancelled";
  audit(user.id, "shift_swap", swap.id, "cancel", { fromShiftId: swap.fromShiftId });
  return swap;
}
function declineSwap(user, swapId) {
  const swap = db.swaps.find((item) => item.id === swapId);
  if (!swap) throw new DomainError("NOT_FOUND", "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  if (swap.toUserId !== user.id) throw new DomainError("FORBIDDEN", "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443 \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A", 403);
  if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u0430");
  swap.status = "declined";
  audit(user.id, "shift_swap", swap.id, "decline", { fromShiftId: swap.fromShiftId });
  return swap;
}
function validateImportRow(row) {
  const name = String(row.name || row.officialName || row["\u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435"] || "").trim();
  if (!name) return { error: "\u041D\u0435\u0442 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u0442\u043E\u0432\u0430\u0440\u0430" };
  const unit = String(row.unit || row["\u0435\u0434"] || "\u0448\u0442").trim();
  if (!["\u0448\u0442", "\u043A\u0433", "\u043B", "\u043C"].includes(unit)) return { error: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F" };
  let quantity3;
  try {
    quantity3 = requireQuantity(Number(row.quantity || row.qty || row["\u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E"] || 0), { unit });
  } catch {
    return { error: unit === "\u0448\u0442" ? "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0432 \u0448\u0442\u0443\u043A\u0430\u0445 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0446\u0435\u043B\u044B\u043C" : "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043D\u0443\u043B\u0451\u043C \u0438\u043B\u0438 \u0431\u043E\u043B\u044C\u0448\u0435 \u0441 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C\u044E \u0434\u043E 0.001" };
  }
  const warnings = [];
  if (!String(row.sku || "").trim()) warnings.push("\u041D\u0435\u0442 SKU: \u0442\u043E\u0432\u0430\u0440 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D \u0431\u0435\u0437 \u0430\u0440\u0442\u0438\u043A\u0443\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u043E\u0438\u0441\u043A\u0430");
  if (quantity3 === 0) warnings.push("\u041D\u0443\u043B\u0435\u0432\u043E\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E: \u043F\u0440\u0438\u0445\u043E\u0434 \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D");
  return { value: { name, quantity: quantity3, unit, localName: String(row.localName || name), sku: String(row.sku || "").trim() || void 0, category: String(row.category || "\u0418\u043C\u043F\u043E\u0440\u0442") }, warnings };
}
function supplierIdentifier(supplierName) {
  if (!supplierName) return void 0;
  return `supplier:${crypto5.createHash("sha256").update(supplierName.trim().toLocaleLowerCase("ru")).digest("hex").slice(0, 16)}`;
}
function previewCsvImport(user, fileName, csv, metadata = {}) {
  requirePermission(user, "imports:write");
  const parsed = parseImportTable(fileName, csv);
  const rawRows = parsed.rows;
  const mapping = { ...parsed.columnMapping, ...metadata.columnMapping };
  const rows = rawRows.map((row) => ({ ...row, ...Object.fromEntries(Object.entries(mapping).flatMap(([target, source]) => source && row[source] !== void 0 ? [[target, row[source]]] : [])) }));
  if (!rows.length) throw new DomainError("EMPTY_IMPORT", "\u0424\u0430\u0439\u043B \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0441\u0442\u0440\u043E\u043A");
  const warnings = [];
  const rejectedRows = [];
  rows.forEach((row, index) => {
    const validation = validateImportRow(row);
    if ("error" in validation) rejectedRows.push({ row: index + 1, message: validation.error || "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430", values: row });
    else validation.warnings.forEach((message) => warnings.push({ row: index + 1, message }));
  });
  const hash = crypto5.createHash("sha256").update(csv).digest("hex");
  const existing = db.imports.find((item) => item.hash === hash && item.status === "committed");
  if (existing) throw new DomainError("DUPLICATE_IMPORT", "\u0422\u0430\u043A\u043E\u0439 \u0444\u0430\u0439\u043B \u0443\u0436\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D", 409, { importId: existing.id });
  const draft = {
    id: nanoid15(),
    status: "previewed",
    fileName,
    hash,
    supplierName: metadata.supplierName?.trim() || void 0,
    invoiceNumber: metadata.invoiceNumber?.trim() || void 0,
    columnMapping: Object.keys(mapping).length ? mapping : void 0,
    rows,
    warnings,
    rejectedRows,
    createdAt: now2()
  };
  db.imports.unshift(draft);
  audit(user.id, "supply_import", draft.id, "preview", { rows: rows.length, fileName });
  return draft;
}
function commitCsvImport(user, importId, locationId, idempotencyKey) {
  requirePermission(user, "imports:write");
  requireIdempotencyKey(idempotencyKey);
  requireLocation(locationId, "target");
  const cacheKey = `import:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached;
  const draft = db.imports.find((item) => item.id === importId);
  if (!draft) throw new DomainError("NOT_FOUND", "\u0418\u043C\u043F\u043E\u0440\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  if (draft.status !== "previewed") throw new DomainError("BAD_IMPORT_STATE", "\u0418\u043C\u043F\u043E\u0440\u0442 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D");
  const normalizedRows = draft.rows.flatMap((row) => {
    const validation = validateImportRow(row);
    return "value" in validation ? [validation.value] : [];
  });
  if (!normalizedRows.length) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u0412 \u0438\u043C\u043F\u043E\u0440\u0442\u0435 \u043D\u0435\u0442 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0445 \u0441\u0442\u0440\u043E\u043A");
  let createdProducts = 0;
  let receipts = 0;
  const productIds = [];
  const operationIds = [];
  for (const row of normalizedRows) {
    const product = {
      id: nanoid15(),
      officialName: row.name,
      localName: row.localName,
      unit: row.unit,
      photoUrl: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80",
      category: row.category,
      tags: [],
      status: "active",
      identifiers: row.sku ? [{ id: nanoid15(), productId: "", type: "supplier_article", value: row.sku, supplierId: supplierIdentifier(draft.supplierName) }] : [],
      lowStockThreshold: 5
    };
    product.identifiers = product.identifiers.map((identifier2) => ({ ...identifier2, productId: product.id }));
    db.products.unshift(product);
    productIds.push(product.id);
    createdProducts += 1;
    if (row.quantity > 0) {
      const operation = applyStockOperation({
        user,
        type: "receipt",
        productId: product.id,
        toLocationId: locationId,
        quantity: row.quantity,
        reason: `\u0418\u043C\u043F\u043E\u0440\u0442 ${draft.fileName}`,
        idempotencyKey: `${idempotencyKey}:${product.id}`
      });
      operationIds.push(operation.id);
      receipts += 1;
    }
  }
  draft.status = "committed";
  draft.result = { createdProducts, receipts, rejectedRows: draft.rejectedRows?.length || 0, productIds, operationIds, idempotencyKey };
  db.idempotency[cacheKey] = draft;
  audit(user.id, "supply_import", draft.id, "commit", draft.result);
  return draft;
}
function undoCsvImport(user, importId, idempotencyKey) {
  requirePermission(user, "imports:write");
  requireIdempotencyKey(idempotencyKey);
  const cacheKey = `import-undo:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached;
  const draft = db.imports.find((item) => item.id === importId);
  if (!draft) throw new DomainError("NOT_FOUND", "\u0418\u043C\u043F\u043E\u0440\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  if (draft.status !== "committed") throw new DomainError("BAD_IMPORT_STATE", "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 \u0438\u043C\u043F\u043E\u0440\u0442");
  const productIds = draft.result?.productIds || [];
  const operationIds = draft.result?.operationIds || [];
  const commitKey = draft.result?.idempotencyKey;
  if (!productIds.length || !commitKey) {
    throw new DomainError("IMPORT_UNDO_UNAVAILABLE", "\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E\u0442\u043A\u0430\u0442\u0430");
  }
  const dependentOperations = db.operations.filter((operation) => productIds.includes(operation.productId) && !operationIds.includes(operation.id));
  if (dependentOperations.length) {
    throw new DomainError("IMPORT_UNDO_CONFLICT", "\u041F\u043E\u0441\u043B\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u0431\u044B\u043B\u0438 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044F \u043F\u043E \u0441\u043E\u0437\u0434\u0430\u043D\u043D\u044B\u043C \u0442\u043E\u0432\u0430\u0440\u0430\u043C", 409, dependentOperations.map((operation) => operation.id));
  }
  for (const operationId of operationIds) {
    const operation = db.operations.find((item) => item.id === operationId);
    if (!operation) continue;
    if (operation.type !== "receipt" || !operation.toLocationId) {
      throw new DomainError("IMPORT_UNDO_CONFLICT", "\u041E\u0442\u043A\u0430\u0442 \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u0445\u043E\u0434\u043D\u044B\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438", 409, { operationId });
    }
    const balance = db.balances.find((item) => item.productId === operation.productId && item.locationId === operation.toLocationId);
    if (!balance || balance.quantity < operation.quantity) {
      throw new DomainError("IMPORT_UNDO_CONFLICT", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0430", 409, { operationId });
    }
    balance.quantity = roundQty(balance.quantity - operation.quantity);
    balance.version += 1;
  }
  db.operations = db.operations.filter((operation) => !operationIds.includes(operation.id));
  db.balances = db.balances.filter((balance) => !productIds.includes(balance.productId));
  db.products = db.products.filter((product) => !productIds.includes(product.id));
  delete db.idempotency[`import:${commitKey}`];
  for (const productId of productIds) {
    delete db.idempotency[`stock:${commitKey}:${productId}`];
  }
  draft.status = "reverted";
  db.idempotency[cacheKey] = draft;
  audit(user.id, "supply_import", draft.id, "undo", { productIds, operationIds });
  return draft;
}
function previewProductMerge(user, sourceProductId, targetProductId, resolution = {}) {
  requirePermission(user, "merge:write");
  if (sourceProductId === targetProductId) throw new DomainError("BAD_MERGE", "\u041D\u0443\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0432\u0430 \u0440\u0430\u0437\u043D\u044B\u0445 \u0442\u043E\u0432\u0430\u0440\u0430");
  const source = requireProduct(sourceProductId);
  const target = requireProduct(targetProductId);
  const merge = {
    id: nanoid15(),
    status: "previewed",
    sourceProductId,
    targetProductId,
    resolution,
    snapshot: {
      source: structuredClone(source),
      target: structuredClone(target),
      balances: structuredClone(db.balances.filter((balance) => balance.productId === sourceProductId || balance.productId === targetProductId)),
      operations: structuredClone(db.operations.filter((operation) => operation.productId === sourceProductId || operation.productId === targetProductId))
    },
    createdAt: now2()
  };
  db.merges.unshift(merge);
  audit(user.id, "product_merge", merge.id, "preview", { sourceProductId, targetProductId, resolution });
  return merge;
}
function commitProductMerge(user, mergeId) {
  requirePermission(user, "merge:write");
  const merge = db.merges.find((item) => item.id === mergeId);
  if (!merge) throw new DomainError("NOT_FOUND", "Merge \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  if (merge.status !== "previewed") throw new DomainError("BAD_MERGE_STATE", "Merge \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D");
  const source = requireProduct(merge.sourceProductId);
  const target = requireProduct(merge.targetProductId);
  if (source.unit !== target.unit) {
    throw new DomainError("MERGE_UNIT_MISMATCH", "\u041D\u0435\u043B\u044C\u0437\u044F \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u044B \u0441 \u0440\u0430\u0437\u043D\u044B\u043C\u0438 \u0435\u0434\u0438\u043D\u0438\u0446\u0430\u043C\u0438 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u0431\u0435\u0437 \u044F\u0432\u043D\u043E\u0439 \u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0430\u0446\u0438\u0438", 409);
  }
  const fields = ["officialName", "localName", "unit", "photoUrl", "category", "tags", "lowStockThreshold"];
  for (const field of fields) {
    if (merge.resolution?.[field] === "source") target[field] = structuredClone(source[field]);
  }
  merge.snapshot.operations = structuredClone(db.operations.filter((operation) => operation.productId === source.id || operation.productId === target.id));
  target.identifiers.push(...source.identifiers.map((identifier2) => ({ ...identifier2, id: nanoid15(), productId: target.id })));
  for (const sourceBalance of db.balances.filter((balance) => balance.productId === source.id)) {
    const targetBalance = db.balances.find((balance) => balance.productId === target.id && balance.locationId === sourceBalance.locationId);
    if (targetBalance) {
      targetBalance.quantity = addQuantity(targetBalance.quantity, sourceBalance.quantity, target.unit);
      targetBalance.version += 1;
    } else {
      db.balances.push({ ...sourceBalance, productId: target.id, version: sourceBalance.version + 1 });
    }
    sourceBalance.quantity = 0;
    sourceBalance.version += 1;
  }
  for (const operation of db.operations) {
    if (operation.productId === source.id) operation.productId = target.id;
  }
  source.status = "deleted";
  merge.status = "committed";
  merge.committedAt = now2();
  audit(user.id, "product_merge", merge.id, "commit", { sourceProductId: source.id, targetProductId: target.id });
  return merge;
}
function undoProductMerge(user, mergeId) {
  requirePermission(user, "merge:write");
  const merge = db.merges.find((item) => item.id === mergeId);
  if (!merge) throw new DomainError("NOT_FOUND", "Merge \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  if (merge.status !== "committed") throw new DomainError("BAD_MERGE_STATE", "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 merge");
  const snapshotOperations = merge.snapshot.operations || [];
  if (snapshotOperations.length) {
    const snapshotOperationIds = new Set(snapshotOperations.map((operation) => operation.id));
    const laterOperations = db.operations.filter(
      (operation) => (operation.productId === merge.sourceProductId || operation.productId === merge.targetProductId) && !snapshotOperationIds.has(operation.id)
    );
    if (laterOperations.length) {
      throw new DomainError("MERGE_UNDO_CONFLICT", "\u041F\u043E\u0441\u043B\u0435 merge \u0431\u044B\u043B\u0438 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044F \u043F\u043E \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0451\u043D\u043D\u044B\u043C \u0442\u043E\u0432\u0430\u0440\u0430\u043C", 409, laterOperations.map((operation) => operation.id));
    }
    const currentOperationIds = new Set(db.operations.map((operation) => operation.id));
    const missingOperations = snapshotOperations.filter((operation) => !currentOperationIds.has(operation.id));
    if (missingOperations.length) {
      throw new DomainError("MERGE_UNDO_CONFLICT", "\u0416\u0443\u0440\u043D\u0430\u043B \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0439 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 merge", 409, missingOperations.map((operation) => operation.id));
    }
    const snapshotById = new Map(snapshotOperations.map((operation) => [operation.id, operation]));
    db.operations = db.operations.map((operation) => structuredClone(snapshotById.get(operation.id) || operation));
  }
  db.products = db.products.filter((product) => product.id !== merge.sourceProductId && product.id !== merge.targetProductId);
  db.products.unshift(structuredClone(merge.snapshot.target), structuredClone(merge.snapshot.source));
  db.balances = db.balances.filter((balance) => balance.productId !== merge.sourceProductId && balance.productId !== merge.targetProductId);
  db.balances.push(...structuredClone(merge.snapshot.balances));
  merge.status = "reverted";
  audit(user.id, "product_merge", merge.id, "undo", { sourceProductId: merge.sourceProductId, targetProductId: merge.targetProductId });
  return merge;
}
function parseCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return emptyImportTable();
  const separator = detectCsvSeparator(lines);
  return rowsToObjects(lines.map((line) => splitCsvLine(line, separator)));
}
function parseImportRows(fileName, content) {
  return parseImportTable(fileName, content).rows;
}
function parseImportTable(fileName, content) {
  if (/\.xlsx$/i.test(fileName)) return parseXlsxBase64(content);
  if (/\.xls$/i.test(fileName)) return parseXlsBase64(content);
  return parseCsv(content);
}
function parseXlsBase64(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith("<")) return parseMarkupTable(trimmed);
  if (/[\n\t,;]/.test(trimmed) && !/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return parseCsv(trimmed);
  const buffer = Buffer.from(trimmed, "base64");
  const oleSignature = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
  if (!buffer.subarray(0, 8).equals(oleSignature)) {
    throw new DomainError("IMPORT_VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 XLS \u0444\u0430\u0439\u043B");
  }
  const workbook = readOleStream(buffer, ["Workbook", "Book"]);
  return parseBiffWorkbook(workbook);
}
function parseMarkupTable(markup) {
  const rowPattern = /<(?:tr|Row)\b[^>]*>([\s\S]*?)<\/(?:tr|Row)>/gi;
  const cellPattern = /<(?:td|th|Cell)\b[^>]*>([\s\S]*?)<\/(?:td|th|Cell)>/gi;
  const rows = [...markup.matchAll(rowPattern)].map((rowMatch) => {
    return [...rowMatch[1].matchAll(cellPattern)].map((cellMatch) => decodeXml(cellMatch[1].replace(/<[^>]+>/g, "").trim()));
  }).filter((row) => row.some(Boolean));
  return rowsToObjects(rows);
}
function readOleStream(buffer, streamNames) {
  if (buffer.length < 512) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 XLS \u0444\u0430\u0439\u043B");
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const miniSectorSize = 1 << buffer.readUInt16LE(32);
  const fatSectorCount = buffer.readUInt32LE(44);
  const firstDirectorySector = buffer.readInt32LE(48);
  const miniStreamCutoff = buffer.readUInt32LE(56);
  const firstMiniFatSector = buffer.readInt32LE(60);
  const miniFatSectorCount = buffer.readUInt32LE(64);
  const difat = readDifat(buffer, sectorSize, fatSectorCount);
  const fat = difat.flatMap((sectorId) => {
    const sector = readOleSector(buffer, sectorSize, sectorId);
    return Array.from({ length: sectorSize / 4 }, (_, index) => sector.readInt32LE(index * 4));
  });
  const readChain = (startSector, size) => {
    const chunks = [];
    const seen = /* @__PURE__ */ new Set();
    let sector = startSector;
    while (sector >= 0 && !seen.has(sector)) {
      seen.add(sector);
      chunks.push(readOleSector(buffer, sectorSize, sector));
      sector = fat[sector] ?? -2;
    }
    const data = Buffer.concat(chunks);
    return size === void 0 ? data : data.subarray(0, size);
  };
  const directory2 = readChain(firstDirectorySector);
  const entries = readOleDirectoryEntries(directory2);
  const root = entries.find((entry) => entry.type === 5);
  const stream = entries.find((entry) => entry.type === 2 && streamNames.includes(entry.name));
  if (!root || !stream) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u0412 XLS \u043D\u0435\u0442 Workbook stream");
  if (stream.size < miniStreamCutoff && stream.startSector >= 0) {
    if (firstMiniFatSector < 0 || miniFatSectorCount === 0) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 MiniFAT \u0432 XLS");
    const miniFatBuffer = readChain(firstMiniFatSector, miniFatSectorCount * sectorSize);
    const miniFat = Array.from({ length: miniFatBuffer.length / 4 }, (_, index) => miniFatBuffer.readInt32LE(index * 4));
    const miniStream = readChain(root.startSector, root.size);
    const chunks = [];
    const seen = /* @__PURE__ */ new Set();
    let miniSector = stream.startSector;
    while (miniSector >= 0 && !seen.has(miniSector)) {
      seen.add(miniSector);
      const offset = miniSector * miniSectorSize;
      chunks.push(miniStream.subarray(offset, offset + miniSectorSize));
      miniSector = miniFat[miniSector] ?? -2;
    }
    return Buffer.concat(chunks).subarray(0, stream.size);
  }
  return readChain(stream.startSector, stream.size);
}
function readDifat(buffer, sectorSize, fatSectorCount) {
  const difat = [];
  for (let offset = 76; offset < 512 && difat.length < fatSectorCount; offset += 4) {
    const sector = buffer.readInt32LE(offset);
    if (sector >= 0) difat.push(sector);
  }
  let nextDifatSector = buffer.readInt32LE(68);
  const difatSectorCount = buffer.readUInt32LE(72);
  for (let index = 0; index < difatSectorCount && nextDifatSector >= 0 && difat.length < fatSectorCount; index += 1) {
    const sector = readOleSector(buffer, sectorSize, nextDifatSector);
    for (let offset = 0; offset < sectorSize - 4 && difat.length < fatSectorCount; offset += 4) {
      const fatSector = sector.readInt32LE(offset);
      if (fatSector >= 0) difat.push(fatSector);
    }
    nextDifatSector = sector.readInt32LE(sectorSize - 4);
  }
  return difat;
}
function readOleSector(buffer, sectorSize, sectorId) {
  const offset = (sectorId + 1) * sectorSize;
  return buffer.subarray(offset, offset + sectorSize);
}
function readOleDirectoryEntries(directory2) {
  const entries = [];
  for (let offset = 0; offset + 128 <= directory2.length; offset += 128) {
    const entry = directory2.subarray(offset, offset + 128);
    const nameLength = entry.readUInt16LE(64);
    const name = nameLength > 2 ? entry.subarray(0, nameLength - 2).toString("utf16le") : "";
    const type = entry[66];
    if (!name || type === 0) continue;
    entries.push({
      name,
      type,
      startSector: entry.readInt32LE(116),
      size: entry.readUInt32LE(120)
    });
  }
  return entries;
}
function parseBiffWorkbook(workbook) {
  const sharedStrings = [];
  let sheetOffset = -1;
  forEachBiffRecord(workbook, 0, (type, data) => {
    if (type === 133 && sheetOffset < 0) sheetOffset = data.readUInt32LE(0);
    if (type === 252) sharedStrings.splice(0, sharedStrings.length, ...parseBiffSharedStrings(data));
  });
  if (sheetOffset < 0) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u0412 XLS \u043D\u0435\u0442 \u043B\u0438\u0441\u0442\u043E\u0432");
  const rows = /* @__PURE__ */ new Map();
  forEachBiffRecord(workbook, sheetOffset, (type, data) => {
    if (type === 253) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), sharedStrings[data.readUInt32LE(6)] || "");
    } else if (type === 515) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), formatBiffNumber(data.readDoubleLE(6)));
    } else if (type === 516) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), readBiffString(data, 6).value);
    } else if (type === 638) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), formatBiffNumber(readRkNumber(data.readInt32LE(6))));
    } else if (type === 189) {
      const row = data.readUInt16LE(0);
      const firstCol = data.readUInt16LE(2);
      const lastCol = data.readUInt16LE(data.length - 2);
      for (let col = firstCol; col <= lastCol; col += 1) {
        const rkOffset = 4 + (col - firstCol) * 6 + 2;
        setBiffCell(rows, row, col, formatBiffNumber(readRkNumber(data.readInt32LE(rkOffset))));
      }
    }
  });
  return rowsToObjects([...rows.keys()].sort((a, b) => a - b).map((row) => rows.get(row) || []));
}
function forEachBiffRecord(buffer, startOffset, visit) {
  for (let offset = startOffset; offset + 4 <= buffer.length; ) {
    const type = buffer.readUInt16LE(offset);
    const length = buffer.readUInt16LE(offset + 2);
    if (type === 0 && length === 0) break;
    const data = buffer.subarray(offset + 4, offset + 4 + length);
    visit(type, data);
    offset += 4 + length;
    if (type === 10 && startOffset > 0) break;
  }
}
function parseBiffSharedStrings(data) {
  const strings = [];
  const uniqueCount = data.readUInt32LE(4);
  let offset = 8;
  for (let index = 0; index < uniqueCount && offset < data.length; index += 1) {
    const parsed = readBiffString(data, offset);
    strings.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return strings;
}
function readBiffString(buffer, offset) {
  const length = buffer.readUInt16LE(offset);
  const flags = buffer[offset + 2];
  let cursor = offset + 3;
  const richRuns = flags & 8 ? buffer.readUInt16LE(cursor) : 0;
  if (flags & 8) cursor += 2;
  const extendedSize = flags & 4 ? buffer.readUInt32LE(cursor) : 0;
  if (flags & 4) cursor += 4;
  const isUtf16 = Boolean(flags & 1);
  const byteLength = length * (isUtf16 ? 2 : 1);
  const raw = buffer.subarray(cursor, cursor + byteLength);
  const value = isUtf16 ? raw.toString("utf16le") : raw.toString("latin1");
  cursor += byteLength + richRuns * 4 + extendedSize;
  return { value, nextOffset: cursor };
}
function setBiffCell(rows, rowIndex, columnIndex2, value) {
  const row = rows.get(rowIndex) || [];
  row[columnIndex2] = value;
  rows.set(rowIndex, row);
}
function formatBiffNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}
function readRkNumber(rk) {
  const encoded = rk >>> 0;
  const value = encoded & 2 ? rk >> 2 : (() => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(0, 0);
    buffer.writeUInt32LE(encoded & 4294967292, 4);
    return buffer.readDoubleLE(0);
  })();
  return encoded & 1 ? value / 100 : value;
}
function emptyImportTable() {
  return { rows: [], columnMapping: {} };
}
function detectImportHeaderRow(rows) {
  let best;
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const columnMapping = detectImportColumnMapping(rows[index] || []);
    const score = Object.keys(columnMapping).length;
    if (!score) continue;
    if (!best || score > best.score) best = { headerRowIndex: index, columnMapping, score };
  }
  return best && best.score >= 1 ? { headerRowIndex: best.headerRowIndex, columnMapping: best.columnMapping } : void 0;
}
function detectImportColumnMapping(headers) {
  const aliases = {
    name: ["name", "product", "product name", "item", "title", "\u043D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435", "\u043D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430", "\u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", "\u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430", "\u0442\u043E\u0432\u0430\u0440"],
    quantity: ["quantity", "qty", "amount", "count", "quantity pcs", "\u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E", "\u043A\u043E\u043B \u0432\u043E", "\u043A\u043E\u043B\u0432\u043E", "\u043A\u043E\u043B", "\u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0442\u043E\u0432\u0430\u0440\u0430"],
    sku: ["sku", "article", "article number", "vendor code", "product code", "code", "\u0430\u0440\u0442\u0438\u043A\u0443\u043B", "\u0430\u0440\u0442\u0438\u043A\u0443\u043B \u0442\u043E\u0432\u0430\u0440\u0430", "\u043A\u043E\u0434 \u0442\u043E\u0432\u0430\u0440\u0430", "\u043A\u043E\u0434"],
    unit: ["unit", "uom", "measure", "unit of measure", "\u0435\u0434", "\u0435\u0434 \u0438\u0437\u043C", "\u0435\u0434\u0438\u043D\u0438\u0446\u0430", "\u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F", "\u0435\u0434 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F"],
    category: ["category", "group", "product group", "\u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F", "\u0433\u0440\u0443\u043F\u043F\u0430", "\u0433\u0440\u0443\u043F\u043F\u0430 \u0442\u043E\u0432\u0430\u0440\u0430"]
  };
  const mapping = {};
  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (!normalized) continue;
    const target = Object.keys(aliases).find((field) => aliases[field].some((alias) => normalizeImportHeader(alias) === normalized));
    if (target && !mapping[target]) mapping[target] = header.trim();
  }
  return mapping;
}
function normalizeImportHeader(value) {
  return value.replace(/^\uFEFF/, "").normalize("NFKD").toLocaleLowerCase("ru").replace(/ё/g, "\u0435").replace(/[^a-zа-я0-9]+/gi, " ").trim().replace(/\s+/g, " ");
}
function rowsToObjects(rows) {
  const filteredRows = rows.filter((row) => row.some(Boolean));
  if (filteredRows.length < 2) return emptyImportTable();
  const detected = detectImportHeaderRow(filteredRows);
  const headerRowIndex = detected?.headerRowIndex ?? 0;
  const headers = filteredRows[headerRowIndex].map((header, index) => header.trim() || `column_${index + 1}`);
  return {
    rows: filteredRows.slice(headerRowIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))),
    columnMapping: detected?.columnMapping || {}
  };
}
function parseXlsxBase64(base64) {
  const files = readZipFiles(Buffer.from(base64, "base64"));
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 XLSX \u0444\u0430\u0439\u043B");
  const firstSheetRel = /<sheet[^>]+r:id="([^"]+)"/.exec(workbook)?.[1];
  if (!firstSheetRel) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u0412 XLSX \u043D\u0435\u0442 \u043B\u0438\u0441\u0442\u043E\u0432");
  const relMatch = new RegExp(`<Relationship[^>]+Id="${escapeRegExp(firstSheetRel)}"[^>]+Target="([^"]+)"`).exec(rels);
  const sheetPath = relMatch?.[1]?.startsWith("/") ? relMatch[1].slice(1) : `xl/${relMatch?.[1] || "worksheets/sheet1.xml"}`;
  const sheet = files.get(sheetPath)?.toString("utf8");
  if (!sheet) throw new DomainError("IMPORT_VALIDATION_ERROR", "\u041B\u0438\u0441\u0442 XLSX \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8") || "");
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
      const value = attrs.includes('t="s"') ? sharedStrings[Number(raw)] || "" : inline || raw;
      cells[index] = decodeXml(value);
    }
    return cells;
  }).filter((row) => row.some(Boolean));
  return rowsToObjects(rows);
}
function readZipFiles(buffer) {
  const files = /* @__PURE__ */ new Map();
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 67324752) {
      offset += 1;
      continue;
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const fileName = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const dataStart = nameStart + fileNameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (compression === 0) files.set(fileName, data);
    if (compression === 8) files.set(fileName, zlib.inflateRawSync(data));
    offset = dataStart + compressedSize;
  }
  return files;
}
function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    return parts.join("");
  });
}
function columnIndex(column) {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function detectCsvSeparator(lines) {
  const candidates = [",", ";", "	"];
  return candidates.map((separator) => ({ separator, columns: splitCsvLine(lines[0] || "", separator).length })).sort((left, right) => right.columns - left.columns)[0]?.separator || ",";
}
function splitCsvLine(line, separator = ",") {
  const values5 = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      values5.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values5.push(current.trim());
  return values5;
}
function acceptSwap(user, swapId) {
  return stateTransaction((state) => {
    const swap = state.swaps.find((item) => item.id === swapId);
    if (!swap) throw new DomainError("NOT_FOUND", "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
    if (swap.toUserId !== user.id) throw new DomainError("FORBIDDEN", "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043E\u0431\u043C\u0435\u043D \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A", 403);
    if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u0430");
    const shift = state.shifts.find((item) => item.id === swap.fromShiftId);
    if (!shift) throw new DomainError("NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
    if (shift.status !== "scheduled") throw new DomainError("BAD_SWAP_SHIFT", "\u041E\u0431\u043C\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0441\u043C\u0435\u043D\u044B");
    requireWorkingScheduleDay(state, shift.date, shift.locationId);
    assertNoShiftOverlap({ date: shift.date, start: shift.start, end: shift.end, employeeIds: [swap.toUserId], excludeShiftId: shift.id }, state);
    shift.employeeIds = shift.employeeIds.map((id) => id === swap.fromUserId ? swap.toUserId : id);
    swap.status = "accepted";
    state.notifications.unshift({ id: nanoid15(), channel: "webapp", userId: "u-admin", type: "shift_swap_accepted", payload: { swapId }, read: false, createdAt: now2() });
    appendAudit(state, user.id, "shift_swap", swap.id, "accept", { shiftId: shift.id });
    return { swap, shift };
  });
}
function roundQty(value) {
  return normalizeQuantity(value);
}
var now2, shiftStatuses2, DAY_SHIFT_START, DAY_SHIFT_END;
var init_domain = __esm({
  "src/server/domain.ts"() {
    "use strict";
    init_permissions();
    init_store();
    init_quantity();
    init_domain_core();
    init_domain_core();
    now2 = () => (/* @__PURE__ */ new Date()).toISOString();
    shiftStatuses2 = ["draft", "scheduled", "in_progress", "completed", "cancelled"];
    DAY_SHIFT_START = "10:00";
    DAY_SHIFT_END = "21:00";
  }
});

// src/server/reports.ts
var reports_exports = {};
__export(reports_exports, {
  isReportType: () => isReportType,
  movementReportColumns: () => movementReportColumns,
  movementReportRows: () => movementReportRows,
  queueReportTelegram: () => queueReportTelegram,
  renderReportPdf: () => renderReportPdf,
  renderReportPdfRows: () => renderReportPdfRows,
  reportRows: () => reportRows,
  reportTitle: () => reportTitle,
  reportTypes: () => reportTypes
});
import { nanoid as nanoid16 } from "nanoid";
function nullableText(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function nullableFiniteNumber(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  try {
    return normalizeQuantity(value, unit);
  } catch {
    return null;
  }
}
function movementReportRows(query = {}) {
  return db.operations.map((operation) => {
    const raw = operation;
    const productId = nullableText(raw.productId);
    const fromLocationId = nullableText(raw.fromLocationId);
    const toLocationId = nullableText(raw.toLocationId);
    const actorId = nullableText(raw.actorId);
    const occurredAt = nullableText(raw.createdAt);
    const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
    const product = productId ? db.products.find((item) => item.id === productId) : void 0;
    const fromLocation = fromLocationId ? db.locations.find((item) => item.id === fromLocationId) : void 0;
    const toLocation = toLocationId ? db.locations.find((item) => item.id === toLocationId) : void 0;
    const actor3 = actorId ? db.users.find((item) => item.id === actorId) : void 0;
    const actorName = actor3 ? [actor3.firstName, actor3.lastName].filter(Boolean).join(" ") || actor3.id : actorId || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A";
    return {
      id: nullableText(raw.id) || "missing-operation-id",
      occurredAt,
      type: nullableText(raw.type) || "unknown",
      productId,
      productName: product?.localName || product?.officialName || productId || "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u043E\u0432\u0430\u0440",
      fromLocationId,
      fromLocationName: fromLocation?.name || fromLocationId,
      toLocationId,
      toLocationName: toLocation?.name || toLocationId,
      quantity: nullableFiniteNumber(raw.quantity, product?.unit),
      actorId,
      actorName,
      reason: nullableText(raw.reason) || "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E",
      reversedOperationId: nullableText(raw.reversedOperationId),
      inventoryExpected: nullableFiniteNumber(metadata.expected, product?.unit),
      inventoryActual: nullableFiniteNumber(metadata.actual, product?.unit),
      inventoryDelta: nullableFiniteNumber(metadata.delta, product?.unit)
    };
  }).filter((row) => {
    if (query.productId && row.productId !== query.productId) return false;
    if (query.locationId && row.fromLocationId !== query.locationId && row.toLocationId !== query.locationId) return false;
    if (!row.occurredAt) return !query.from && !query.to;
    const day = row.occurredAt.slice(0, 10);
    return (!query.from || day >= query.from) && (!query.to || day <= query.to);
  });
}
function reportRows(user, type, query = {}) {
  requirePermission(user, "reports:read");
  if (type === "discrepancies") return listInventoryDiscrepancies(user, query);
  if (type === "movements") return movementReportRows(query);
  return db.balances.map((balance) => {
    const product = db.products.find((item) => item.id === balance.productId);
    const location = db.locations.find((item) => item.id === balance.locationId);
    return { productName: product?.localName || product?.officialName || balance.productId, productStatus: product?.status || "deleted", locationName: location?.name || balance.locationId, quantity: normalizeQuantity(balance.quantity, product?.unit), threshold: normalizeQuantity(product?.lowStockThreshold || 0, product?.unit) };
  }).filter((row) => type === "all" || type === "low" && row.quantity > 0 && row.quantity <= row.threshold || type === "zero" && row.quantity === 0 || type === "archive" && row.productStatus === "archived");
}
async function renderReportPdf(user, type, query = {}) {
  return renderReportPdfRows(type, reportRows(user, type, query), query);
}
async function queueReportTelegram(user, type, query = {}) {
  requirePermission(user, "reports:read");
  if (!user.telegramUserId) throw new DomainError("TELEGRAM_UNAVAILABLE", "\u0423 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D Telegram", 422);
  const pdf = await renderReportPdf(user, type, query);
  const key = `telegram-report:${user.id}:${type}:${query.from || ""}:${query.to || ""}:${query.productId || ""}:${query.locationId || ""}`;
  return stateTransaction((state) => {
    const existing = state.outbox.find((item) => item.idempotencyKey === key && item.status !== "failed" && item.status !== "cancelled");
    if (existing) return existing;
    const message = {
      id: nanoid16(),
      channel: "telegram",
      userId: user.id,
      type: "report_pdf",
      payload: { text: `\u041E\u0442\u0447\u0451\u0442: ${reportTitle(type)}`, documentBase64: pdf.toString("base64"), fileName: `report-${type}.pdf` },
      status: "pending",
      attemptCount: 0,
      availableAt: (/* @__PURE__ */ new Date()).toISOString(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      idempotencyKey: key
    };
    state.outbox.unshift(message);
    return message;
  });
}
var init_reports = __esm({
  "src/server/reports.ts"() {
    "use strict";
    init_domain();
    init_store();
    init_quantity();
    init_report_rendering();
    init_report_rendering();
  }
});

// src/server/telegram.ts
var telegram_exports = {};
__export(telegram_exports, {
  approveTelegramOnboarding: () => approveTelegramOnboarding,
  handleTelegramUpdate: () => handleTelegramUpdate,
  setNotificationPreference: () => setNotificationPreference
});
import { nanoid as nanoid17 } from "nanoid";
function monthCalendar(userId, state, month = /* @__PURE__ */ new Date()) {
  const first5 = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const offset = (first5.getUTCDay() + 6) % 7;
  const start = new Date(first5);
  start.setUTCDate(1 - offset);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date2 = new Date(start);
    date2.setUTCDate(start.getUTCDate() + index);
    const key = date2.toISOString().slice(0, 10);
    const own = state.shifts.some((shift) => shift.date === key && shift.employeeIds.includes(userId) && shift.status === "scheduled");
    const label = date2.getUTCMonth() === month.getUTCMonth() ? `${own ? "\u2705" : "\xB7"}${date2.getUTCDate()}` : " ";
    return { text: label, callback_data: `cal:${key}` };
  });
  return { inline_keyboard: [[{ text: "\u2039", callback_data: "cal:prev" }, { text: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`, callback_data: "cal:noop" }, { text: "\u203A", callback_data: "cal:next" }], ...Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7))] };
}
function calendarMonthKey(userId) {
  return `telegram-calendar-month:${userId}`;
}
function parseMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const month = /* @__PURE__ */ new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(month.getTime()) ? null : month;
}
function monthKey(month) {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}
function addMonths(month, amount) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}
function calendarMonth(state, userId) {
  return parseMonth(state.idempotency[calendarMonthKey(userId)]) || new Date(Date.UTC((/* @__PURE__ */ new Date()).getUTCFullYear(), (/* @__PURE__ */ new Date()).getUTCMonth(), 1));
}
function dayDetail(userId, state, date2) {
  const shifts = state.shifts.filter((shift) => shift.date === date2 && shift.employeeIds.includes(userId) && shift.status !== "cancelled");
  const closed = state.scheduleDays.filter((day) => day.date === date2 && day.status === "closed");
  if (!shifts.length) return closed.length ? `${date2}: \u0442\u043E\u0447\u043A\u0430 \u0437\u0430\u043A\u0440\u044B\u0442\u0430.` : `${date2}: \u0441\u043C\u0435\u043D \u043D\u0435\u0442.`;
  return [`${date2}:`, ...shifts.map((shift) => {
    const location = state.locations.find((item) => item.id === shift.locationId);
    return `${shift.start}\u2013${shift.end} \xB7 ${location?.name || shift.locationId}${shift.comment ? ` (${shift.comment})` : ""}`;
  })].join("\n");
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function enqueue(state, userId, type, payload, idempotencyKey) {
  const existing = state.outbox.find((item) => item.channel === "telegram" && item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const message = { id: nanoid17(), channel: "telegram", userId, type, payload, status: "pending", attemptCount: 0, availableAt: (/* @__PURE__ */ new Date()).toISOString(), createdAt: (/* @__PURE__ */ new Date()).toISOString(), idempotencyKey };
  state.outbox.unshift(message);
  return message;
}
function findOrCreateTelegramUser(state, from) {
  const existing = state.users.find((user2) => user2.telegramUserId === String(from.id));
  if (existing) return existing;
  const user = {
    id: `tg-${from.id}`,
    telegramUserId: String(from.id),
    firstName: String(from.first_name || ""),
    lastName: String(from.last_name || ""),
    username: String(from.username || ""),
    status: "pending",
    role: "seller",
    permissions: rolePermissions.seller
  };
  state.users.push(user);
  return user;
}
function handleTelegramUpdate(update, hooks = {}) {
  const updateId = Number(update.update_id);
  if (!Number.isInteger(updateId) || updateId < 0) return { ignored: true, reason: "invalid_update" };
  if (hooks.resolveTelegramUser && hooks.registerTelegramApplicant && hooks.resolveOnboarding) {
    const from = update.message?.from || update.callback_query?.from;
    const text2 = String(update.message?.text || update.callback_query?.data || "").trim();
    if (!from) return { ignored: true, reason: "unsupported_update" };
    const user = hooks.resolveTelegramUser(String(from.id)) ?? hooks.registerTelegramApplicant({
      updateId,
      telegramUserId: String(from.id),
      firstName: String(from.first_name || ""),
      lastName: String(from.last_name || ""),
      username: String(from.username || "")
    });
    if (text2 === "/start") return { userId: user.id, status: user.status };
    if (!text2.startsWith("onboard:")) return { ignored: true, reason: "FEATURE_DISABLED" };
    const [, action, targetUserId, role] = text2.split(":");
    if (!targetUserId || action !== "approve" && action !== "reject") {
      throw new DomainError("BAD_ONBOARD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 onboarding");
    }
    if (action === "approve" && role !== "seller" && role !== "admin") {
      throw new DomainError("BAD_ONBOARD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 onboarding");
    }
    const approvedRole = action === "approve" ? role : void 0;
    const resolved = hooks.resolveOnboarding({
      updateId,
      actorTelegramUserId: String(from.id),
      actorUserId: user.id,
      targetUserId,
      action,
      ...approvedRole ? { role: approvedRole } : {}
    });
    return { userId: resolved.id, status: resolved.status };
  }
  return stateTransaction((state) => {
    const cacheKey = `telegram-update:${updateId}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey];
    const from = update.message?.from || update.callback_query?.from;
    const text2 = String(update.message?.text || update.callback_query?.data || "").trim();
    if (!from) {
      const result2 = { ignored: true, reason: "unsupported_update" };
      state.idempotency[cacheKey] = result2;
      return result2;
    }
    const user = hooks.resolveTelegramUser?.(String(from.id)) ?? hooks.registerTelegramApplicant?.({
      updateId,
      telegramUserId: String(from.id),
      firstName: String(from.first_name || ""),
      lastName: String(from.last_name || ""),
      username: String(from.username || "")
    }) ?? findOrCreateTelegramUser(state, from);
    let message = "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043D\u0435 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u0430. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E: /start, \u041C\u043E\u0439 \u0433\u0440\u0430\u0444\u0438\u043A, \u041D\u0430\u043B\u0438\u0447\u0438\u0435, \u041F\u043E\u0438\u0441\u043A \u0442\u043E\u0432\u0430\u0440\u0430, \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F.";
    if (text2 === "/start") {
      message = user.status === "pending" ? "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0430 \u0434\u043E\u0441\u0442\u0443\u043F \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443." : "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 \u0414\u0432\u043E\u0440\u0438\u043A.";
      if (user.status === "pending" && !hooks.registerTelegramApplicant) {
        for (const admin of state.users.filter((item) => item.role === "super_admin" && item.status === "active")) {
          enqueue(state, admin.id, "telegram_onboarding_request", {
            text: `\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u044F\u0432\u043A\u0430: ${`${user.firstName} ${user.lastName}`.trim() || user.id}`,
            userId: user.id,
            reply_markup: {
              inline_keyboard: [[
                { text: "\u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430", callback_data: `onboard:approve:${user.id}:seller` },
                { text: "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C", callback_data: `onboard:reject:${user.id}` }
              ]]
            }
          }, `tg-onboarding:${user.id}:${admin.id}`);
        }
      }
    } else if (user.status !== "active") {
      message = "\u0414\u043E\u0441\u0442\u0443\u043F \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430.";
    } else if (text2 === "\u041C\u043E\u0439 \u0433\u0440\u0430\u0444\u0438\u043A") {
      const own = state.shifts.filter((shift) => shift.employeeIds.includes(user.id) && shift.status === "scheduled").slice(0, 8);
      message = own.length ? own.map((shift) => `${shift.date}: ${shift.locationId}`).join("\n") : "\u0411\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0445 \u0441\u043C\u0435\u043D \u043D\u0435\u0442.";
      const month = new Date(Date.UTC((/* @__PURE__ */ new Date()).getUTCFullYear(), (/* @__PURE__ */ new Date()).getUTCMonth(), 1));
      state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
      enqueue(state, user.id, "telegram_calendar", { text: message, reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
    } else if (text2.startsWith("swap:")) {
      const [, action, swapId] = text2.split(":");
      if (!swapId || !["accept", "decline"].includes(action)) throw new DomainError("BAD_SWAP_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043F\u043E\u0434\u043C\u0435\u043D\u044B");
      if (action === "accept") {
        const { swap } = acceptSwap(user, swapId);
        enqueue(state, swap.fromUserId, "telegram_message", { text: "\u041F\u043E\u0434\u043C\u0435\u043D\u0430 \u0441\u043C\u0435\u043D\u044B \u043F\u0440\u0438\u043D\u044F\u0442\u0430." }, `tg-swap-accepted:${swap.id}`);
        message = "\u041F\u043E\u0434\u043C\u0435\u043D\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430.";
      } else {
        const swap = declineSwap(user, swapId);
        enqueue(state, swap.fromUserId, "telegram_message", { text: "\u041F\u043E\u0434\u043C\u0435\u043D\u0430 \u0441\u043C\u0435\u043D\u044B \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430." }, `tg-swap-declined:${swap.id}`);
        message = "\u041F\u043E\u0434\u043C\u0435\u043D\u0430 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430.";
      }
    } else if (text2 === "cal:prev" || text2 === "cal:next") {
      const month = addMonths(calendarMonth(state, user.id), text2 === "cal:prev" ? -1 : 1);
      state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
      enqueue(state, user.id, "telegram_calendar", { text: `\u0413\u0440\u0430\u0444\u0438\u043A \u043D\u0430 ${monthKey(month)}`, reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
    } else if (text2.startsWith("cal:")) {
      const date2 = text2.slice(4);
      if (isCalendarDate(date2)) {
        const month = /* @__PURE__ */ new Date(`${date2}T00:00:00.000Z`);
        state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
        enqueue(state, user.id, "telegram_calendar", { text: dayDetail(user.id, state, date2), reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
      } else if (text2 !== "cal:noop") {
        message = "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u044F.";
      }
    } else if (text2.startsWith("onboard:")) {
      if (user.role !== "super_admin") throw new DomainError("FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432", 403);
      const [, action, pendingUserId, role] = text2.split(":");
      const pending = hooks.resolveOnboarding ? void 0 : state.users.find((item) => item.id === pendingUserId && item.status === "pending");
      if (!hooks.resolveOnboarding && !pending) throw new DomainError("PENDING_USER_NOT_FOUND", "\u0417\u0430\u044F\u0432\u043A\u0430 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u0430", 404);
      if (action === "approve" && (role === "seller" || role === "admin")) {
        hooks.resolveOnboarding?.({ updateId, actorTelegramUserId: String(from.id), actorUserId: user.id, targetUserId: pendingUserId, action, role });
        if (pending) {
          pending.status = "active";
          pending.role = role;
          pending.permissions = rolePermissions[role];
          enqueue(state, pending.id, "telegram_message", { text: "\u0414\u043E\u0441\u0442\u0443\u043F \u043E\u0434\u043E\u0431\u0440\u0435\u043D." }, `tg-approved:${pending.id}`);
        }
        message = "\u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0430.";
      } else if (action === "reject") {
        hooks.resolveOnboarding?.({ updateId, actorTelegramUserId: String(from.id), actorUserId: user.id, targetUserId: pendingUserId, action });
        if (pending) {
          pending.status = "rejected";
          enqueue(state, pending.id, "telegram_message", { text: "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0430 \u0434\u043E\u0441\u0442\u0443\u043F \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430." }, `tg-rejected:${pending.id}`);
        }
        message = "\u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430.";
      } else throw new DomainError("BAD_ONBOARD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 onboarding");
      if (pending) appendAudit(state, user.id, "telegram_onboarding", pending.id, action, { role });
    } else if (text2 === "\u041D\u0430\u043B\u0438\u0447\u0438\u0435") {
      message = "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 WebApp \u0434\u043B\u044F \u0434\u0435\u0442\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043D\u0430\u043B\u0438\u0447\u0438\u044F \u043F\u043E \u0442\u043E\u0447\u043A\u0430\u043C.";
    } else if (text2 === "\u041F\u043E\u0438\u0441\u043A \u0442\u043E\u0432\u0430\u0440\u0430") {
      message = "\u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438\u043B\u0438 \u0430\u0440\u0442\u0438\u043A\u0443\u043B \u0442\u043E\u0432\u0430\u0440\u0430.";
    } else if (text2 === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F") {
      message = "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0432 WebApp.";
    }
    if (text2 !== "\u041C\u043E\u0439 \u0433\u0440\u0430\u0444\u0438\u043A" && !text2.startsWith("cal:")) enqueue(state, user.id, "telegram_message", { text: message }, `tg-response:${updateId}`);
    appendAudit(state, user.id, "telegram_update", String(updateId), "handle", { text: text2, userStatus: user.status });
    const result = { userId: user.id, status: user.status };
    state.idempotency[cacheKey] = result;
    return result;
  });
}
function approveTelegramOnboarding(actor3, userId, role, beforeApprove) {
  if (actor3.role !== "super_admin") throw new DomainError("FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432", 403);
  return stateTransaction((state) => {
    const user = state.users.find((item) => item.id === userId && item.status === "pending");
    if (!user) throw new DomainError("PENDING_USER_NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044F", 404);
    beforeApprove?.();
    user.status = "active";
    user.role = role;
    user.permissions = rolePermissions[role];
    for (const session2 of state.sessions.filter((item) => item.userId === user.id && !item.revokedAt)) session2.revokedAt = (/* @__PURE__ */ new Date()).toISOString();
    enqueue(state, user.id, "telegram_message", { text: "\u0414\u043E\u0441\u0442\u0443\u043F \u043E\u0434\u043E\u0431\u0440\u0435\u043D. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 WebApp \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043C\u0435\u043D\u044E \u0431\u043E\u0442\u0430." }, `tg-approved:${user.id}`);
    appendAudit(state, actor3.id, "telegram_onboarding", user.id, "approve", { role });
    return user;
  });
}
function setNotificationPreference(user, input) {
  if (!["telegram", "webapp"].includes(input.channel) || !["off", "instant", "daily"].includes(input.deliveryMode)) throw new DomainError("BAD_NOTIFICATION_PREFERENCE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439");
  if (input.deliveryMode === "daily") throw new DomainError("FEATURE_DISABLED", "Daily digest \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D \u0434\u043E post-launch", 404);
  return stateTransaction((state) => {
    const existing = state.notificationPreferences.find((item) => item.userId === user.id && item.channel === input.channel && item.eventType === input.eventType);
    const preference = existing || { userId: user.id, ...input };
    preference.deliveryMode = input.deliveryMode;
    if (!existing) state.notificationPreferences.push(preference);
    appendAudit(state, user.id, "notification_preference", `${input.channel}:${input.eventType}`, "upsert", preference);
    return preference;
  });
}
var init_telegram = __esm({
  "src/server/telegram.ts"() {
    "use strict";
    init_permissions();
    init_store();
    init_domain();
  }
});

// src/server/legacy-runtime.ts
var legacy_runtime_exports = {};
__export(legacy_runtime_exports, {
  domain: () => domain_exports,
  reports: () => reports_exports,
  store: () => store_exports,
  telegram: () => telegram_exports
});
var init_legacy_runtime = __esm({
  "src/server/legacy-runtime.ts"() {
    "use strict";
    init_domain();
    init_reports();
    init_store();
    init_telegram();
  }
});

// src/server/index.ts
import express from "express";
import crypto6 from "node:crypto";
import path6 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { createServer as createViteServer } from "vite";
import { nanoid as nanoid18 } from "nanoid";
import PDFDocument2 from "pdfkit";

// src/shared/mediaUpload.ts
var MEDIA_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
var MEDIA_UPLOAD_MAX_LABEL = "5 \u041C\u0438\u0411";
var MEDIA_UPLOAD_MAX_BASE64_CHARS = 4 * Math.ceil(MEDIA_UPLOAD_MAX_BYTES / 3);
var MEDIA_UPLOAD_JSON_LIMIT_BYTES = MEDIA_UPLOAD_MAX_BASE64_CHARS + 1024;
function normalizeMediaBase64(value) {
  return value.replace(/^data:[^,]+,/, "");
}
function decodedBase64ByteLength(value) {
  const base64 = normalizeMediaBase64(value);
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return base64.length / 4 * 3 - padding;
}

// src/server/auth.ts
init_domain_core();
import crypto from "node:crypto";
function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 60 * 60 * 24) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new DomainError("BAD_TELEGRAM_INIT_DATA", "\u0412 init data \u043D\u0435\u0442 hash", 401);
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(hash) || !crypto.timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(hash, "hex"))) {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C Telegram", 401);
  }
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || Date.now() / 1e3 - authDate > maxAgeSeconds) {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "Telegram init data \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0438", 401);
  }
  const userJson2 = params.get("user");
  if (!userJson2) throw new DomainError("BAD_TELEGRAM_INIT_DATA", "\u0412 init data \u043D\u0435\u0442 user", 401);
  try {
    return JSON.parse(userJson2);
  } catch {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 user \u0432 init data", 401);
  }
}
function signTelegramInitData(payload, botToken) {
  const params = new URLSearchParams(payload);
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

// src/server/barcodes.ts
init_domain_core();
var code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112"
];
var eanL = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
var eanG = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
var eanR = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
var eanParity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
function widthsToBits(widths) {
  let bar = true;
  let bits = "";
  for (const char of widths) {
    bits += (bar ? "1" : "0").repeat(Number(char));
    bar = !bar;
  }
  return bits;
}
function isValidEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === digits[12];
}
function encodeEan13(value) {
  if (!isValidEan13(value)) throw new DomainError("BAD_BARCODE", "EAN-13 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u043C 13-\u0437\u043D\u0430\u0447\u043D\u044B\u043C \u043A\u043E\u0434\u043E\u043C");
  const digits = [...value].map(Number);
  const parity = eanParity[digits[0]];
  const left = digits.slice(1, 7).map((digit, index) => parity[index] === "L" ? eanL[digit] : eanG[digit]).join("");
  const right = digits.slice(7).map((digit) => eanR[digit]).join("");
  return `101${left}01010${right}101`;
}
function canEncodeCode128(value) {
  return value.length > 0 && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126);
}
function encodeCode128B(value) {
  if (!canEncodeCode128(value)) throw new DomainError("BAD_BARCODE", "Code 128 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u043C\u044B\u0435 ASCII-\u0441\u0438\u043C\u0432\u043E\u043B\u044B");
  const codes = [...value].map((char) => char.charCodeAt(0) - 32);
  const checksum2 = codes.reduce((total, code, index) => total + code * (index + 1), 104) % 103;
  return [104, ...codes, checksum2, 106].map((code) => widthsToBits(code128Patterns[code])).join("");
}
function buildBarcode(value, fallback) {
  const normalized = value.trim();
  if (isValidEan13(normalized)) return { type: "ean13", value: normalized, pattern: encodeEan13(normalized) };
  if (canEncodeCode128(normalized)) return { type: "code128", value: normalized, pattern: encodeCode128B(normalized) };
  if (canEncodeCode128(fallback)) return { type: "code128", value: fallback, pattern: encodeCode128B(fallback) };
  throw new DomainError("BAD_BARCODE", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434");
}

// src/server/index.ts
init_domain_core();
init_permissions();

// src/server/media.ts
import { lookup as dnsLookup } from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import sharp from "sharp";
var extensionByMime = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
function mediaKey(mimeType) {
  return `${nanoid()}.${extensionByMime[mimeType]}`;
}
var LocalMediaStorage = class {
  constructor(directory2, publicPrefix = "/media") {
    this.publicPrefix = publicPrefix;
    this.localDirectory = directory2;
  }
  publicPrefix;
  localDirectory;
  async put({ key, body }) {
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) throw new Error("Unsafe media key");
    await fs.mkdir(this.localDirectory, { recursive: true });
    await fs.writeFile(path.join(this.localDirectory, key), body, { flag: "wx" });
    return { key, url: `${this.publicPrefix}/${key}`, bytes: body.length, storage: "local" };
  }
};
var ObjectStorageAdapter = class {
  constructor(config) {
    this.config = config;
  }
  config;
  async put({ key, body, mimeType }) {
    const base = this.config.endpoint.replace(/\/$/, "");
    const bucket = encodeURIComponent(this.config.bucket);
    const response8 = await fetch(`${base}/${bucket}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        "content-type": mimeType,
        "content-length": String(body.length),
        ...this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}
      },
      body
    });
    if (!response8.ok) throw new Error(`Object storage rejected upload (${response8.status})`);
    return {
      key,
      url: `${this.config.publicBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(key)}`,
      bytes: body.length,
      storage: "object"
    };
  }
};
var FallbackMediaStorage = class {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
  }
  primary;
  fallback;
  get localDirectory() {
    return this.fallback.localDirectory;
  }
  async put(input) {
    if (!this.primary) return this.fallback.put(input);
    try {
      return await this.primary.put(input);
    } catch (error) {
      console.warn("Object storage upload failed; using local media fallback", error instanceof Error ? error.message : error);
      return this.fallback.put(input);
    }
  }
};
function createMediaStorage(options) {
  const local = new LocalMediaStorage(options.localDirectory);
  const primary = options.endpoint && options.bucket && options.publicBaseUrl ? new ObjectStorageAdapter({ endpoint: options.endpoint, bucket: options.bucket, publicBaseUrl: options.publicBaseUrl, token: options.token }) : void 0;
  if (options.allowLocalFallback === false) {
    if (!primary) throw new Error("Object storage is required when local media fallback is disabled");
    return primary;
  }
  return new FallbackMediaStorage(primary, local);
}
async function assertImageProcessorCapability(processor = sharp) {
  const { data, info } = await processor({ create: { width: 2, height: 2, channels: 3, background: "#ffffff" } }).jpeg().toBuffer({ resolveWithObject: true });
  if (!data.length || info.format !== "jpeg" || info.width !== 2 || info.height !== 2) throw new Error("Image processor capability check failed");
  return { engine: "sharp", vips: sharp.versions.vips };
}
async function compressImage(input, mimeType, processor = sharp) {
  let image = processor(input, { limitInputPixels: 4e7 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
  image = mimeType === "image/jpeg" ? image.jpeg({ quality: 82, mozjpeg: true }) : mimeType === "image/webp" ? image.webp({ quality: 82 }) : image.png({ compressionLevel: 9, palette: true });
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  if (!data.length || !info.width || !info.height) throw new Error("Image processor returned invalid output");
  return { body: data, mimeType, compressed: data.length < input.length, width: info.width, height: info.height };
}
function isPrivateAddress(address) {
  if (address === "::1" || address === "0.0.0.0" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  return parts.length === 4 && (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] === 169 && parts[1] === 254 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168);
}
function validateMediaUrlSyntax(value) {
  if (value.startsWith("/media/")) return new URL(value, "http://local.media");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435");
  }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname) throw new Error("\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C HTTP(S)");
  if (["localhost", "localhost.localdomain"].includes(url.hostname) || isPrivateAddress(url.hostname)) throw new Error("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0430\u0434\u0440\u0435\u0441\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B");
  return url;
}
async function validateExternalMediaUrl(value, deps = {}) {
  const url = validateMediaUrlSyntax(value);
  if (url.hostname === "local.media") return { url: value, contentType: "local" };
  const lookup = deps.lookup || ((hostname) => dnsLookup(hostname, { all: true }));
  const records = await lookup(url.hostname);
  if (records.some((record2) => isPrivateAddress(record2.address))) throw new Error("\u0410\u0434\u0440\u0435\u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0432\u0435\u0434\u0451\u0442 \u0432\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044E\u044E \u0441\u0435\u0442\u044C");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5e3);
  try {
    const response8 = await (deps.request || fetch)(url.toString(), { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!response8.ok) throw new Error("\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043F\u043E \u0441\u0441\u044B\u043B\u043A\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E");
    const contentType = response8.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0435 \u0432\u0435\u0434\u0451\u0442 \u043D\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435");
    const rawLength = response8.headers.get("content-length");
    const bytes = rawLength ? Number(rawLength) : void 0;
    if (bytes && (!Number.isFinite(bytes) || bytes > 15 * 1024 * 1024)) throw new Error("\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043F\u043E \u0441\u0441\u044B\u043B\u043A\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 15 \u041C\u0411");
    return { url: url.toString(), contentType, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

// src/server/index.ts
init_report_rendering();
init_config();
init_database();
init_migrations();

// src/server/command-context.ts
var CommandContextError = class extends Error {
  constructor(code) {
    super(`Invalid command context: ${code}`);
    this.code = code;
    this.name = "CommandContextError";
  }
  code;
};
var identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
function identifier(value, code, maxLength) {
  if (typeof value !== "string" || value.length > maxLength || !identifierPattern.test(value)) throw new CommandContextError(code);
  return value;
}
function actor(value, channel2) {
  if (!value || typeof value !== "object" || !("kind" in value)) throw new CommandContextError("BAD_ACTOR");
  const candidate = value;
  if (candidate.kind === "user") {
    const authenticatedBy = candidate.authenticatedBy;
    if (channel2 === "web" && authenticatedBy !== "web_session" || channel2 === "telegram" && authenticatedBy !== "telegram_update" || channel2 === "worker") throw new CommandContextError("BAD_ACTOR");
    return Object.freeze({
      kind: "user",
      userId: identifier(candidate.userId, "BAD_ACTOR", 128),
      authenticatedBy: channel2 === "web" ? "web_session" : "telegram_update"
    });
  }
  if (candidate.kind === "system") {
    const authenticatedBy = candidate.authenticatedBy;
    if (channel2 === "worker" && authenticatedBy !== "worker_registry" || channel2 === "telegram" && authenticatedBy !== "telegram_webhook" || channel2 === "web") throw new CommandContextError("BAD_ACTOR");
    if (authenticatedBy !== "worker_registry" && authenticatedBy !== "telegram_webhook") throw new CommandContextError("BAD_ACTOR");
    return Object.freeze({
      kind: "system",
      service: identifier(candidate.service, "BAD_ACTOR", 128),
      authenticatedBy
    });
  }
  throw new CommandContextError("BAD_ACTOR");
}
function channel(value) {
  if (value !== "web" && value !== "telegram" && value !== "worker") throw new CommandContextError("BAD_CHANNEL");
  return value;
}
function utc(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new CommandContextError("BAD_CLOCK");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new CommandContextError("BAD_CLOCK");
  const canonicalInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (parsed.toISOString() !== canonicalInput) throw new CommandContextError("BAD_CLOCK");
  return canonicalInput;
}
function transactionFacade(context) {
  return Object.freeze({ repositories: context.repositories });
}
var CommandExecutor = class {
  constructor(unitOfWork, sourceClock, actorResolver) {
    this.unitOfWork = unitOfWork;
    this.sourceClock = sourceClock;
    this.actorResolver = actorResolver;
  }
  unitOfWork;
  sourceClock;
  actorResolver;
  execute(metadata, run, options = {}) {
    const requestId = identifier(metadata.requestId, "BAD_REQUEST_ID", 128);
    const safeChannel = channel(metadata.channel);
    const idempotencyKey = identifier(metadata.idempotencyKey, "BAD_IDEMPOTENCY_KEY", 256);
    let resolvedActor;
    try {
      resolvedActor = this.actorResolver.resolve(metadata.actorReference, safeChannel);
    } catch {
      throw new CommandContextError("BAD_ACTOR");
    }
    const safeActor = actor(resolvedActor, safeChannel);
    const clock = Object.freeze({ now: () => utc(this.sourceClock.now()) });
    clock.now();
    return this.unitOfWork.transaction((transaction) => run(Object.freeze({
      actor: safeActor,
      requestId,
      correlationId: requestId,
      channel: safeChannel,
      idempotencyKey,
      clock,
      transaction: transactionFacade(transaction)
    })), { mode: options.transactionMode });
  }
};

// src/server/identity-service.ts
import { nanoid as nanoid2 } from "nanoid";

// src/server/idempotency.ts
import { createHash } from "node:crypto";
var IdempotencyError = class extends Error {
  constructor(code, httpStatus) {
    super(`Idempotency failed: ${code}`);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "IdempotencyError";
  }
  code;
  httpStatus;
};
var scopePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
function canonicalJson(value, ancestors) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new IdempotencyError("INVALID_PAYLOAD", 400);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new IdempotencyError("INVALID_PAYLOAD", 400);
  if (ancestors.has(value)) throw new IdempotencyError("INVALID_PAYLOAD", 400);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length || Object.keys(value).length !== value.length || Object.getOwnPropertyNames(value).length !== value.length + 1) {
        throw new IdempotencyError("INVALID_PAYLOAD", 400);
      }
      return `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length) {
      throw new IdempotencyError("INVALID_PAYLOAD", 400);
    }
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length || keys.some((key) => !("value" in Object.getOwnPropertyDescriptor(value, key)))) {
      throw new IdempotencyError("INVALID_PAYLOAD", 400);
    }
    return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
function canonicalizeJson(value) {
  return canonicalJson(value, /* @__PURE__ */ new Set());
}
function canonicalRequestHash(value) {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex")}`;
}
function timestampAfter(value, milliseconds) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) throw new RangeError("Idempotency duration must be a positive safe integer");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new RangeError("Idempotency clock must return canonical UTC");
  return new Date(parsed.getTime() + milliseconds).toISOString();
}
function validateResponse(response8) {
  if (!response8 || !Number.isInteger(response8.status) || response8.status < 100 || response8.status > 599) {
    throw new IdempotencyError("INVALID_RESPONSE", 500);
  }
  try {
    canonicalizeJson(response8.body);
  } catch {
    throw new IdempotencyError("INVALID_RESPONSE", 500);
  }
}
function replay(record2) {
  if (record2.status !== "completed" && record2.status !== "failed" || record2.responseStatus === void 0 || record2.response === void 0 || record2.response.schemaVersion !== 1) {
    throw new IdempotencyError("CORRUPT_RECORD", 500);
  }
  return { outcome: "replayed", status: record2.responseStatus, body: record2.response.value };
}
function executeIdempotently(context, scope, request, options, run) {
  if (!scopePattern.test(scope)) return { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_SCOPE" };
  let requestHash;
  try {
    requestHash = canonicalRequestHash(request);
  } catch (error) {
    if (error instanceof IdempotencyError && error.code === "INVALID_PAYLOAD") {
      return { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_PAYLOAD" };
    }
    throw error;
  }
  const startedAt = context.clock.now();
  const reservation = context.transaction.repositories.idempotency.reserve({
    scope,
    key: context.idempotencyKey,
    requestHash,
    createdAt: startedAt,
    claimExpiresAt: timestampAfter(startedAt, options.processingTimeoutMs)
  }, startedAt);
  if (reservation.outcome === "conflict") return { outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" };
  if (reservation.outcome === "in_progress") return { outcome: "in_progress", status: 409, code: "IDEMPOTENCY_IN_PROGRESS" };
  if (reservation.outcome === "replay") return replay(reservation.record.entity);
  const response8 = run();
  validateResponse(response8);
  const completedAt = context.clock.now();
  const terminalBase = {
    scope,
    key: context.idempotencyKey,
    requestHash,
    responseStatus: response8.status,
    response: { schemaVersion: 1, value: response8.body },
    createdAt: reservation.record.entity.createdAt,
    completedAt,
    expiresAt: timestampAfter(completedAt, options.retentionMs)
  };
  const updateOptions = { at: completedAt, expectedRevision: reservation.record.revision };
  const completed = response8.status >= 400 ? context.transaction.repositories.idempotency.fail({ ...terminalBase, status: "failed" }, updateOptions) : context.transaction.repositories.idempotency.complete({ ...terminalBase, status: "completed" }, updateOptions);
  if (completed.outcome !== "updated" && completed.outcome !== "unchanged") {
    throw new IdempotencyError("COMPLETION_FAILED", 500);
  }
  return { outcome: "executed", status: response8.status, body: response8.body };
}

// src/server/identity-service.ts
var statuses = /* @__PURE__ */ new Set(["pending", "active", "blocked", "rejected", "archived"]);
var roles = /* @__PURE__ */ new Set(["seller", "admin", "super_admin"]);
function response(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function userJson(user) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    status: user.status,
    role: user.role,
    permissions: [...user.permissions]
  };
}
function authorization(context) {
  if (context.actor.kind !== "user") return void 0;
  const lookup = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return lookup.outcome === "found" ? lookup.snapshot : void 0;
}
function created(result, entity) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent identity transaction`);
}
var IdentityQueryService = class {
  constructor(unitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  unitOfWork;
  findById(userId) {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.findById(userId)?.entity);
  }
  findByTelegramUserId(telegramUserId) {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.findByTelegramUserId(telegramUserId)?.entity);
  }
  listForActor(actorId) {
    return this.unitOfWork.transaction(({ repositories }) => {
      const auth = repositories.roles.getAuthorization(actorId);
      if (auth.outcome !== "found" || !auth.snapshot.permissions.includes("users:manage")) return [];
      return repositories.users.list().map((record2) => record2.entity);
    });
  }
  listActive() {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.list().map((record2) => record2.entity).filter((user) => user.status === "active"));
  }
};
var IdentityService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid2());
  }
  executor;
  options;
  createId;
  update(metadata, targetUserId, input) {
    return this.executor.execute(metadata, (context) => {
      const auth = authorization(context);
      if (!auth || !auth.permissions.includes("users:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      if (input.role !== void 0 && !auth.permissions.includes("roles:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0440\u043E\u043B\u0438") };
      }
      return executeIdempotently(context, "identity.user.update", {
        targetUserId,
        status: input.status ?? null,
        role: input.role ?? null
      }, this.idempotencyOptions(), () => this.applyChange(context, auth.userId, targetUserId, input, "update"));
    }, { transactionMode: "immediate" });
  }
  onboard(metadata, targetUserId, action, role) {
    return this.executor.execute(metadata, (context) => {
      const auth = authorization(context);
      if (!auth || !auth.permissions.includes("users:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      return executeIdempotently(context, "identity.onboarding", {
        targetUserId,
        action,
        role: role ?? null
      }, this.idempotencyOptions(), () => {
        if (action === "approve" && (!role || !roles.has(role) || role === "super_admin")) {
          return response(400, "BAD_ONBOARD_ROLE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0440\u043E\u043B\u044C onboarding");
        }
        if (action === "approve" && role === "admin" && !auth.permissions.includes("roles:manage")) {
          return response(403, "OWNER_REQUIRED", "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E super admin");
        }
        const target = context.transaction.repositories.users.findById(targetUserId);
        if (!target || target.entity.status !== "pending") {
          return response(404, "PENDING_USER_NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u0438\u044F");
        }
        return this.applyChange(
          context,
          auth.userId,
          targetUserId,
          action === "approve" ? { status: "active", role } : { status: "rejected" },
          action
        );
      });
    }, { transactionMode: "immediate" });
  }
  registerTelegramApplicant(metadata, applicant) {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "system" || context.actor.authenticatedBy !== "telegram_webhook") {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      const telegramUserId = applicant.telegramUserId.trim();
      if (!/^\d{1,20}$/.test(telegramUserId)) {
        return { outcome: "rejected", ...response(403, "BAD_TELEGRAM_USER", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 Telegram user") };
      }
      return executeIdempotently(context, "identity.telegram.register", {
        telegramUserId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        username: applicant.username
      }, this.idempotencyOptions(), () => {
        const at = context.clock.now();
        const saved = context.transaction.repositories.users.createPendingTelegram({
          id: `tg-${telegramUserId}`,
          telegramUserId,
          firstName: applicant.firstName.trim().slice(0, 128),
          lastName: applicant.lastName.trim().slice(0, 128),
          username: applicant.username.trim().slice(0, 128)
        }, at);
        if (saved.created) {
          created(context.transaction.repositories.audit.append({
            id: this.createId("audit"),
            entity: "telegram_onboarding",
            entityId: saved.record.entity.id,
            action: "request",
            changes: { schemaVersion: 1, value: { telegramUserId, correlationId: context.correlationId } },
            requestId: context.requestId,
            createdAt: at
          }, { at, expectedRevision: null }), "onboarding request audit");
          for (const adminId of context.transaction.repositories.users.listActiveOnboardingReviewerIds()) {
            created(context.transaction.repositories.outbox.enqueue({
              id: this.createId("outbox"),
              channel: "telegram",
              userId: adminId,
              type: "telegram_onboarding_request",
              payload: { schemaVersion: 1, value: {
                schemaVersion: 1,
                text: `\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u044F\u0432\u043A\u0430: ${`${saved.record.entity.firstName} ${saved.record.entity.lastName}`.trim() || saved.record.entity.id}`,
                userId: saved.record.entity.id,
                reply_markup: { inline_keyboard: [[
                  { text: "\u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430", callback_data: `onboard:approve:${saved.record.entity.id}:seller` },
                  { text: "\u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430", callback_data: `onboard:approve:${saved.record.entity.id}:admin` },
                  { text: "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C", callback_data: `onboard:reject:${saved.record.entity.id}` }
                ]] },
                correlationId: context.correlationId
              } },
              status: "pending",
              attemptCount: 0,
              maxAttempts: this.options.outboxMaxAttempts,
              availableAt: at,
              createdAt: at,
              idempotencyKey: `identity:onboarding-request:${saved.record.entity.id}:${adminId}`
            }, { at, expectedRevision: null }), "onboarding request outbox");
          }
        }
        return { status: saved.created ? 201 : 200, body: { user: userJson(saved.record.entity), created: saved.created } };
      });
    }, { transactionMode: "immediate" });
  }
  applyChange(context, actorId, targetUserId, input, action) {
    if (input.status !== void 0 && !statuses.has(input.status)) return response(400, "BAD_USER_STATUS", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F");
    if (input.role !== void 0 && !roles.has(input.role)) return response(400, "BAD_USER_ROLE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0440\u043E\u043B\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F");
    if (input.status === void 0 && input.role === void 0) return response(400, "EMPTY_USER_CHANGE", "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u044B");
    const repositories = context.transaction.repositories;
    let current = repositories.users.findById(targetUserId);
    if (!current) return response(404, "USER_NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const beforeStatus = current.entity.status;
    const beforeRole = current.entity.role;
    const nextStatus = input.status ?? current.entity.status;
    const nextRole = input.role ?? current.entity.role;
    const statusChanged = nextStatus !== current.entity.status;
    const roleChanged = nextRole !== current.entity.role;
    if (actorId === targetUserId && statusChanged && nextStatus !== "active") {
      return response(409, "SELF_DEACTIVATION_FORBIDDEN", "\u041D\u0435\u043B\u044C\u0437\u044F \u0434\u0435\u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0443\u044E \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C");
    }
    if (actorId === targetUserId && roleChanged && current.entity.role === "super_admin" && nextRole !== "super_admin") {
      return response(409, "SELF_DEMOTION_FORBIDDEN", "\u041D\u0435\u043B\u044C\u0437\u044F \u043F\u043E\u043D\u0438\u0437\u0438\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0443\u044E \u0440\u043E\u043B\u044C");
    }
    const removesActiveSuperAdmin = current.entity.status === "active" && current.entity.role === "super_admin" && (nextStatus !== "active" || nextRole !== "super_admin");
    if (removesActiveSuperAdmin && repositories.users.countActiveSuperAdmins() <= 1) {
      return response(409, "LAST_SUPER_ADMIN", "\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E super admin");
    }
    if (!statusChanged && !roleChanged) return { status: 200, body: { user: userJson(current.entity), unchanged: true } };
    const at = context.clock.now();
    if (statusChanged) {
      const saved = repositories.users.saveStatus(targetUserId, nextStatus, { at, expectedRevision: current.revision });
      if (saved.outcome !== "updated") throw new Error("Identity status conditional write failed inside immediate transaction");
      current = saved.record;
    }
    if (roleChanged) current = repositories.users.assignPrimaryRole(targetUserId, nextRole, { actorId, at });
    const revokedSessions = repositories.sessions.revokeActiveForUser(targetUserId, at);
    const changes = {
      action,
      before: { status: beforeStatus, role: beforeRole },
      status: nextStatus,
      role: nextRole,
      revokedSessions,
      correlationId: context.correlationId
    };
    created(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: action === "update" ? "user" : "telegram_onboarding",
      entityId: targetUserId,
      action,
      changes: { schemaVersion: 1, value: changes },
      requestId: context.requestId,
      createdAt: at
    }, { at, expectedRevision: null }), "identity audit");
    const text2 = action === "reject" ? "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0430 \u0434\u043E\u0441\u0442\u0443\u043F \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430." : action === "approve" ? "\u0414\u043E\u0441\u0442\u0443\u043F \u043E\u0434\u043E\u0431\u0440\u0435\u043D. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 WebApp \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043C\u0435\u043D\u044E \u0431\u043E\u0442\u0430." : "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B. \u0412\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0432\u0445\u043E\u0434 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E.";
    const eventVersion = current.revision;
    created(repositories.outbox.enqueue({
      id: this.createId("outbox"),
      channel: "telegram",
      userId: targetUserId,
      type: action === "update" ? "identity_access_changed" : `telegram_onboarding_${action}`,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, text: text2, userId: targetUserId, status: nextStatus, role: nextRole, correlationId: context.correlationId } },
      status: "pending",
      attemptCount: 0,
      maxAttempts: this.options.outboxMaxAttempts,
      availableAt: at,
      createdAt: at,
      idempotencyKey: `identity:${targetUserId}:${action}:${eventVersion}`
    }, { at, expectedRevision: null }), "identity outbox");
    const final = repositories.users.findById(targetUserId);
    if (!final) throw new Error("Identity user disappeared inside transaction");
    return { status: 200, body: { user: userJson(final.entity), revokedSessions } };
  }
  idempotencyOptions() {
    return { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs };
  }
};

// src/server/session-service.ts
import { createHmac, randomBytes } from "node:crypto";
import { nanoid as nanoid3 } from "nanoid";
var SessionServiceError = class extends Error {
  constructor(code) {
    super(`Session service failed: ${code}`);
    this.code = code;
    this.name = "SessionServiceError";
  }
  code;
};
var rawTokenPattern = /^[A-Za-z0-9_-]{43}$/;
function addMilliseconds(at, milliseconds) {
  const parsed = new Date(at);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== at) {
    throw new RangeError("Session time contract is invalid");
  }
  return new Date(parsed.getTime() + milliseconds).toISOString();
}
var SessionService = class {
  constructor(unitOfWork, clock, options) {
    this.unitOfWork = unitOfWork;
    this.clock = clock;
    this.options = options;
    if (Buffer.byteLength(options.secret, "utf8") < 32) throw new RangeError("Session secret must be at least 32 bytes");
    if (!Number.isSafeInteger(options.maxAgeMs) || options.maxAgeMs < 1) throw new RangeError("Session max age must be positive");
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
    this.createId = options.createId ?? (() => nanoid3());
  }
  unitOfWork;
  clock;
  options;
  createToken;
  createId;
  create(userId, method) {
    return this.createResolved(method, (repositories) => repositories.principals.findActive(userId));
  }
  createForTelegram(telegramUserId) {
    return this.createResolved("telegram", (repositories) => repositories.principals.findActiveByTelegramUserId(telegramUserId));
  }
  findActiveTelegramPrincipal(telegramUserId) {
    return this.unitOfWork.transaction(({ repositories }) => repositories.principals.findActiveByTelegramUserId(telegramUserId));
  }
  createResolved(method, resolveUser) {
    const token = this.createToken();
    if (!rawTokenPattern.test(token)) throw new SessionServiceError("BAD_TOKEN_GENERATOR");
    const result = this.unitOfWork.transaction(({ repositories }) => {
      const user = resolveUser(repositories);
      if (!user) return { outcome: "inactive" };
      const userId = user.id;
      const at = this.clock.now();
      const sessionId = this.createId("session");
      const expiresAt = addMilliseconds(at, this.options.maxAgeMs);
      const revoked = repositories.sessions.revokeActiveForUser(userId, at);
      const session2 = {
        id: sessionId,
        userId,
        method,
        expiresAt,
        createdAt: at,
        tokenHash: this.hash(token),
        metadata: {
          schemaVersion: 1,
          value: { credentialVersion: 1, hashAlgorithm: "hmac-sha256" }
        }
      };
      const created4 = repositories.sessions.create(session2, { at, expectedRevision: null });
      if (created4.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      const audit3 = repositories.audit.append({
        id: this.createId("audit"),
        actorId: userId,
        entity: "session",
        entityId: sessionId,
        action: "rotate",
        changes: {
          schemaVersion: 1,
          value: { method, expiresAt, revokedSessionCount: revoked }
        },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit3.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return { outcome: "created", token, sessionId, expiresAt, user };
    }, { mode: "immediate" });
    if (result.outcome === "inactive") throw new SessionServiceError("USER_NOT_ACTIVE");
    const { outcome: _outcome, ...created3 } = result;
    return created3;
  }
  authenticate(token) {
    const tokenHash = this.hashCredential(token);
    if (!tokenHash) return void 0;
    return this.unitOfWork.transaction(({ repositories }) => {
      const record2 = repositories.sessions.findUsableByCredential(tokenHash, this.clock.now());
      if (!record2) return void 0;
      const user = repositories.principals.findActive(record2.entity.userId);
      return user ? { sessionId: record2.entity.id, user } : void 0;
    });
  }
  logout(token) {
    const tokenHash = this.hashCredential(token);
    if (!tokenHash) return false;
    return this.unitOfWork.transaction(({ repositories }) => {
      const at = this.clock.now();
      const current = repositories.sessions.findUsableByCredential(tokenHash, at);
      if (!current) return false;
      const revoked = repositories.sessions.revoke(current.entity.id, { at, expectedRevision: current.revision });
      if (revoked.outcome !== "updated") throw new SessionServiceError("SESSION_CREATE_FAILED");
      const audit3 = repositories.audit.append({
        id: this.createId("audit"),
        actorId: current.entity.userId,
        entity: "session",
        entityId: current.entity.id,
        action: "logout",
        changes: { schemaVersion: 1, value: { revokedAt: at } },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit3.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return true;
    }, { mode: "immediate" });
  }
  revokeUser(userId, actorId, reason) {
    return this.unitOfWork.transaction(({ repositories }) => {
      const at = this.clock.now();
      const revoked = repositories.sessions.revokeActiveForUser(userId, at);
      if (revoked === 0) return 0;
      const audit3 = repositories.audit.append({
        id: this.createId("audit"),
        actorId,
        entity: "session",
        entityId: userId,
        action: "revoke_user_sessions",
        changes: { schemaVersion: 1, value: { reason, revokedSessionCount: revoked } },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit3.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return revoked;
    }, { mode: "immediate" });
  }
  hashCredential(token) {
    return typeof token === "string" && rawTokenPattern.test(token) ? this.hash(token) : void 0;
  }
  hash(token) {
    return `hmac-sha256:${createHmac("sha256", this.options.secret).update(token, "utf8").digest("hex")}`;
  }
};

// src/server/session-cookie.ts
function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: "/",
    maxAge: config.maxAgeMs
  };
}
function sessionCookieClearOptions(config) {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(config);
  return options;
}

// src/server/mappers/core.ts
init_quantity();
var RowMappingError = class extends Error {
  constructor(entity, entityId, field, code) {
    super(`Cannot map ${entity} ${entityId}: ${field} (${code})`);
    this.entity = entity;
    this.entityId = entityId;
    this.field = field;
    this.code = code;
    this.name = "RowMappingError";
  }
  entity;
  entityId;
  field;
  code;
};
function rowIdentity(row, fields = ["id"]) {
  const values5 = fields.map((field) => row[field]).filter((value) => value !== null && value !== void 0);
  return values5.length ? values5.map(String).join("/") : "<unknown>";
}
function fail(entity, row, field, code, identityFields) {
  throw new RowMappingError(entity, rowIdentity(row, identityFields), field, code);
}
function requiredString(entity, row, field, identityFields) {
  const value = row[field];
  if (typeof value !== "string") fail(entity, row, field, value === null || value === void 0 ? "MISSING" : "TYPE", identityFields);
  return value;
}
function nullableString(entity, row, field, identityFields) {
  const value = row[field];
  if (value === null || value === void 0) return void 0;
  if (typeof value !== "string") fail(entity, row, field, "TYPE", identityFields);
  return value;
}
function integer(entity, row, field, identityFields) {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(entity, row, field, "INTEGER", identityFields);
  return value;
}
function enumValue(entity, row, field, values5, identityFields) {
  const value = requiredString(entity, row, field, identityFields);
  if (!values5.includes(value)) fail(entity, row, field, "ENUM", identityFields);
  return value;
}
function isJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}
function versionedJson(entity, row, field, identityFields) {
  const raw = requiredString(entity, row, field, identityFields);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(entity, row, field, "JSON", identityFields);
  }
  if (!isJsonValue(parsed)) fail(entity, row, field, "JSON", identityFields);
  if (parsed && !Array.isArray(parsed) && typeof parsed === "object" && "schemaVersion" in parsed && "value" in parsed) {
    const envelope = parsed;
    if (envelope.schemaVersion !== 1) fail(entity, row, field, "JSON_VERSION", identityFields);
    if (!isJsonValue(envelope.value)) fail(entity, row, field, "JSON", identityFields);
    return { schemaVersion: 1, value: envelope.value };
  }
  return { schemaVersion: 1, value: parsed };
}
function serializeVersionedJson(payload) {
  if (payload.schemaVersion !== 1 || !isJsonValue(payload.value)) throw new TypeError("Invalid versioned JSON payload");
  return JSON.stringify(payload);
}
function utcTimestamp(entity, row, field, identityFields) {
  const value = requiredString(entity, row, field, identityFields);
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(candidate)) fail(entity, row, field, "TIMESTAMP", identityFields);
  const date2 = new Date(candidate);
  if (!Number.isFinite(date2.getTime())) fail(entity, row, field, "TIMESTAMP", identityFields);
  const canonical = candidate.includes(".") ? candidate : candidate.replace("Z", ".000Z");
  if (date2.toISOString() !== canonical) fail(entity, row, field, "TIMESTAMP", identityFields);
  return date2.toISOString();
}
function nullableUtcTimestamp(entity, row, field, identityFields) {
  if (row[field] === null || row[field] === void 0) return void 0;
  return utcTimestamp(entity, row, field, identityFields);
}
function localDate(entity, row, field, identityFields) {
  const value = requiredString(entity, row, field, identityFields);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(entity, row, field, "DATE", identityFields);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(entity, row, field, "DATE", identityFields);
  return value;
}
function quantity(entity, row, input, identityFields) {
  try {
    const minor = integer(entity, row, input.minorField, identityFields);
    const value = quantityFromMinor(minor);
    requireQuantity(value, { unit: input.unit, allowZero: input.allowZero });
    const transitional = row[input.realField];
    if (typeof transitional !== "number" || quantityToMinor(transitional, input.unit) !== minor) fail(entity, row, input.realField, "QUANTITY", identityFields);
    return value;
  } catch (error) {
    if (error instanceof RowMappingError) throw error;
    fail(entity, row, input.minorField, "QUANTITY", identityFields);
  }
}
function quantityColumns(value, unit, allowZero = true) {
  const normalized = requireQuantity(value, { unit, allowZero });
  return { real: normalized, minor: quantityToMinor(normalized, unit) };
}
var toNullable = (value) => value ?? null;

// src/server/mappers/identity.ts
var roles2 = ["seller", "admin", "super_admin"];
var permissions = [
  "products:read",
  "products:write",
  "stock:move",
  "inventory:write",
  "reports:read",
  "imports:write",
  "merge:write",
  "schedule:manage",
  "staff:manage",
  "saby:manage",
  "users:manage",
  "roles:manage",
  "techlog:read",
  "labels:print"
];
var userStatuses = ["pending", "active", "blocked", "rejected", "archived"];
var sessionMethods = ["demo", "telegram", "magic_link"];
function timestampRevision(entity, id, revision2, expected) {
  if (revision2 !== expected) throw new RowMappingError(entity, id, "revision", "TIMESTAMP");
  return expected;
}
function versionForWrite(entity, id, version2, revision2) {
  if (!Number.isSafeInteger(version2) || version2 < 0 || revision2 !== String(version2)) {
    throw new RowMappingError(entity, id, "version", "INTEGER");
  }
  return version2;
}
var roleMapper = {
  fromRow(row) {
    const createdAt = utcTimestamp("roles", row, "created_at");
    const updatedAt = utcTimestamp("roles", row, "updated_at");
    return { role: enumValue("roles", row, "id", roles2), name: requiredString("roles", row, "name"), description: requiredString("roles", row, "description"), createdAt, updatedAt, revision: updatedAt };
  },
  toRow(value) {
    return { id: value.role, name: value.name, description: value.description, created_at: value.createdAt, updated_at: timestampRevision("roles", value.role, value.revision, value.updatedAt) };
  }
};
var permissionMapper = {
  fromRow(row) {
    const createdAt = utcTimestamp("permissions", row, "created_at");
    return { permission: enumValue("permissions", row, "code", permissions), description: requiredString("permissions", row, "description"), createdAt, revision: createdAt };
  },
  toRow(value) {
    return { id: value.permission, code: value.permission, description: value.description, created_at: timestampRevision("permissions", value.permission, value.revision, value.createdAt) };
  }
};
var userMapper = {
  fromRow(row) {
    const id = requiredString("users", row, "id");
    const updatedAt = utcTimestamp("users", row, "updated_at");
    const version2 = integer("users", row, "version");
    if (version2 < 0) throw new RowMappingError("users", id, "version", "INTEGER");
    return {
      id,
      telegramUserId: nullableString("users", row, "telegram_user_id"),
      firstName: requiredString("users", row, "first_name"),
      lastName: requiredString("users", row, "last_name"),
      username: requiredString("users", row, "username"),
      status: enumValue("users", row, "status", userStatuses),
      createdAt: utcTimestamp("users", row, "created_at"),
      updatedAt,
      archivedAt: nullableUtcTimestamp("users", row, "archived_at"),
      version: version2,
      revision: String(version2)
    };
  },
  toRow(value) {
    return {
      id: value.id,
      telegram_user_id: toNullable(value.telegramUserId),
      first_name: value.firstName,
      last_name: value.lastName,
      username: value.username,
      status: value.status,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
      archived_at: toNullable(value.archivedAt),
      version: versionForWrite("users", value.id, value.version, value.revision)
    };
  }
};
var userRoleMapper = {
  fromRow(row) {
    return {
      userId: requiredString("user_roles", row, "user_id", ["user_id", "role_id"]),
      role: enumValue("user_roles", row, "role_id", roles2, ["user_id", "role_id"]),
      assignedByUserId: nullableString("user_roles", row, "assigned_by_user_id", ["user_id", "role_id"]),
      assignedAt: utcTimestamp("user_roles", row, "assigned_at", ["user_id", "role_id"])
    };
  },
  toRow(value) {
    return { user_id: value.userId, role_id: value.role, assigned_by_user_id: toNullable(value.assignedByUserId), assigned_at: value.assignedAt };
  }
};
var rolePermissionMapper = {
  fromRow(row) {
    return {
      role: enumValue("role_permissions", row, "role_id", roles2, ["role_id", "permission_id"]),
      permission: enumValue("role_permissions", row, "permission_id", permissions, ["role_id", "permission_id"])
    };
  },
  toRow(value) {
    return { role_id: value.role, permission_id: value.permission };
  }
};
var sessionMapper = {
  fromRow(row) {
    const id = requiredString("sessions", row, "id");
    const createdAt = utcTimestamp("sessions", row, "created_at");
    const version2 = integer("sessions", row, "version");
    if (version2 < 0) throw new RowMappingError("sessions", id, "version", "INTEGER");
    return {
      id,
      userId: requiredString("sessions", row, "user_id"),
      method: enumValue("sessions", row, "method", sessionMethods),
      expiresAt: utcTimestamp("sessions", row, "expires_at"),
      revokedAt: nullableUtcTimestamp("sessions", row, "revoked_at"),
      createdAt,
      tokenHash: nullableString("sessions", row, "token_hash"),
      version: version2,
      updatedAt: utcTimestamp("sessions", row, "updated_at"),
      metadata: versionedJson("sessions", row, "metadata_json"),
      revision: String(version2)
    };
  },
  toRow(value) {
    return {
      id: value.id,
      user_id: value.userId,
      method: value.method,
      expires_at: value.expiresAt,
      revoked_at: toNullable(value.revokedAt),
      created_at: value.createdAt,
      metadata_json: serializeVersionedJson(value.metadata),
      token_hash: toNullable(value.tokenHash),
      version: versionForWrite("sessions", value.id, value.version, value.revision),
      updated_at: value.updatedAt
    };
  }
};

// src/server/mappers/workflows.ts
var labelStatuses = ["created", "queued", "processing", "completed", "failed", "cancelled"];
var channels = ["telegram", "webapp"];
var deliveryModes = ["off", "instant", "daily"];
var outboxStatuses = ["pending", "processing", "sent", "failed", "cancelled"];
var idempotencyStatuses = ["processing", "completed", "failed"];
function assertIdempotencyConsistency(value) {
  const entityId = `${value.scope}/${value.key}`;
  if (value.status === "processing") {
    if (value.responseStatus !== void 0) throw new RowMappingError("idempotency_keys", entityId, "response_status", "TYPE");
    if (value.response !== void 0) throw new RowMappingError("idempotency_keys", entityId, "response_json", "TYPE");
    if (value.completedAt !== void 0) throw new RowMappingError("idempotency_keys", entityId, "completed_at", "TYPE");
    return;
  }
  if (value.responseStatus === void 0) throw new RowMappingError("idempotency_keys", entityId, "response_status", "MISSING");
  if (value.responseStatus < 100 || value.responseStatus > 599) throw new RowMappingError("idempotency_keys", entityId, "response_status", "INTEGER");
  if (value.response === void 0) throw new RowMappingError("idempotency_keys", entityId, "response_json", "MISSING");
  if (value.completedAt === void 0) throw new RowMappingError("idempotency_keys", entityId, "completed_at", "MISSING");
}
function assertOutboxConsistency(value) {
  if (value.attemptCount > value.maxAttempts) {
    throw new RowMappingError("outbox_messages", value.id, "attempt_count", "INTEGER");
  }
  const leaseFields = [value.leaseOwner, value.leaseToken, value.leaseExpiresAt];
  const completeLease = leaseFields.every((field) => field !== void 0);
  const emptyLease = leaseFields.every((field) => field === void 0);
  if (value.status === "processing" && !completeLease) throw new RowMappingError("outbox_messages", value.id, "lease_token", "MISSING");
  if (value.status !== "processing" && !emptyLease) throw new RowMappingError("outbox_messages", value.id, "lease_token", "TYPE");
}
function revision(entity, row, identityFields) {
  return String(nonNegativeInteger(entity, row, "version", identityFields));
}
function revisionVersion(entity, entityId, value) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new RowMappingError(entity, entityId, "version", "INTEGER");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RowMappingError(entity, entityId, "version", "INTEGER");
  return parsed;
}
function jsonObject(entity, row, field, identityFields) {
  const payload = versionedJson(entity, row, field, identityFields);
  if (payload.value === null || Array.isArray(payload.value) || typeof payload.value !== "object") {
    throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "JSON");
  }
  return { schemaVersion: payload.schemaVersion, value: payload.value };
}
function jsonArray(entity, row, field, identityFields) {
  const payload = versionedJson(entity, row, field, identityFields);
  if (!Array.isArray(payload.value)) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "JSON");
  return { schemaVersion: payload.schemaVersion, value: payload.value };
}
function positiveInteger2(entity, row, field, identityFields) {
  const value = integer(entity, row, field, identityFields);
  if (value <= 0) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "INTEGER");
  return value;
}
function nonNegativeInteger(entity, row, field, identityFields) {
  const value = integer(entity, row, field, identityFields);
  if (value < 0) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "INTEGER");
  return value;
}
function labelJobFromRow(row) {
  const entity = "label_jobs";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      actorId: nullableString(entity, row, "actor_id"),
      status: enumValue(entity, row, "status", labelStatuses),
      templateId: requiredString(entity, row, "template_id"),
      geometry: jsonObject(entity, row, "geometry_json"),
      labels: jsonArray(entity, row, "labels_json"),
      result: jsonObject(entity, row, "result_json"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      completedAt: nullableUtcTimestamp(entity, row, "completed_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}
function labelJobToRow(record2) {
  const value = record2.entity;
  return {
    id: value.id,
    actor_id: toNullable(value.actorId),
    status: value.status,
    template_id: value.templateId,
    geometry_json: serializeVersionedJson(value.geometry),
    labels_json: serializeVersionedJson(value.labels),
    result_json: serializeVersionedJson(value.result),
    created_at: value.createdAt,
    completed_at: toNullable(value.completedAt),
    version: revisionVersion("label_jobs", value.id, record2.revision),
    updated_at: value.updatedAt
  };
}
var notificationPreferenceIdentity = ["user_id", "channel", "event_type"];
function notificationPreferenceFromRow(row) {
  const entity = "notification_preferences";
  return {
    revision: revision(entity, row, notificationPreferenceIdentity),
    entity: {
      preference: {
        userId: requiredString(entity, row, "user_id", notificationPreferenceIdentity),
        channel: enumValue(entity, row, "channel", channels, notificationPreferenceIdentity),
        eventType: requiredString(entity, row, "event_type", notificationPreferenceIdentity),
        deliveryMode: enumValue(entity, row, "delivery_mode", deliveryModes, notificationPreferenceIdentity)
      },
      updatedAt: utcTimestamp(entity, row, "updated_at", notificationPreferenceIdentity)
    }
  };
}
function webappNotificationFromRow(row) {
  const entity = "webapp_notifications";
  const isRead = integer(entity, row, "is_read");
  if (isRead !== 0 && isRead !== 1) throw new RowMappingError(entity, rowIdentity(row), "is_read", "ENUM");
  return {
    revision: revision(entity, row),
    entity: {
      notification: {
        id: requiredString(entity, row, "id"),
        channel: "webapp",
        userId: requiredString(entity, row, "recipient_user_id"),
        type: requiredString(entity, row, "type"),
        payload: jsonObject(entity, row, "payload_json"),
        read: isRead === 1,
        createdAt: utcTimestamp(entity, row, "created_at")
      },
      readAt: nullableUtcTimestamp(entity, row, "read_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}
function webappNotificationToRow(record2) {
  const { notification, readAt, updatedAt } = record2.entity;
  if (notification.channel !== "webapp") throw new RowMappingError("webapp_notifications", notification.id, "channel", "ENUM");
  return {
    id: notification.id,
    recipient_user_id: notification.userId,
    type: notification.type,
    payload_json: serializeVersionedJson(notification.payload),
    is_read: notification.read ? 1 : 0,
    created_at: notification.createdAt,
    read_at: toNullable(readAt),
    version: revisionVersion("webapp_notifications", notification.id, record2.revision),
    updated_at: updatedAt
  };
}
function outboxMessageFromRow(row) {
  const entity = "outbox_messages";
  const record2 = {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      channel: enumValue(entity, row, "channel", channels),
      userId: requiredString(entity, row, "recipient_user_id"),
      type: requiredString(entity, row, "type"),
      payload: jsonObject(entity, row, "payload_json"),
      status: enumValue(entity, row, "status", outboxStatuses),
      idempotencyKey: nullableString(entity, row, "idempotency_key"),
      attemptCount: nonNegativeInteger(entity, row, "attempt_count"),
      maxAttempts: positiveInteger2(entity, row, "max_attempts"),
      availableAt: utcTimestamp(entity, row, "available_at"),
      lastError: nullableString(entity, row, "last_error"),
      lastErrorCode: nullableString(entity, row, "last_error_code"),
      leaseOwner: nullableString(entity, row, "lease_owner"),
      leaseToken: nullableString(entity, row, "lease_token"),
      leaseExpiresAt: nullableUtcTimestamp(entity, row, "lease_expires_at"),
      failedAt: nullableUtcTimestamp(entity, row, "failed_at"),
      sentAt: nullableUtcTimestamp(entity, row, "sent_at"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
  assertOutboxConsistency(record2.entity);
  return record2;
}
function outboxMessageToRow(record2) {
  const value = record2.entity;
  assertOutboxConsistency(value);
  return {
    id: value.id,
    channel: value.channel,
    recipient_user_id: value.userId,
    type: value.type,
    payload_json: serializeVersionedJson(value.payload),
    status: value.status,
    idempotency_key: toNullable(value.idempotencyKey),
    attempt_count: value.attemptCount,
    max_attempts: value.maxAttempts,
    available_at: value.availableAt,
    last_error: toNullable(value.lastError),
    last_error_code: toNullable(value.lastErrorCode),
    lease_owner: toNullable(value.leaseOwner),
    lease_token: toNullable(value.leaseToken),
    lease_expires_at: toNullable(value.leaseExpiresAt),
    failed_at: toNullable(value.failedAt),
    sent_at: toNullable(value.sentAt),
    created_at: value.createdAt,
    version: revisionVersion("outbox_messages", value.id, record2.revision),
    updated_at: value.updatedAt
  };
}
function auditEntryFromRow(row) {
  const entity = "audit_entries";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      actorId: nullableString(entity, row, "actor_id"),
      entity: requiredString(entity, row, "entity_type"),
      entityId: requiredString(entity, row, "entity_id"),
      action: requiredString(entity, row, "action"),
      changes: jsonObject(entity, row, "changes_json"),
      requestId: nullableString(entity, row, "request_id"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}
function auditEntryToRow(record2) {
  const value = record2.entity;
  return {
    id: value.id,
    actor_id: toNullable(value.actorId),
    entity_type: value.entity,
    entity_id: value.entityId,
    action: value.action,
    changes_json: serializeVersionedJson(value.changes),
    request_id: toNullable(value.requestId),
    created_at: value.createdAt,
    version: revisionVersion("audit_entries", value.id, record2.revision),
    updated_at: value.updatedAt
  };
}
var idempotencyIdentity = ["scope", "key"];
function idempotencyKeyFromRow(row) {
  const entity = "idempotency_keys";
  const record2 = {
    revision: revision(entity, row, idempotencyIdentity),
    entity: {
      scope: requiredString(entity, row, "scope", idempotencyIdentity),
      key: requiredString(entity, row, "key", idempotencyIdentity),
      requestHash: requiredString(entity, row, "request_hash", idempotencyIdentity),
      status: enumValue(entity, row, "status", idempotencyStatuses, idempotencyIdentity),
      responseStatus: row.response_status === null || row.response_status === void 0 ? void 0 : integer(entity, row, "response_status", idempotencyIdentity),
      response: row.response_json === null || row.response_json === void 0 ? void 0 : versionedJson(entity, row, "response_json", idempotencyIdentity),
      createdAt: utcTimestamp(entity, row, "created_at", idempotencyIdentity),
      completedAt: nullableUtcTimestamp(entity, row, "completed_at", idempotencyIdentity),
      expiresAt: nullableUtcTimestamp(entity, row, "expires_at", idempotencyIdentity),
      updatedAt: utcTimestamp(entity, row, "updated_at", idempotencyIdentity)
    }
  };
  assertIdempotencyConsistency(record2.entity);
  return record2;
}
function idempotencyKeyToRow(record2) {
  const value = record2.entity;
  assertIdempotencyConsistency(value);
  return {
    scope: value.scope,
    key: value.key,
    request_hash: value.requestHash,
    status: value.status,
    response_status: value.responseStatus ?? null,
    response_json: value.response ? serializeVersionedJson(value.response) : null,
    created_at: value.createdAt,
    completed_at: toNullable(value.completedAt),
    expires_at: toNullable(value.expiresAt),
    version: revisionVersion("idempotency_keys", `${value.scope}/${value.key}`, record2.revision),
    updated_at: value.updatedAt
  };
}

// src/server/sqlite-session-command-repositories.ts
function first(database2, sql, parameters) {
  return database2.query(sql, parameters)[0];
}
function values(row, columns) {
  return columns.map((column) => row[column]);
}
function revisionNumber(revision2) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision2)) return void 0;
  const value = Number(revision2);
  return Number.isSafeInteger(value) ? value : void 0;
}
function assertCreateOptions(options) {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}
function sessionRecordFromRow(row) {
  const mapped = sessionMapper.fromRow(row);
  if (!mapped.tokenHash) throw new TypeError(`Session ${mapped.id} has no token hash`);
  const { version: _version, updatedAt: _updatedAt, revision: revision2, ...session2 } = mapped;
  return { entity: { ...session2, tokenHash: mapped.tokenHash }, revision: revision2 };
}
function sessionRecord(database2, sessionId) {
  const row = first(database2, "SELECT * FROM sessions WHERE id = ?", [sessionId]);
  return row ? sessionRecordFromRow(row) : void 0;
}
function conflictingSessionRecord(database2, sessionId, tokenHash) {
  const row = first(
    database2,
    "SELECT * FROM sessions WHERE id = ? OR token_hash = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1",
    [sessionId, tokenHash, sessionId]
  );
  return row ? sessionRecordFromRow(row) : void 0;
}
function auditRecord(database2, entryId) {
  const row = first(database2, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return void 0;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}
function createSessionsRepository(database2) {
  return {
    findUsableByCredential(tokenHash, at) {
      const row = first(
        database2,
        "SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1",
        [tokenHash, at]
      );
      return row ? sessionRecordFromRow(row) : void 0;
    },
    create(session2, options) {
      assertCreateOptions(options);
      if (!session2.tokenHash) throw new TypeError("A session token hash is required");
      const mapped = sessionMapper.toRow({
        ...session2,
        version: 0,
        updatedAt: options.at,
        revision: "0"
      });
      const columns = [
        "id",
        "user_id",
        "method",
        "expires_at",
        "revoked_at",
        "created_at",
        "metadata_json",
        "token_hash",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO sessions(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = conflictingSessionRecord(database2, session2.id, session2.tokenHash);
      if (!current) throw new Error("session insert did not create or find a conflicting row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },
    revoke(sessionId, options) {
      const expected = revisionNumber(options.expectedRevision);
      if (expected === void 0 || !Number.isSafeInteger(expected + 1)) {
        const current2 = sessionRecord(database2, sessionId);
        return current2 ? { outcome: "stale", current: current2 } : { outcome: "missing" };
      }
      const result = database2.execute(
        `UPDATE sessions
         SET revoked_at = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND revoked_at IS NULL`,
        [options.at, options.at, sessionId, expected]
      );
      const current = sessionRecord(database2, sessionId);
      if (!current) return { outcome: "missing" };
      if (result.changes === 1) return { outcome: "updated", record: current };
      if (current.revision !== options.expectedRevision) return { outcome: "stale", current };
      return { outcome: "unchanged", record: current };
    },
    revokeActiveForUser(userId, revokedAt) {
      return database2.execute(
        `UPDATE sessions
         SET revoked_at = ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
        [revokedAt, revokedAt, userId]
      ).changes;
    }
  };
}
function createPrincipalsRepository(database2) {
  function findActive(field, value) {
    const rawUser = first(database2, `SELECT * FROM users WHERE ${field} = ?`, [value]);
    if (!rawUser) return void 0;
    const user = userMapper.fromRow(rawUser);
    if (user.status !== "active") return void 0;
    const assignments = database2.query(
      "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
      [user.id]
    ).map((row) => userRoleMapper.fromRow(row));
    if (assignments.length !== 1) return void 0;
    const assignedRole = assignments[0]?.role;
    if (!assignedRole) return void 0;
    const rawRole = first(database2, "SELECT * FROM roles WHERE id = ?", [assignedRole]);
    if (!rawRole) return void 0;
    const role = roleMapper.fromRow(rawRole).role;
    const permissionLinks = database2.query(
      "SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
      [role]
    ).map((row) => rolePermissionMapper.fromRow(row));
    const permissions2 = [];
    for (const link of permissionLinks) {
      const rawPermission = first(database2, "SELECT * FROM permissions WHERE id = ?", [link.permission]);
      if (!rawPermission) return void 0;
      permissions2.push(permissionMapper.fromRow(rawPermission).permission);
    }
    return {
      id: user.id,
      telegramUserId: user.telegramUserId ?? "",
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      status: user.status,
      role,
      permissions: permissions2
    };
  }
  return {
    findActive: (userId) => findActive("id", userId),
    findActiveByTelegramUserId: (telegramUserId) => findActive("telegram_user_id", telegramUserId)
  };
}
function createAuditRepository(database2) {
  return {
    append(entry, options) {
      assertCreateOptions(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id",
        "actor_id",
        "entity_type",
        "entity_id",
        "action",
        "changes_json",
        "request_id",
        "created_at",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = auditRecord(database2, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createSqliteSessionCommandRepositories(database2) {
  return Object.freeze({
    sessions: createSessionsRepository(database2),
    principals: createPrincipalsRepository(database2),
    audit: createAuditRepository(database2)
  });
}

// src/server/sqlite-idempotency-repository.ts
function persistence(record2, updatedAt) {
  return { revision: record2.revision, entity: { ...record2.entity, updatedAt } };
}
function validateTerminal(record2, status) {
  if (record2.status !== status || !Number.isInteger(record2.responseStatus) || record2.responseStatus < 100 || record2.responseStatus > 599 || record2.response === void 0 || record2.completedAt === void 0 || record2.expiresAt === void 0) {
    throw new RangeError(`Idempotency ${status} record must contain a status, response, completion and expiry`);
  }
}
function utcMilliseconds(value) {
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const milliseconds = new Date(candidate).getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError("Invalid idempotency timestamp");
  return milliseconds;
}
var SqliteIdempotencyRepository = class {
  constructor(database2) {
    this.database = database2;
  }
  database;
  find(scope, key) {
    const row = this.database.query(
      "SELECT * FROM idempotency_keys WHERE scope = ? AND key = ?",
      [scope, key]
    )[0];
    return row ? idempotencyKeyFromRow(row) : void 0;
  }
  reserve(claim, at) {
    const record2 = {
      scope: claim.scope,
      key: claim.key,
      requestHash: claim.requestHash,
      status: "processing",
      createdAt: claim.createdAt,
      expiresAt: claim.claimExpiresAt
    };
    const row = idempotencyKeyToRow(persistence({ revision: "0", entity: record2 }, at));
    const inserted = this.database.execute(
      `INSERT INTO idempotency_keys(
        scope, key, request_hash, status, response_status, response_json,
        created_at, completed_at, expires_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, key) DO NOTHING`,
      [
        row.scope,
        row.key,
        row.request_hash,
        row.status,
        row.response_status,
        row.response_json,
        row.created_at,
        row.completed_at,
        row.expires_at,
        row.version,
        row.updated_at
      ]
    );
    if (inserted.changes === 1) return { outcome: "reserved", record: this.required(record2.scope, record2.key) };
    const current = this.required(record2.scope, record2.key);
    if (current.entity.requestHash !== record2.requestHash) return { outcome: "conflict", record: current };
    if (current.entity.status !== "processing") return { outcome: "replay", record: current };
    const version2 = Number(current.revision);
    const timeoutMs = utcMilliseconds(claim.claimExpiresAt) - utcMilliseconds(claim.createdAt);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("Invalid idempotency claim timeout");
    const recovered = this.database.execute(
      `UPDATE idempotency_keys
       SET response_status = NULL, response_json = NULL, completed_at = NULL,
           expires_at = ?, version = version + 1, updated_at = ?
       WHERE scope = ? AND key = ? AND request_hash = ? AND status = 'processing'
         AND version = ? AND (
           (expires_at IS NOT NULL AND julianday(expires_at) <= julianday(?))
           OR (expires_at IS NULL
             AND julianday(COALESCE(updated_at, created_at)) + ? <= julianday(?))
         )`,
      [
        record2.expiresAt,
        at,
        record2.scope,
        record2.key,
        record2.requestHash,
        version2,
        at,
        timeoutMs / 864e5,
        at
      ]
    );
    if (recovered.changes === 1) return { outcome: "reserved", record: this.required(record2.scope, record2.key) };
    return { outcome: "in_progress", record: this.required(record2.scope, record2.key) };
  }
  complete(record2, options) {
    validateTerminal(record2, "completed");
    return this.terminal(record2, options);
  }
  fail(record2, options) {
    validateTerminal(record2, "failed");
    return this.terminal(record2, options);
  }
  deleteExpired(expiredBefore, limit) {
    return this.database.execute(
      `DELETE FROM idempotency_keys WHERE rowid IN (
        SELECT rowid FROM idempotency_keys
        WHERE status <> 'processing' AND expires_at IS NOT NULL
          AND julianday(expires_at) <= julianday(?)
        ORDER BY expires_at ASC, scope ASC, key ASC LIMIT ?
      )`,
      [expiredBefore, limit]
    ).changes;
  }
  terminal(record2, options) {
    const row = idempotencyKeyToRow(persistence({ revision: options.expectedRevision, entity: record2 }, options.at));
    const updated = this.database.execute(
      `UPDATE idempotency_keys
       SET status = ?, response_status = ?, response_json = ?, completed_at = ?, expires_at = ?,
           version = version + 1, updated_at = ?
       WHERE scope = ? AND key = ? AND request_hash = ? AND status = 'processing' AND version = ?`,
      [
        row.status,
        row.response_status,
        row.response_json,
        row.completed_at,
        row.expires_at,
        row.updated_at,
        row.scope,
        row.key,
        row.request_hash,
        row.version
      ]
    );
    const current = this.find(record2.scope, record2.key);
    if (updated.changes === 1 && current) return { outcome: "updated", record: current };
    if (!current) return { outcome: "missing" };
    return { outcome: "stale", current };
  }
  required(scope, key) {
    const record2 = this.find(scope, key);
    if (!record2) throw new Error("Idempotency record disappeared inside transaction");
    return record2;
  }
};
function createSqliteIdempotencyRepository(database2) {
  return new SqliteIdempotencyRepository(database2);
}

// src/server/sqlite-identity-command-repositories.ts
function first2(database2, sql, parameters) {
  return database2.query(sql, parameters)[0];
}
function values2(row, columns) {
  return columns.map((column) => row[column]);
}
function revisionNumber2(revision2) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision2)) return void 0;
  const value = Number(revision2);
  return Number.isSafeInteger(value) ? value : void 0;
}
function assertCreateOptions2(options) {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}
function permissionsForRole(database2, role) {
  return database2.query(
    "SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
    [role]
  ).map((row) => rolePermissionMapper.fromRow(row).permission);
}
function userRecordFromRow(database2, row) {
  const mapped = userMapper.fromRow(row);
  const assignments = database2.query(
    "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
    [mapped.id]
  ).map((assignment) => userRoleMapper.fromRow(assignment));
  if (assignments.length !== 1 || !assignments[0]) return void 0;
  const role = assignments[0].role;
  return {
    entity: {
      id: mapped.id,
      telegramUserId: mapped.telegramUserId ?? "",
      firstName: mapped.firstName,
      lastName: mapped.lastName,
      username: mapped.username,
      status: mapped.status,
      role,
      permissions: permissionsForRole(database2, role)
    },
    revision: mapped.revision
  };
}
function userRecord(database2, field, value) {
  const row = first2(database2, `SELECT * FROM users WHERE ${field} = ?`, [value]);
  return row ? userRecordFromRow(database2, row) : void 0;
}
function auditRecord2(database2, entryId) {
  const row = first2(database2, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return void 0;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}
function outboxRecord(database2, messageId, channel2, idempotencyKey) {
  const row = first2(
    database2,
    channel2 && idempotencyKey ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1" : "SELECT * FROM outbox_messages WHERE id = ?",
    channel2 && idempotencyKey ? [messageId, channel2, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return void 0;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}
function createUsersRepository(database2) {
  return {
    findById: (userId) => userRecord(database2, "id", userId),
    findByTelegramUserId: (telegramUserId) => userRecord(database2, "telegram_user_id", telegramUserId),
    list() {
      return database2.query("SELECT * FROM users ORDER BY id", []).flatMap((row) => {
        const record2 = userRecordFromRow(database2, row);
        return record2 ? [record2] : [];
      });
    },
    createPendingTelegram(profile2, at) {
      const existing = userRecord(database2, "telegram_user_id", profile2.telegramUserId);
      if (existing) return { created: false, record: existing };
      const inserted = database2.execute(
        `INSERT INTO users(id, telegram_user_id, first_name, last_name, username, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0) ON CONFLICT DO NOTHING`,
        [profile2.id, profile2.telegramUserId, profile2.firstName, profile2.lastName, profile2.username, at, at]
      );
      if (inserted.changes === 1) {
        database2.execute(
          "INSERT INTO user_roles(user_id, role_id, assigned_by_user_id, assigned_at) VALUES (?, 'seller', NULL, ?)",
          [profile2.id, at]
        );
      }
      const current = userRecord(database2, "telegram_user_id", profile2.telegramUserId);
      if (!current) throw new Error("telegram applicant insert did not create or find a user");
      return { created: inserted.changes === 1, record: current };
    },
    saveStatus(userId, status, options) {
      const expected = revisionNumber2(options.expectedRevision);
      if (expected === void 0 || !Number.isSafeInteger(expected + 1)) {
        const current2 = userRecord(database2, "id", userId);
        return current2 ? { outcome: "stale", current: current2 } : { outcome: "missing" };
      }
      const result = database2.execute(
        `UPDATE users
         SET status = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE NULL END,
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
        [status, status, options.at, options.at, userId, expected]
      );
      const current = userRecord(database2, "id", userId);
      if (result.changes === 1) {
        if (!current) throw new Error("identity status update lost its user or primary role");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    assignPrimaryRole(userId, role, input) {
      const rawUser = first2(database2, "SELECT id FROM users WHERE id = ?", [userId]);
      if (!rawUser) throw new Error("Cannot assign a role to a missing user");
      const rawRole = first2(database2, "SELECT id FROM roles WHERE id = ?", [role]);
      if (!rawRole) throw new Error("Cannot assign a missing role");
      database2.execute("DELETE FROM user_roles WHERE user_id = ?", [userId]);
      const assignment = userRoleMapper.toRow({
        userId,
        role,
        assignedByUserId: input.actorId,
        assignedAt: input.at
      });
      database2.execute(
        "INSERT INTO user_roles(user_id, role_id, assigned_by_user_id, assigned_at) VALUES (?, ?, ?, ?)",
        [assignment.user_id, assignment.role_id, assignment.assigned_by_user_id, assignment.assigned_at]
      );
      const updated = database2.execute(
        "UPDATE users SET version = version + 1, updated_at = ? WHERE id = ?",
        [input.at, userId]
      );
      if (updated.changes !== 1) throw new Error("identity role update lost its user");
      const current = userRecord(database2, "id", userId);
      if (!current) throw new Error("identity role update did not produce one primary role");
      return current;
    },
    countActiveSuperAdmins() {
      const row = first2(
        database2,
        `SELECT COUNT(*) AS count
         FROM users u
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id) = 1
           AND EXISTS (
             SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = 'super_admin'
           )`,
        []
      );
      return row?.count ?? 0;
    },
    listActiveOnboardingReviewerIds() {
      return database2.query(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id IN ('admin','super_admin')
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles exact_role WHERE exact_role.user_id = u.id) = 1
         ORDER BY u.id`,
        []
      ).map((row) => row.id);
    }
  };
}
function createRolesRepository(database2) {
  return {
    getAuthorization(userId) {
      const rawUser = first2(database2, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };
      const assignedRoles = database2.query(
        "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
        [userId]
      ).map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(assignedRoles)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };
      const role = distinctRoles[0];
      if (!role) return { outcome: "missing" };
      return {
        outcome: "found",
        snapshot: { userId, role, permissions: permissionsForRole(database2, role), revision: user.revision }
      };
    }
  };
}
function createSessionsRepository2(database2) {
  return {
    revokeActiveForUser(userId, revokedAt) {
      return database2.execute(
        `UPDATE sessions
         SET revoked_at = ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
        [revokedAt, revokedAt, userId]
      ).changes;
    }
  };
}
function createAuditRepository2(database2) {
  return {
    append(entry, options) {
      assertCreateOptions2(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id",
        "actor_id",
        "entity_type",
        "entity_id",
        "action",
        "changes_json",
        "request_id",
        "created_at",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values2(mapped, columns)
      );
      const current = auditRecord2(database2, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createOutboxRepository(database2) {
  return {
    enqueue(message, options) {
      assertCreateOptions2(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id",
        "channel",
        "recipient_user_id",
        "type",
        "payload_json",
        "status",
        "idempotency_key",
        "attempt_count",
        "max_attempts",
        "available_at",
        "last_error",
        "last_error_code",
        "lease_owner",
        "lease_token",
        "lease_expires_at",
        "failed_at",
        "sent_at",
        "created_at",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values2(mapped, columns)
      );
      const current = outboxRecord(database2, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createSqliteIdentityCommandRepositories(database2) {
  return Object.freeze({
    users: createUsersRepository(database2),
    roles: createRolesRepository(database2),
    sessions: createSessionsRepository2(database2),
    audit: createAuditRepository2(database2),
    outbox: createOutboxRepository(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}

// src/server/sqlite-stock-command-repositories.ts
init_quantity();

// src/server/mappers/catalog.ts
var PRODUCT_UNITS = ["\u0448\u0442", "\u043A\u0433", "\u043B", "\u043C"];
var PRODUCT_STATUSES = ["active", "archived", "deleted"];
var INVENTORY_KINDS = ["piece", "weight"];
var IDENTIFIER_TYPES = ["supplier_article", "barcode", "legacy_article", "other"];
var LOCATION_TYPES = ["warehouse", "house", "counter", "other"];
var LOCATION_STATUSES = ["active", "archived"];
var STOCK_OPERATION_TYPES = ["receipt", "transfer", "write_off", "inventory_adjustment", "correction", "reversal", "merge"];
function mappingFailure(entity, row, field, code, identityFields = ["id"]) {
  throw new RowMappingError(entity, rowIdentity(row, identityFields), field, code);
}
function requiredId(entity, row, field, identityFields) {
  const value = requiredString(entity, row, field, identityFields);
  if (!value.trim()) mappingFailure(entity, row, field, "TYPE", identityFields);
  return value;
}
function nullableId(entity, row, field, identityFields) {
  const value = nullableString(entity, row, field, identityFields);
  if (value !== void 0 && !value.trim()) mappingFailure(entity, row, field, "TYPE", identityFields);
  return value;
}
function positiveNullableInteger(entity, row, field) {
  if (row[field] === null || row[field] === void 0) return void 0;
  const value = integer(entity, row, field);
  if (value <= 0) mappingFailure(entity, row, field, "INTEGER");
  return value;
}
function jsonObject2(entity, row, field, identityFields) {
  const payload = versionedJson(entity, row, field, identityFields);
  if (payload.value === null || Array.isArray(payload.value) || typeof payload.value !== "object") {
    mappingFailure(entity, row, field, "JSON", identityFields);
  }
  return payload;
}
function stringArray(entity, row, field) {
  const payload = versionedJson(entity, row, field);
  if (!Array.isArray(payload.value) || payload.value.some((value) => typeof value !== "string")) {
    mappingFailure(entity, row, field, "JSON");
  }
  return payload.value;
}
function timestampForWrite(entity, id, field, value) {
  return utcTimestamp(entity, { id, [field]: value }, field);
}
function optionalTimestampForWrite(entity, id, field, value) {
  return value === void 0 ? null : timestampForWrite(entity, id, field, value);
}
function idForWrite(entity, id, field, value) {
  return requiredId(entity, { id, [field]: value }, field);
}
function optionalIdForWrite(entity, id, field, value) {
  return value === void 0 ? null : idForWrite(entity, id, field, value);
}
var productMapper = {
  fromRow(row) {
    const entity = "products";
    const unit = enumValue(entity, row, "unit", PRODUCT_UNITS);
    return {
      id: requiredId(entity, row, "id"),
      officialName: requiredString(entity, row, "official_name"),
      localName: requiredString(entity, row, "local_name"),
      unit,
      photoUrl: requiredString(entity, row, "photo_url"),
      category: requiredString(entity, row, "category"),
      tags: stringArray(entity, row, "tags_json"),
      status: enumValue(entity, row, "status", PRODUCT_STATUSES),
      lowStockThreshold: quantity(entity, row, {
        minorField: "low_stock_threshold_minor",
        realField: "low_stock_threshold",
        unit
      }),
      groupId: nullableId(entity, row, "group_id"),
      manufacturerId: nullableId(entity, row, "manufacturer_id"),
      inventoryKind: row.inventory_kind === void 0 ? "piece" : enumValue(entity, row, "inventory_kind", INVENTORY_KINDS),
      packageMassGrams: row.package_mass_grams === null || row.package_mass_grams === void 0 ? void 0 : positiveNullableInteger(entity, row, "package_mass_grams"),
      article: row.article === void 0 ? "" : requiredString(entity, row, "article"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at"),
      archivedAt: nullableUtcTimestamp(entity, row, "archived_at")
    };
  },
  toRow(value) {
    const entity = "products";
    const threshold = quantityColumns(value.lowStockThreshold, value.unit);
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      official_name: value.officialName,
      local_name: value.localName,
      unit: value.unit,
      photo_url: value.photoUrl,
      category: value.category,
      tags_json: serializeVersionedJson({ schemaVersion: 1, value: value.tags }),
      status: value.status,
      low_stock_threshold: threshold.real,
      low_stock_threshold_minor: threshold.minor,
      group_id: optionalIdForWrite(entity, value.id, "group_id", value.groupId),
      manufacturer_id: optionalIdForWrite(entity, value.id, "manufacturer_id", value.manufacturerId),
      inventory_kind: value.inventoryKind ?? "piece",
      package_mass_grams: value.packageMassGrams ?? null,
      article: value.article ?? "",
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision),
      archived_at: optionalTimestampForWrite(entity, value.id, "archived_at", value.archivedAt)
    };
  }
};
var productIdentifierMapper = {
  fromRow(row) {
    const entity = "product_identifiers";
    return {
      id: requiredId(entity, row, "id"),
      productId: requiredId(entity, row, "product_id"),
      supplierId: nullableId(entity, row, "supplier_id"),
      type: enumValue(entity, row, "type", IDENTIFIER_TYPES),
      value: requiredString(entity, row, "value"),
      normalizedValue: requiredString(entity, row, "normalized_value"),
      createdAt: utcTimestamp(entity, row, "created_at")
    };
  },
  toRow(value) {
    const entity = "product_identifiers";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      supplier_id: optionalIdForWrite(entity, value.id, "supplier_id", value.supplierId),
      type: value.type,
      value: value.value,
      normalized_value: value.normalizedValue,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt)
    };
  }
};
var locationMapper = {
  fromRow(row) {
    const entity = "locations";
    return {
      id: requiredId(entity, row, "id"),
      code: requiredString(entity, row, "code"),
      name: requiredString(entity, row, "name"),
      type: enumValue(entity, row, "type", LOCATION_TYPES),
      parentId: nullableId(entity, row, "parent_id"),
      status: enumValue(entity, row, "status", LOCATION_STATUSES),
      capacity: positiveNullableInteger(entity, row, "capacity"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at"),
      archivedAt: nullableUtcTimestamp(entity, row, "archived_at")
    };
  },
  toRow(value) {
    const entity = "locations";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      code: value.code,
      name: value.name,
      type: value.type,
      parent_id: optionalIdForWrite(entity, value.id, "parent_id", value.parentId),
      status: value.status,
      capacity: value.capacity ?? null,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision),
      archived_at: optionalTimestampForWrite(entity, value.id, "archived_at", value.archivedAt)
    };
  }
};
var stockBalanceMapper = {
  fromRow(row, unit) {
    const entity = "stock_balances";
    const identityFields = ["product_id", "location_id"];
    const version2 = integer(entity, row, "version", identityFields);
    if (version2 < 0) mappingFailure(entity, row, "version", "INTEGER", identityFields);
    return {
      productId: requiredId(entity, row, "product_id", identityFields),
      locationId: requiredId(entity, row, "location_id", identityFields),
      quantity: quantity(entity, row, { minorField: "quantity_minor", realField: "quantity", unit }, identityFields),
      version: version2,
      updatedAt: utcTimestamp(entity, row, "updated_at", identityFields),
      revision: String(version2)
    };
  },
  toRow(value, unit) {
    const entity = "stock_balances";
    if (value.revision !== String(value.version)) throw new TypeError("stock_balances revision must equal version");
    if (!Number.isSafeInteger(value.version) || value.version < 0) throw new TypeError("stock_balances version must be a non-negative integer");
    const columns = quantityColumns(value.quantity, unit);
    return {
      product_id: idForWrite(entity, `${value.productId}/${value.locationId}`, "product_id", value.productId),
      location_id: idForWrite(entity, `${value.productId}/${value.locationId}`, "location_id", value.locationId),
      quantity: columns.real,
      quantity_minor: columns.minor,
      version: value.version,
      updated_at: timestampForWrite(entity, `${value.productId}/${value.locationId}`, "updated_at", value.updatedAt)
    };
  }
};
var EMPTY_METADATA = { schemaVersion: 1, value: {} };
var stockOperationMapper = {
  fromRow(row, unit) {
    const entity = "stock_operations";
    return {
      id: requiredId(entity, row, "id"),
      type: enumValue(entity, row, "type", STOCK_OPERATION_TYPES),
      productId: requiredId(entity, row, "product_id"),
      fromLocationId: nullableId(entity, row, "from_location_id"),
      toLocationId: nullableId(entity, row, "to_location_id"),
      quantity: quantity(entity, row, { minorField: "quantity_minor", realField: "quantity", unit, allowZero: false }),
      actorId: requiredId(entity, row, "actor_id"),
      reason: requiredString(entity, row, "reason"),
      idempotencyKey: nullableId(entity, row, "idempotency_key"),
      reversedOperationId: nullableId(entity, row, "reversed_operation_id"),
      metadata: jsonObject2(entity, row, "metadata_json"),
      createdAt: utcTimestamp(entity, row, "created_at")
    };
  },
  toRow(value, unit) {
    const entity = "stock_operations";
    const columns = quantityColumns(value.quantity, unit, false);
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      type: value.type,
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      from_location_id: optionalIdForWrite(entity, value.id, "from_location_id", value.fromLocationId),
      to_location_id: optionalIdForWrite(entity, value.id, "to_location_id", value.toLocationId),
      quantity: columns.real,
      quantity_minor: columns.minor,
      actor_id: idForWrite(entity, value.id, "actor_id", value.actorId),
      reason: value.reason,
      idempotency_key: optionalIdForWrite(entity, value.id, "idempotency_key", value.idempotencyKey),
      reversed_operation_id: optionalIdForWrite(entity, value.id, "reversed_operation_id", value.reversedOperationId),
      metadata_json: serializeVersionedJson(value.metadata ?? EMPTY_METADATA),
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt)
    };
  }
};

// src/server/sqlite-stock-command-repositories.ts
function first3(database2, sql, parameters) {
  return database2.query(sql, parameters)[0];
}
function values3(row, columns) {
  return columns.map((column) => row[column]);
}
function revisionNumber3(revision2) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision2)) return void 0;
  const value = Number(revision2);
  return Number.isSafeInteger(value) ? value : void 0;
}
function assertCreateOptions3(options) {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}
function productRecord(database2, productId) {
  const row = first3(database2, "SELECT * FROM products WHERE id = ?", [productId]);
  if (!row) return void 0;
  const mapped = productMapper.fromRow(row);
  const identifierRows = database2.query(
    "SELECT * FROM product_identifiers WHERE product_id = ? ORDER BY id",
    [productId]
  );
  const identifiers = identifierRows.map((identifierRow) => {
    const { normalizedValue: _normalizedValue, createdAt: _createdAt2, ...identifier2 } = productIdentifierMapper.fromRow(identifierRow);
    return identifier2;
  });
  const { createdAt: _createdAt, archivedAt: _archivedAt, revision: revision2, ...product } = mapped;
  return { entity: { ...product, identifiers }, revision: revision2 };
}
function productUnit(database2, productId) {
  const row = first3(database2, "SELECT * FROM products WHERE id = ?", [productId]);
  return row ? productMapper.fromRow(row).unit : void 0;
}
function locationRecord(database2, locationId) {
  const row = first3(database2, "SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row) return void 0;
  const mapped = locationMapper.fromRow(row);
  const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: revision2, ...location } = mapped;
  return { entity: location, revision: revision2 };
}
function balanceRecord(database2, productId, locationId) {
  const unit = productUnit(database2, productId);
  if (!unit) return void 0;
  const row = first3(database2, "SELECT * FROM stock_balances WHERE product_id = ? AND location_id = ?", [productId, locationId]);
  if (!row) return void 0;
  const mapped = stockBalanceMapper.fromRow(row, unit);
  const { updatedAt: _updatedAt, revision: revision2, ...balance } = mapped;
  return { entity: balance, revision: revision2 };
}
function operationRecord(database2, operationId, idempotencyKey) {
  const row = first3(
    database2,
    idempotencyKey ? "SELECT * FROM stock_operations WHERE id = ? OR idempotency_key = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1" : "SELECT * FROM stock_operations WHERE id = ?",
    idempotencyKey ? [operationId, idempotencyKey, operationId] : [operationId]
  );
  if (!row) return void 0;
  const productId = typeof row.product_id === "string" ? row.product_id : "";
  const unit = productUnit(database2, productId);
  if (!unit) return void 0;
  const operation = stockOperationMapper.fromRow(row, unit);
  return { entity: operation, revision: operation.createdAt };
}
function notificationRecord(database2, notificationId) {
  const row = first3(database2, "SELECT * FROM webapp_notifications WHERE id = ?", [notificationId]);
  if (!row) return void 0;
  const mapped = webappNotificationFromRow(row);
  return { entity: mapped.entity.notification, revision: mapped.revision };
}
function outboxRecord2(database2, messageId, channel2, idempotencyKey) {
  const row = first3(
    database2,
    channel2 && idempotencyKey ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1" : "SELECT * FROM outbox_messages WHERE id = ?",
    channel2 && idempotencyKey ? [messageId, channel2, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return void 0;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}
function auditRecord3(database2, entryId) {
  const row = first3(database2, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return void 0;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}
function createRolesRepository2(database2) {
  return {
    getAuthorization(userId) {
      const rawUser = first3(database2, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };
      const roles3 = database2.query("SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id", [userId]).map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(roles3)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };
      const role = distinctRoles[0];
      const permissions2 = database2.query("SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id", [role]).map((row) => rolePermissionMapper.fromRow(row).permission);
      return {
        outcome: "found",
        snapshot: { userId, role, permissions: permissions2, revision: user.revision }
      };
    }
  };
}
function createProductsRepository(database2) {
  return {
    findById: (productId) => productRecord(database2, productId),
    findByIdentifier(input) {
      const row = first3(
        database2,
        "SELECT product_id FROM product_identifiers WHERE type = ? AND normalized_value = ? AND (supplier_id IS ? OR supplier_id = ?) ORDER BY id LIMIT 1",
        [input.type, input.value.trim().toLocaleLowerCase("ru-RU"), input.supplierId ?? null, input.supplierId ?? null]
      );
      return typeof row?.product_id === "string" ? productRecord(database2, row.product_id) : void 0;
    },
    list() {
      throw new Error("Product command repository does not expose list queries");
    },
    listAliases() {
      throw new Error("Product command repository does not expose alias queries");
    },
    create(product, options) {
      assertCreateOptions3(options);
      const persisted = productMapper.toRow({ ...product, createdAt: options.at, revision: options.at });
      const columns = ["id", "official_name", "local_name", "unit", "photo_url", "category", "tags_json", "status", "low_stock_threshold", "low_stock_threshold_minor", "group_id", "manufacturer_id", "inventory_kind", "package_mass_grams", "article", "created_at", "updated_at", "archived_at"];
      const result = database2.execute(
        `INSERT INTO products(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) DO NOTHING`,
        values3(persisted, columns)
      );
      if (result.changes === 1) {
        database2.execute("INSERT INTO inventory_balances(product_id, quantity_minor, version, updated_at) VALUES (?, 0, 0, ?)", [product.id, options.at]);
        for (const identifier2 of product.identifiers) {
          const row = productIdentifierMapper.toRow({
            ...identifier2,
            normalizedValue: identifier2.value.trim().toLocaleLowerCase("ru-RU"),
            createdAt: options.at
          });
          const identifierColumns = ["id", "product_id", "supplier_id", "type", "value", "normalized_value", "created_at"];
          database2.execute(
            `INSERT INTO product_identifiers(${identifierColumns.join(", ")}) VALUES (${identifierColumns.map(() => "?").join(", ")})`,
            values3(row, identifierColumns)
          );
        }
      }
      const current = productRecord(database2, product.id);
      if (!current) throw new Error("product insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },
    save(product, options) {
      const result = database2.execute(
        "UPDATE products SET local_name = ?, category = ?, status = ?, group_id = ?, manufacturer_id = ?, inventory_kind = ?, package_mass_grams = ?, article = ?, archived_at = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
        [product.localName, product.category, product.status, product.groupId ?? null, product.manufacturerId ?? null, product.inventoryKind ?? "piece", product.packageMassGrams ?? null, product.article ?? "", product.status === "archived" ? options.at : null, options.at, product.id, options.expectedRevision]
      );
      const current = productRecord(database2, product.id);
      if (result.changes === 1) {
        if (!current) throw new Error("product update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    saveAlias() {
      throw new Error("Product command repository does not expose aliases yet");
    }
  };
}
function createLocationsRepository(database2) {
  return {
    findById: (locationId) => locationRecord(database2, locationId),
    findByCode(code) {
      const row = first3(database2, "SELECT id FROM locations WHERE code = ? COLLATE NOCASE", [code]);
      return typeof row?.id === "string" ? locationRecord(database2, row.id) : void 0;
    },
    list() {
      throw new Error("Location command repository does not expose list queries");
    },
    save(location, options) {
      if (options.expectedRevision === null) {
        const result2 = database2.execute("INSERT INTO locations(id,code,name,type,parent_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [location.id, location.code, location.name, location.type, location.parentId ?? null, location.status, options.at, options.at]);
        const current2 = locationRecord(database2, location.id);
        if (!current2) throw new Error("location insert did not create or find row");
        return result2.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
      }
      const result = database2.execute("UPDATE locations SET code=?,name=?,type=?,parent_id=?,status=?,archived_at=?,updated_at=? WHERE id=? AND updated_at=?", [location.code, location.name, location.type, location.parentId ?? null, location.status, location.status === "archived" ? options.at : null, options.at, location.id, options.expectedRevision]);
      const current = locationRecord(database2, location.id);
      if (result.changes === 1) return current ? { outcome: "updated", record: current } : { outcome: "missing" };
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    }
  };
}
function createStockRepository(database2) {
  const repository = {
    findBalance: (productId, locationId) => balanceRecord(database2, productId, locationId),
    findOperation: (operationId) => operationRecord(database2, operationId),
    findReversalFor(operationId) {
      const row = first3(database2, "SELECT id FROM stock_operations WHERE reversed_operation_id = ? LIMIT 1", [operationId]);
      return typeof row?.id === "string" ? operationRecord(database2, row.id) : void 0;
    },
    sumBalance(productId) {
      const row = first3(
        database2,
        "SELECT quantity_minor AS total_minor FROM inventory_balances WHERE product_id = ?",
        [productId]
      );
      return quantityFromMinor(row?.total_minor ?? 0);
    },
    saveBalance(balance, options) {
      const unit = productUnit(database2, balance.productId);
      if (!unit) throw new Error("Cannot save a stock balance for a missing product");
      const persisted = stockBalanceMapper.toRow({
        ...balance,
        updatedAt: options.at,
        revision: String(balance.version)
      }, unit);
      const columns = ["product_id", "location_id", "quantity", "quantity_minor", "version", "updated_at"];
      if (options.expectedRevision === null) {
        if (balance.version !== 1) throw new TypeError("A new stock balance must start at version 1");
        const result2 = database2.execute(
          `INSERT INTO stock_balances(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values3(persisted, columns)
        );
        const current2 = balanceRecord(database2, balance.productId, balance.locationId);
        if (!current2) throw new Error("stock balance insert did not create or find a row");
        return result2.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
      }
      const expected = revisionNumber3(options.expectedRevision);
      if (expected === void 0) {
        const current2 = balanceRecord(database2, balance.productId, balance.locationId);
        return current2 ? { outcome: "stale", current: current2 } : { outcome: "missing" };
      }
      if (!Number.isSafeInteger(expected + 1) || balance.version !== expected + 1) {
        throw new TypeError("A stock balance update must increment version by exactly one");
      }
      const result = database2.execute(
        "UPDATE stock_balances SET quantity = ?, quantity_minor = ?, version = ?, updated_at = ? WHERE product_id = ? AND location_id = ? AND version = ?",
        [persisted.quantity, persisted.quantity_minor, persisted.version, persisted.updated_at, balance.productId, balance.locationId, expected]
      );
      const current = balanceRecord(database2, balance.productId, balance.locationId);
      if (result.changes === 1) {
        if (!current) throw new Error("stock balance update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    appendOperation(operation, options) {
      assertCreateOptions3(options);
      const unit = productUnit(database2, operation.productId);
      if (!unit) throw new Error("Cannot append a stock operation for a missing product");
      const persisted = stockOperationMapper.toRow(operation, unit);
      const columns = [
        "id",
        "type",
        "product_id",
        "from_location_id",
        "to_location_id",
        "quantity",
        "quantity_minor",
        "actor_id",
        "reason",
        "idempotency_key",
        "reversed_operation_id",
        "metadata_json",
        "created_at"
      ];
      const result = database2.execute(
        `INSERT INTO stock_operations(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values3(persisted, columns)
      );
      const current = operationRecord(database2, operation.id, operation.idempotencyKey);
      if (!current) throw new Error("stock operation insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
  return repository;
}
function createNotificationsRepository(database2) {
  return {
    findById: (notificationId) => notificationRecord(database2, notificationId),
    listForUser() {
      throw new Error("Notification command repository does not expose notification queries");
    },
    append(notification, options) {
      assertCreateOptions3(options);
      const mapped = webappNotificationToRow({
        entity: { notification, updatedAt: options.at },
        revision: "0"
      });
      const columns = ["id", "recipient_user_id", "type", "payload_json", "is_read", "created_at", "read_at", "version", "updated_at"];
      const result = database2.execute(
        `INSERT INTO webapp_notifications(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values3(mapped, columns)
      );
      const current = notificationRecord(database2, notification.id);
      if (!current) throw new Error("notification insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },
    markRead() {
      throw new Error("Notification command repository does not expose markRead yet");
    },
    listPreferences(userId) {
      const items = database2.query(
        "SELECT * FROM notification_preferences WHERE user_id = ? ORDER BY channel, event_type",
        [userId]
      ).map((row) => {
        const mapped = notificationPreferenceFromRow(row);
        return { entity: mapped.entity.preference, revision: mapped.revision };
      });
      return { items };
    },
    savePreference(preference, options) {
      const currentRow = first3(
        database2,
        "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
        [preference.userId, preference.channel, preference.eventType]
      );
      const current = currentRow ? (() => {
        const mapped = notificationPreferenceFromRow(currentRow);
        return { entity: mapped.entity.preference, revision: mapped.revision };
      })() : void 0;
      if (options.expectedRevision === null) {
        const result2 = database2.execute(
          "INSERT INTO notification_preferences(user_id, channel, event_type, delivery_mode, version, updated_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT DO NOTHING",
          [preference.userId, preference.channel, preference.eventType, preference.deliveryMode, options.at]
        );
        const createdRow = first3(
          database2,
          "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
          [preference.userId, preference.channel, preference.eventType]
        );
        if (!createdRow) throw new Error("preference insert did not create or find a row");
        const mapped = notificationPreferenceFromRow(createdRow);
        const record2 = { entity: mapped.entity.preference, revision: mapped.revision };
        return result2.changes === 1 ? { outcome: "created", record: record2 } : { outcome: "duplicate", current: record2 };
      }
      if (!current) return { outcome: "missing" };
      const result = database2.execute(
        "UPDATE notification_preferences SET delivery_mode = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND channel = ? AND event_type = ? AND CAST(version AS TEXT) = ?",
        [preference.deliveryMode, options.at, preference.userId, preference.channel, preference.eventType, options.expectedRevision]
      );
      const updatedRow = first3(
        database2,
        "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
        [preference.userId, preference.channel, preference.eventType]
      );
      if (result.changes === 1 && updatedRow) {
        const mapped = notificationPreferenceFromRow(updatedRow);
        return { outcome: "updated", record: { entity: mapped.entity.preference, revision: mapped.revision } };
      }
      return updatedRow ? { outcome: "stale", current: (() => {
        const mapped = notificationPreferenceFromRow(updatedRow);
        return { entity: mapped.entity.preference, revision: mapped.revision };
      })() } : { outcome: "missing" };
    }
  };
}
function createOutboxRepository2(database2) {
  return {
    enqueue(message, options) {
      assertCreateOptions3(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id",
        "channel",
        "recipient_user_id",
        "type",
        "payload_json",
        "status",
        "idempotency_key",
        "attempt_count",
        "max_attempts",
        "available_at",
        "last_error",
        "last_error_code",
        "lease_owner",
        "lease_token",
        "lease_expires_at",
        "failed_at",
        "sent_at",
        "created_at",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values3(mapped, columns)
      );
      const current = outboxRecord2(database2, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createAuditRepository3(database2) {
  return {
    append(entry, options) {
      assertCreateOptions3(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "actor_id", "entity_type", "entity_id", "action", "changes_json", "request_id", "created_at", "version", "updated_at"];
      const result = database2.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values3(mapped, columns)
      );
      const current = auditRecord3(database2, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createStockEventRecipients(database2) {
  return {
    resolveInstant(eventType) {
      return database2.query(
        `SELECT u.id AS user_id, channels.channel
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id IN ('admin','super_admin')
         CROSS JOIN (SELECT 'webapp' AS channel UNION ALL SELECT 'telegram') channels
         LEFT JOIN notification_preferences np
           ON np.user_id = u.id AND np.channel = channels.channel AND np.event_type = ?
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles exact_role WHERE exact_role.user_id = u.id) = 1
           AND COALESCE(np.delivery_mode, 'instant') = 'instant'
         ORDER BY u.id, channels.channel`,
        [eventType]
      ).map((row) => ({ userId: row.user_id, channel: row.channel }));
    }
  };
}
function createSqliteStockCommandRepositories(database2) {
  return Object.freeze({
    roles: createRolesRepository2(database2),
    products: createProductsRepository(database2),
    locations: createLocationsRepository(database2),
    stock: createStockRepository(database2),
    notifications: createNotificationsRepository(database2),
    outbox: createOutboxRepository2(database2),
    audit: createAuditRepository3(database2),
    idempotency: createSqliteIdempotencyRepository(database2),
    stockEventRecipients: createStockEventRecipients(database2),
    inventoryGuard: { isOpen: () => Boolean(first3(database2, "SELECT id FROM inventory_sessions WHERE status IN ('active','closing') LIMIT 1", [])) }
  });
}
function createSqliteCatalogCommandRepositories(database2) {
  return Object.freeze({
    roles: createRolesRepository2(database2),
    products: createProductsRepository(database2),
    locations: createLocationsRepository(database2),
    catalog: createCatalogReferenceRepository(database2),
    audit: createAuditRepository3(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}
function createCatalogReferenceRepository(database2) {
  const group = (id) => {
    const row = first3(database2, "SELECT * FROM product_groups WHERE id = ?", [id]);
    return row ? { id: String(row.id), name: String(row.name), inventoryKind: row.inventory_kind, status: row.status, version: Number(row.version) } : void 0;
  };
  const manufacturer = (id) => {
    const row = first3(database2, "SELECT * FROM manufacturers WHERE id = ?", [id]);
    return row ? { id: String(row.id), name: String(row.name), status: row.status, version: Number(row.version) } : void 0;
  };
  return {
    findGroup: group,
    saveGroup(value, expectedVersion, at) {
      if (expectedVersion === null) {
        const result2 = database2.execute("INSERT INTO product_groups(id,name,inventory_kind,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.name, value.inventoryKind, value.status, at, at]);
        return result2.changes === 1 ? "created" : "duplicate";
      }
      const result = database2.execute("UPDATE product_groups SET name=?, inventory_kind=?, status=?, version=version+1, updated_at=? WHERE id=? AND version=?", [value.name, value.inventoryKind, value.status, at, value.id, expectedVersion]);
      return result.changes === 1 ? "updated" : group(value.id) ? "stale" : "duplicate";
    },
    findManufacturer: manufacturer,
    saveManufacturer(value, expectedVersion, at) {
      if (expectedVersion === null) {
        const result2 = database2.execute("INSERT INTO manufacturers(id,name,status,created_at,updated_at,version) VALUES (?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.name, value.status, at, at]);
        return result2.changes === 1 ? "created" : "duplicate";
      }
      const result = database2.execute("UPDATE manufacturers SET name=?, status=?, version=version+1, updated_at=? WHERE id=? AND version=?", [value.name, value.status, at, value.id, expectedVersion]);
      return result.changes === 1 ? "updated" : manufacturer(value.id) ? "stale" : "duplicate";
    },
    appendPackaging(value, at) {
      const result = database2.execute("INSERT INTO product_packagings(id,product_id,name,units_per_package,mass_grams,is_primary,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.productId, value.name, value.unitsPerPackage, value.massGrams ?? null, value.isPrimary ? 1 : 0, at, at]);
      return result.changes === 1 ? "created" : "duplicate";
    },
    appendPrice(value) {
      const result = database2.execute("INSERT INTO product_price_history(id,group_id,product_id,price_kopecks,price_unit,effective_from,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [value.id, value.groupId ?? null, value.productId ?? null, value.priceKopecks, value.priceUnit, value.effectiveFrom, value.createdByUserId ?? null, value.createdAt]);
      return result.changes === 1 ? "created" : "duplicate";
    }
  };
}
function createSqliteNotificationPreferenceCommandRepositories(database2) {
  return Object.freeze({
    roles: createRolesRepository2(database2),
    notifications: createNotificationsRepository(database2),
    audit: createAuditRepository3(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}

// src/server/catalog-service.ts
init_quantity();
import { nanoid as nanoid4 } from "nanoid";
var defaultPhoto = "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80";
function response2(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function authorized(context) {
  if (context.actor.kind !== "user") return void 0;
  const authorization2 = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return authorization2.outcome === "found" && authorization2.snapshot.permissions.includes("products:write") ? authorization2.snapshot : void 0;
}
function writeCreated(result, entity) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}
function jsonObject3(value) {
  return JSON.parse(JSON.stringify(value));
}
var CatalogService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid4());
  }
  executor;
  options;
  createId;
  create(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const actor3 = authorized(context);
      if (!actor3) return { outcome: "rejected", ...response2(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      const request = {
        officialName: input.officialName,
        localName: input.localName ?? "",
        unit: input.unit,
        photoUrl: input.photoUrl ?? defaultPhoto,
        category: input.category ?? "\u0411\u0435\u0437 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438",
        lowStockThreshold: input.lowStockThreshold ?? 5,
        identifiers: (input.identifiers ?? []).map((item) => ({
          type: item.type,
          value: item.value,
          supplierId: item.supplierId ?? null
        })),
        groupId: input.groupId ?? null,
        manufacturerId: input.manufacturerId ?? null,
        inventoryKind: input.inventoryKind ?? "piece",
        packageMassGrams: input.packageMassGrams ?? null,
        article: input.article ?? ""
      };
      return executeIdempotently(context, "catalog.product.create", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.applyCreate(context, actor3.userId, input));
    }, { transactionMode: "immediate" });
  }
  update(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const actor3 = authorized(context);
      if (!actor3) return { outcome: "rejected", ...response2(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      const request = {
        productId: input.productId,
        status: input.status ?? null,
        localName: input.localName ?? null,
        category: input.category ?? null,
        groupId: input.groupId ?? null,
        manufacturerId: input.manufacturerId ?? null,
        packageMassGrams: input.packageMassGrams ?? null,
        article: input.article ?? null
      };
      return executeIdempotently(context, "catalog.product.update", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.applyUpdate(context, actor3.userId, input));
    }, { transactionMode: "immediate" });
  }
  applyCreate(context, actorId, input) {
    if (!input.officialName.trim()) return response2(400, "VALIDATION_ERROR", "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
    if (!["\u0448\u0442", "\u043A\u0433", "\u043B", "\u043C"].includes(input.unit)) return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F");
    let lowStockThreshold;
    try {
      lowStockThreshold = requireQuantity(input.lowStockThreshold ?? 5, { unit: input.unit });
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response2(400, "VALIDATION_ERROR", "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0438\u043C\u0435\u0435\u0442 \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0443\u044E \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C");
    }
    for (const identifier2 of input.identifiers ?? []) {
      if (!identifier2.value.trim()) return response2(400, "VALIDATION_ERROR", "\u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C");
      const duplicate = context.transaction.repositories.products.findByIdentifier({
        type: identifier2.type,
        value: identifier2.value,
        ...identifier2.supplierId ? { supplierId: identifier2.supplierId } : {}
      });
      if (duplicate) return response2(409, "IDENTIFIER_CONFLICT", "\u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u0443\u0436\u0435 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0438\u0442 \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u0442\u043E\u0432\u0430\u0440\u0443", { productId: duplicate.entity.id });
    }
    const productId = this.createId("product");
    const inventoryKind = input.inventoryKind ?? "piece";
    if (inventoryKind === "piece" && input.unit !== "\u0448\u0442") return response2(400, "PIECE_UNIT_REQUIRED", "\u0428\u0442\u0443\u0447\u043D\u044B\u0439 \u0442\u043E\u0432\u0430\u0440 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0446\u0435\u043B\u044B\u043C\u0438 \u0448\u0442\u0443\u043A\u0430\u043C\u0438");
    if (inventoryKind === "weight" && (!Number.isInteger(input.packageMassGrams) || Number(input.packageMassGrams) <= 0)) {
      return response2(400, "PACKAGE_MASS_REQUIRED", "\u0414\u043B\u044F \u0432\u0435\u0441\u043E\u0432\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0441\u0441\u0430 \u043F\u0430\u0447\u043A\u0438 \u0432 \u0433\u0440\u0430\u043C\u043C\u0430\u0445");
    }
    const group = input.groupId ? context.transaction.repositories.catalog.findGroup(input.groupId) : void 0;
    if (input.groupId && (!group || group.status !== "active")) return response2(404, "GROUP_NOT_FOUND", "\u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    if (group && group.inventoryKind !== inventoryKind) return response2(409, "GROUP_KIND_CONFLICT", "\u0422\u0438\u043F \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0442\u0438\u043F\u043E\u043C \u0433\u0440\u0443\u043F\u043F\u044B");
    const manufacturer = input.manufacturerId ? context.transaction.repositories.catalog.findManufacturer(input.manufacturerId) : void 0;
    if (input.manufacturerId && (!manufacturer || manufacturer.status !== "active")) return response2(404, "MANUFACTURER_NOT_FOUND", "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const product = {
      id: productId,
      officialName: input.officialName.trim(),
      localName: input.localName?.trim() ?? "",
      unit: input.unit,
      photoUrl: input.photoUrl?.trim() || defaultPhoto,
      category: input.category?.trim() || "\u0411\u0435\u0437 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438",
      tags: [],
      status: "active",
      identifiers: (input.identifiers ?? []).map((identifier2) => ({
        id: this.createId("identifier"),
        productId,
        type: identifier2.type,
        value: identifier2.value.trim(),
        ...identifier2.supplierId ? { supplierId: identifier2.supplierId } : {}
      })),
      lowStockThreshold,
      groupId: input.groupId,
      manufacturerId: input.manufacturerId,
      inventoryKind,
      packageMassGrams: input.packageMassGrams,
      article: input.article?.trim() ?? ""
    };
    const at = context.clock.now();
    writeCreated(context.transaction.repositories.products.create(product, { at, expectedRevision: null }), "product");
    writeCreated(context.transaction.repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "product",
      entityId: product.id,
      action: "create",
      changes: { schemaVersion: 1, value: jsonObject3(product) },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "audit");
    return { status: 201, body: jsonObject3(product) };
  }
  applyUpdate(context, actorId, input) {
    const current = context.transaction.repositories.products.findById(input.productId);
    if (!current) return response2(404, "NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    if (input.status !== void 0 && !["active", "archived", "deleted"].includes(input.status)) {
      return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0442\u043E\u0432\u0430\u0440\u0430");
    }
    const next = {
      ...current.entity,
      status: input.status ?? current.entity.status,
      localName: input.localName === void 0 ? current.entity.localName : input.localName.trim(),
      category: input.category === void 0 ? current.entity.category : input.category.trim(),
      groupId: input.groupId === void 0 ? current.entity.groupId : input.groupId || void 0,
      manufacturerId: input.manufacturerId === void 0 ? current.entity.manufacturerId : input.manufacturerId || void 0,
      packageMassGrams: input.packageMassGrams === void 0 ? current.entity.packageMassGrams : input.packageMassGrams,
      article: input.article === void 0 ? current.entity.article : input.article.trim()
    };
    if (next.inventoryKind === "weight" && (!Number.isInteger(next.packageMassGrams) || Number(next.packageMassGrams) <= 0)) {
      return response2(400, "PACKAGE_MASS_REQUIRED", "\u0414\u043B\u044F \u0432\u0435\u0441\u043E\u0432\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0441\u0441\u0430 \u043F\u0430\u0447\u043A\u0438 \u0432 \u0433\u0440\u0430\u043C\u043C\u0430\u0445");
    }
    const group = next.groupId ? context.transaction.repositories.catalog.findGroup(next.groupId) : void 0;
    if (next.groupId && (!group || group.status !== "active")) return response2(404, "GROUP_NOT_FOUND", "\u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    if (group && group.inventoryKind !== (next.inventoryKind ?? "piece")) return response2(409, "GROUP_KIND_CONFLICT", "\u0422\u0438\u043F \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0442\u0438\u043F\u043E\u043C \u0433\u0440\u0443\u043F\u043F\u044B");
    if (next.manufacturerId && !context.transaction.repositories.catalog.findManufacturer(next.manufacturerId)) return response2(404, "MANUFACTURER_NOT_FOUND", "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const at = context.clock.now();
    const saved = context.transaction.repositories.products.save(next, { at, expectedRevision: current.revision });
    if (saved.outcome === "missing") return response2(404, "NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    if (saved.outcome === "stale") return response2(409, "VERSION_CONFLICT", "\u0422\u043E\u0432\u0430\u0440 \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D");
    writeCreated(context.transaction.repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "product",
      entityId: next.id,
      action: "update",
      changes: { schemaVersion: 1, value: { status: next.status, localName: next.localName, category: next.category } },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "audit");
    return { status: 200, body: jsonObject3(next) };
  }
  createGroup(metadata, input) {
    return this.referenceCommand(metadata, "catalog.group.create", input, (context, actorId) => {
      if (!input.name.trim() || input.inventoryKind !== "piece" && input.inventoryKind !== "weight") return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430 \u0442\u043E\u0432\u0430\u0440\u0430");
      const at = context.clock.now();
      const group = { id: this.createId("product"), name: input.name.trim(), inventoryKind: input.inventoryKind, status: "active", version: 0 };
      if (context.transaction.repositories.catalog.saveGroup(group, null, at) !== "created") return response2(409, "GROUP_CONFLICT", "\u0413\u0440\u0443\u043F\u043F\u0430 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
      this.appendAudit(context, actorId, "product_group", group.id, "create", group, at);
      return { status: 201, body: group };
    });
  }
  createManufacturer(metadata, input) {
    return this.referenceCommand(metadata, "catalog.manufacturer.create", input, (context, actorId) => {
      if (!input.name.trim()) return response2(400, "VALIDATION_ERROR", "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
      const at = context.clock.now();
      const manufacturer = { id: this.createId("product"), name: input.name.trim(), status: "active", version: 0 };
      if (context.transaction.repositories.catalog.saveManufacturer(manufacturer, null, at) !== "created") return response2(409, "MANUFACTURER_CONFLICT", "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
      this.appendAudit(context, actorId, "manufacturer", manufacturer.id, "create", manufacturer, at);
      return { status: 201, body: manufacturer };
    });
  }
  addPackaging(metadata, input) {
    return this.referenceCommand(metadata, "catalog.packaging.create", jsonObject3(input), (context, actorId) => {
      const product = context.transaction.repositories.products.findById(input.productId);
      if (!product) return response2(404, "NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      if (!input.name.trim() || !Number.isInteger(input.unitsPerPackage) || input.unitsPerPackage <= 0 || input.massGrams !== void 0 && (!Number.isInteger(input.massGrams) || input.massGrams <= 0)) return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430");
      const at = context.clock.now();
      const packaging = { id: this.createId("product"), productId: input.productId, name: input.name.trim(), unitsPerPackage: input.unitsPerPackage, massGrams: input.massGrams, isPrimary: Boolean(input.isPrimary), version: 0 };
      if (context.transaction.repositories.catalog.appendPackaging(packaging, at) !== "created") return response2(409, "PACKAGING_CONFLICT", "\u0423\u043F\u0430\u043A\u043E\u0432\u043A\u0430 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442");
      this.appendAudit(context, actorId, "product_packaging", packaging.id, "create", jsonObject3(packaging), at);
      return { status: 201, body: jsonObject3(packaging) };
    });
  }
  addPrice(metadata, input) {
    return this.referenceCommand(metadata, "catalog.price.create", jsonObject3(input), (context, actorId) => {
      if (Boolean(input.groupId) === Boolean(input.productId) || !Number.isSafeInteger(input.priceKopecks) || input.priceKopecks < 0 || !/^\d{4}-\d{2}-\d{2}T/.test(input.effectiveFrom)) return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0446\u0435\u043D\u044B");
      if (input.groupId && !context.transaction.repositories.catalog.findGroup(input.groupId)) return response2(404, "GROUP_NOT_FOUND", "\u0413\u0440\u0443\u043F\u043F\u0430 \u0442\u043E\u0432\u0430\u0440\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      if (input.productId && !context.transaction.repositories.products.findById(input.productId)) return response2(404, "NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      const at = context.clock.now();
      const price = { id: this.createId("product"), groupId: input.groupId, productId: input.productId, priceKopecks: input.priceKopecks, priceUnit: input.priceUnit, effectiveFrom: input.effectiveFrom, createdByUserId: actorId, createdAt: at };
      if (context.transaction.repositories.catalog.appendPrice(price) !== "created") throw new Error("price insert collided inside idempotent transaction");
      this.appendAudit(context, actorId, "product_price", price.id, "create", jsonObject3(price), at);
      return { status: 201, body: jsonObject3(price) };
    });
  }
  saveLocation(metadata, input) {
    return this.referenceCommand(metadata, "catalog.location.save", jsonObject3(input), (context, actorId) => {
      if (!input.code.trim() || !input.name.trim() || !["warehouse", "house", "counter", "other"].includes(input.type)) return response2(400, "VALIDATION_ERROR", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u043B\u043A\u0430");
      const current = input.id ? context.transaction.repositories.locations.findById(input.id) : void 0;
      if (input.id && !current) return response2(404, "NOT_FOUND", "\u041F\u043E\u043B\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      const duplicate = context.transaction.repositories.locations.findByCode(input.code.trim());
      if (duplicate && duplicate.entity.id !== input.id) return response2(409, "LOCATION_CODE_CONFLICT", "\u041A\u043E\u0434 \u043F\u043E\u043B\u043A\u0438 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F");
      if (input.parentId && !context.transaction.repositories.locations.findById(input.parentId)) return response2(404, "PARENT_LOCATION_NOT_FOUND", "\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      const location = { id: input.id ?? this.createId("product"), code: input.code.trim(), name: input.name.trim(), type: input.type, parentId: input.parentId, status: input.status ?? current?.entity.status ?? "active" };
      const at = context.clock.now();
      const saved = context.transaction.repositories.locations.save(location, current ? { at, expectedRevision: current.revision } : { at, expectedRevision: null });
      if (saved.outcome === "duplicate" || saved.outcome === "stale") return response2(409, "VERSION_CONFLICT", "\u041F\u043E\u043B\u043A\u0430 \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430");
      if (saved.outcome === "missing") return response2(404, "NOT_FOUND", "\u041F\u043E\u043B\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      this.appendAudit(context, actorId, "location", location.id, current ? "update" : "create", jsonObject3(location), at);
      return { status: current ? 200 : 201, body: jsonObject3(location) };
    });
  }
  referenceCommand(metadata, scope, request, run) {
    return this.executor.execute(metadata, (context) => {
      const actor3 = authorized(context);
      if (!actor3) return { outcome: "rejected", ...response2(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, actor3.userId));
    }, { transactionMode: "immediate" });
  }
  appendAudit(context, actorId, entity, entityId, action, changes, at) {
    writeCreated(context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null }), "audit");
  }
};

// src/server/notification-preference-service.ts
import { nanoid as nanoid5 } from "nanoid";

// src/server/repositories.ts
function createPageLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Page limit must be an integer from 1 to 100");
  return limit;
}
function createPageRequest(limit, order, cursor) {
  return { limit: createPageLimit(limit), order, ...cursor ? { cursor } : {} };
}

// src/server/notification-preference-service.ts
var NotificationPreferenceService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
  }
  executor;
  options;
  list(userId) {
    return this.executor.execute({
      actorReference: { kind: "user", userId, authenticatedBy: "web_session" },
      requestId: `notification-preferences:${userId}`,
      channel: "web",
      idempotencyKey: `notification-preferences:${userId}`
    }, (context) => context.transaction.repositories.notifications.listPreferences(userId, createPageRequest(100, "name_asc_id_asc")).items.map((item) => item.entity));
  }
  save(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      const authorization2 = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization2.outcome !== "found") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      const request = { channel: String(input.channel ?? ""), eventType: input.eventType, deliveryMode: String(input.deliveryMode ?? "") };
      return executeIdempotently(context, "notification.preference.save", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, authorization2.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }
  apply(context, userId, input) {
    if (input.channel !== "telegram" && input.channel !== "webapp" || input.deliveryMode !== "off" && input.deliveryMode !== "instant" && input.deliveryMode !== "daily" || !input.eventType.trim()) {
      return { status: 400, body: { code: "BAD_NOTIFICATION_PREFERENCE", message: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439" } };
    }
    if (input.deliveryMode === "daily") {
      return { status: 404, body: { code: "FEATURE_DISABLED", message: "Daily digest \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D \u0434\u043E post-launch" } };
    }
    const preference = {
      userId,
      channel: input.channel,
      eventType: input.eventType.trim(),
      deliveryMode: input.deliveryMode
    };
    const repository = context.transaction.repositories.notifications;
    const current = repository.listPreferences(userId, createPageRequest(100, "name_asc_id_asc")).items.find((item) => item.entity.channel === preference.channel && item.entity.eventType === preference.eventType);
    const at = context.clock.now();
    const saved = repository.savePreference(preference, current ? { at, expectedRevision: current.revision } : { at, expectedRevision: null });
    if (saved.outcome === "stale") return { status: 409, body: { code: "VERSION_CONFLICT", message: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430" } };
    if (saved.outcome === "missing") throw new Error("notification preference disappeared inside transaction");
    const audit3 = context.transaction.repositories.audit.append({
      id: this.options.createId?.() ?? nanoid5(),
      actorId: userId,
      entity: "notification_preference",
      entityId: `${preference.channel}:${preference.eventType}`,
      action: "upsert",
      changes: { schemaVersion: 1, value: { channel: preference.channel, eventType: preference.eventType, deliveryMode: preference.deliveryMode } },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null });
    if (audit3.outcome !== "created") throw new Error("audit insert collided inside idempotent transaction");
    return { status: 200, body: preference };
  }
};

// src/server/artifact-command-service.ts
import { nanoid as nanoid6 } from "nanoid";
var ArtifactCommandService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
  }
  executor;
  options;
  createLabel(metadata, job) {
    return this.execute(metadata, "labels:print", "label.create", job, (context, actorId) => {
      const at = context.clock.now();
      if (context.transaction.repositories.labels.create(job, at) !== "created") throw new Error("label insert collided inside idempotent transaction");
      this.audit(context, actorId, "label_job", job.id, "create", {
        labels: job.labels.reduce((total, label) => total + label.quantity, 0),
        templateId: job.templateId,
        geometry: job.geometry
      }, at);
      return { status: 201, body: JSON.parse(JSON.stringify(job)) };
    });
  }
  recordLabelReprint(metadata, jobId) {
    return this.execute(metadata, "labels:print", "label.reprint", { jobId }, (context, actorId) => {
      const job = context.transaction.repositories.labels.findById(jobId);
      if (!job) return { status: 404, body: { code: "NOT_FOUND", message: "\u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043F\u0435\u0447\u0430\u0442\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" } };
      const at = context.clock.now();
      this.audit(context, actorId, "label_job", jobId, "reprint", {
        labels: job.entity.labels.reduce((total, label) => total + label.quantity, 0)
      }, at);
      return { status: 200, body: JSON.parse(JSON.stringify(job.entity)) };
    });
  }
  recordExternal(metadata, permission, input) {
    return this.execute(metadata, permission, input.scope, input, (context, actorId) => {
      const at = context.clock.now();
      this.audit(context, actorId, input.entity, input.entityId, input.action, input.changes, at);
      return { status: 200, body: { recorded: true } };
    });
  }
  execute(metadata, permission, scope, request, run) {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      const authorization2 = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization2.outcome !== "found" || !authorization2.snapshot.permissions.includes(permission)) {
        return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      }
      return executeIdempotently(context, scope, request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => run(context, authorization2.snapshot.userId));
    }, { transactionMode: "immediate" });
  }
  audit(context, actorId, entity, entityId, action, changes, at) {
    const result = context.transaction.repositories.audit.append({
      id: this.options.createId?.() ?? nanoid6(),
      actorId,
      entity,
      entityId,
      action,
      changes: { schemaVersion: 1, value: changes },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("audit insert collided inside idempotent transaction");
  }
};

// src/server/sqlite-artifact-command-repositories.ts
function record(database2, id) {
  const row = database2.query("SELECT * FROM label_jobs WHERE id = ?", [id])[0];
  if (!row) return void 0;
  const mapped = labelJobFromRow(row);
  const entity = {
    id: mapped.entity.id,
    actorId: mapped.entity.actorId ?? "system",
    templateId: mapped.entity.templateId,
    geometry: mapped.entity.geometry.value,
    labels: mapped.entity.labels.value,
    createdAt: mapped.entity.createdAt
  };
  return { entity, revision: mapped.revision };
}
function createSqliteArtifactCommandRepositories(database2) {
  return Object.freeze({
    roles: createRolesRepository2(database2),
    labels: {
      findById: (id) => record(database2, id),
      create(job, at) {
        const row = labelJobToRow({
          revision: "0",
          entity: {
            id: job.id,
            actorId: job.actorId,
            status: "created",
            templateId: job.templateId,
            geometry: { schemaVersion: 1, value: job.geometry },
            labels: { schemaVersion: 1, value: job.labels },
            result: { schemaVersion: 1, value: {} },
            createdAt: job.createdAt,
            updatedAt: at
          }
        });
        const columns = ["id", "actor_id", "status", "template_id", "geometry_json", "labels_json", "result_json", "created_at", "completed_at", "version", "updated_at"];
        const result = database2.execute(
          `INSERT INTO label_jobs(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) DO NOTHING`,
          columns.map((column) => row[column])
        );
        return result.changes === 1 ? "created" : "duplicate";
      }
    },
    audit: createAuditRepository3(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}

// src/server/inventory-session-service.ts
init_quantity();
import { nanoid as nanoid7 } from "nanoid";
function response3(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
var InventorySessionService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid7());
  }
  executor;
  options;
  createId;
  start(metadata) {
    return this.command(metadata, "inventory.session.start", {}, (context, actorId) => {
      const repositories = context.transaction.repositories;
      const existing = repositories.sessions.findOpen();
      if (existing) return response3(409, "INVENTORY_ALREADY_ACTIVE", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u0430", { sessionId: existing.id });
      const products2 = repositories.products.listWeight().filter((product) => product.status === "active");
      if (!products2.length) return response3(400, "NO_WEIGHT_PRODUCTS", "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u0435\u0441\u043E\u0432\u044B\u0445 \u0442\u043E\u0432\u0430\u0440\u043E\u0432 \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
      const at = context.clock.now();
      const session2 = { id: this.createId("session"), status: "active", actorId, comment: "", startedAt: at, version: 0 };
      const rows = products2.map((product) => ({ sessionId: session2.id, productId: product.id, expected: repositories.totals.find(product.id)?.quantity ?? 0, version: 0 }));
      if (!repositories.sessions.create(session2, rows, at)) throw new Error("inventory session insert collided");
      this.audit(context, actorId, "inventory_session", session2.id, "start", { rowCount: rows.length }, at);
      return { status: 201, body: { session: session2, rows } };
    });
  }
  close(metadata, sessionId, input) {
    return this.command(metadata, "inventory.session.close", JSON.parse(JSON.stringify({ sessionId, ...input })), (context, actorId) => {
      const repositories = context.transaction.repositories;
      const session2 = repositories.sessions.findById(sessionId);
      if (!session2) return response3(404, "NOT_FOUND", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      if (session2.status === "completed") return response3(409, "INVENTORY_ALREADY_CLOSED", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430");
      if (session2.status !== "active") return response3(409, "INVENTORY_NOT_ACTIVE", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F");
      if (session2.actorId !== actorId) return response3(403, "INVENTORY_OWNER_REQUIRED", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044E \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442 \u043D\u0430\u0447\u0430\u0432\u0448\u0438\u0439 \u0435\u0451 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A");
      const snapshots = repositories.sessions.rows(sessionId);
      if (input.rows.length !== snapshots.length || new Set(input.rows.map((row) => row.productId)).size !== snapshots.length) return response3(400, "INVENTORY_ROWS_INCOMPLETE", "\u041D\u0443\u0436\u043D\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0432\u0441\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
      const at = context.clock.now();
      const plans = [];
      for (const snapshot of snapshots) {
        const submitted = input.rows.find((row) => row.productId === snapshot.productId);
        const product = repositories.products.findById(snapshot.productId)?.entity;
        const total = repositories.totals.find(snapshot.productId);
        if (!submitted || !product || !total) return response3(409, "INVENTORY_STATE_CHANGED", "\u0421\u043E\u0441\u0442\u0430\u0432 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
        let actual;
        try {
          actual = requireQuantity(submitted.actual, { unit: "\u0448\u0442" });
        } catch {
          return response3(400, "BAD_QUANTITY", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0437\u0430\u0434\u0430\u0451\u0442\u0441\u044F \u0446\u0435\u043B\u044B\u043C\u0438 \u043F\u0430\u0447\u043A\u0430\u043C\u0438");
        }
        if (total.quantity !== snapshot.expected) return response3(409, "INVENTORY_CONFLICT", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430");
        plans.push({ snapshot, product, total, actual, delta: actual - snapshot.expected });
      }
      if (!repositories.sessions.save({ ...session2, status: "closing", version: session2.version + 1 }, session2.version, at)) throw new Error("inventory session CAS failed");
      const operations = [];
      for (const { snapshot, total, actual, delta } of plans) {
        if (!repositories.sessions.saveActual(sessionId, snapshot.productId, actual, snapshot.version, at)) throw new Error("inventory row CAS failed");
        if (delta === 0) continue;
        if (!repositories.totals.save(snapshot.productId, actual, total.version, at)) throw new Error("inventory total CAS failed");
        const operationId = this.createId("operation");
        const operation = { id: operationId, type: "inventory_adjustment", productId: snapshot.productId, quantity: Math.abs(delta), actorId, reason: input.comment?.trim() || "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F", idempotencyKey: `inventory.session:${sessionId}:${snapshot.productId}`, metadata: { schemaVersion: 1, value: { sessionId, expected: snapshot.expected, actual, delta, totalOnly: true, correlationId: context.correlationId } }, createdAt: at };
        if (!repositories.ledger.appendOperation(operation)) throw new Error("inventory operation insert collided");
        if (delta < 0 && !repositories.ledger.appendConsumption({ id: this.createId("consumption"), productId: snapshot.productId, quantity: -delta, source: "inventory", inventorySessionId: sessionId, stockOperationId: operationId, actorId, comment: input.comment?.trim() || "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F", createdAt: at })) throw new Error("inventory consumption insert collided");
        operations.push({ operationId, productId: snapshot.productId, expected: snapshot.expected, actual, delta });
      }
      const closing = repositories.sessions.findById(sessionId);
      if (!closing || !repositories.sessions.save({ ...closing, status: "completed", comment: input.comment?.trim() || "", completedAt: at, version: closing.version + 1 }, closing.version, at)) throw new Error("inventory completion failed");
      this.audit(context, actorId, "inventory_session", sessionId, "close", { operations, comment: input.comment?.trim() || "" }, at);
      return { status: 200, body: { sessionId, status: "completed", operations } };
    });
  }
  consume(metadata, input) {
    return this.applyAdjustment(metadata, "inventory.consumption", { ...input, direction: "consume" }, true);
  }
  adjust(metadata, input) {
    return this.applyAdjustment(metadata, "inventory.adjustment", { ...input, direction: "adjust" }, false);
  }
  applyAdjustment(metadata, scope, input, consumption) {
    return this.command(metadata, scope, JSON.parse(JSON.stringify(input)), (context, actorId) => {
      const repositories = context.transaction.repositories;
      if (repositories.sessions.findOpen()) return response3(409, "INVENTORY_ACTIVE", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0435\u0439");
      const productId = String(input.productId || "");
      const product = repositories.products.findById(productId)?.entity;
      const total = repositories.totals.find(productId);
      if (!product || !total) return response3(404, "NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      let delta;
      try {
        const raw = consumption ? -Number(input.quantity) : Number(input.delta);
        if (raw === 0) throw new Error("zero");
        delta = Math.sign(raw) * requireQuantity(Math.abs(raw), { unit: product.inventoryKind === "weight" ? "\u0448\u0442" : product.unit, allowZero: false });
      } catch {
        return response3(400, "BAD_QUANTITY", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E");
      }
      const next = total.quantity + delta;
      if (next < 0) return response3(409, "NEGATIVE_STOCK_BLOCKED", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u0442\u0430\u0442\u044C \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C");
      const at = context.clock.now();
      if (!repositories.totals.save(productId, next, total.version, at)) return response3(409, "VERSION_CONFLICT", "\u041E\u0431\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D");
      const operationId = this.createId("operation");
      const operation = { id: operationId, type: "inventory_adjustment", productId, quantity: Math.abs(delta), actorId, reason: String(input.comment || "").trim() || (consumption ? "\u0420\u0430\u0441\u0445\u043E\u0434" : "\u041A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u043A\u0430"), idempotencyKey: `${scope}:${context.idempotencyKey}`, metadata: { schemaVersion: 1, value: { delta, totalOnly: true, kind: consumption ? "consumption" : "adjustment", correlationId: context.correlationId } }, createdAt: at };
      if (!repositories.ledger.appendOperation(operation)) throw new Error("adjustment operation insert collided");
      if (consumption && !repositories.ledger.appendConsumption({ id: this.createId("consumption"), productId, quantity: -delta, source: input.source === "damage" ? "damage" : "manual", stockOperationId: operationId, actorId, comment: operation.reason, createdAt: at })) throw new Error("consumption insert collided");
      this.audit(context, actorId, consumption ? "consumption" : "inventory_adjustment", operationId, "create", { productId, delta, before: total.quantity, after: next }, at);
      return { status: 201, body: { operationId, productId, delta, before: total.quantity, after: next } };
    });
  }
  command(metadata, scope, request, run) {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      const authorization2 = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization2.outcome !== "found" || !authorization2.snapshot.permissions.includes("inventory:write")) return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432" } };
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, authorization2.snapshot.userId));
    }, { transactionMode: "immediate" });
  }
  audit(context, actorId, entity, entityId, action, changes, at) {
    const result = context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("inventory audit insert collided");
  }
};

// src/server/sqlite-inventory-session-repositories.ts
init_quantity();
function session(row) {
  return { id: String(row.id), status: row.status, actorId: String(row.actor_id), comment: String(row.comment), startedAt: String(row.started_at), completedAt: row.completed_at === null ? void 0 : String(row.completed_at), version: Number(row.version) };
}
function createSqliteInventorySessionRepositories(database2) {
  const products2 = createProductsRepository(database2);
  return Object.freeze({
    roles: createRolesRepository2(database2),
    products: {
      findById: products2.findById,
      listWeight() {
        return database2.query("SELECT id FROM products WHERE inventory_kind='weight' AND status='active' ORDER BY official_name COLLATE NOCASE,id").map((row) => products2.findById(String(row.id))?.entity).filter((value) => Boolean(value));
      }
    },
    sessions: {
      findOpen() {
        const row = database2.query("SELECT * FROM inventory_sessions WHERE status IN ('active','closing') ORDER BY started_at,id LIMIT 1")[0];
        return row ? session(row) : void 0;
      },
      findById(id) {
        const row = database2.query("SELECT * FROM inventory_sessions WHERE id=?", [id])[0];
        return row ? session(row) : void 0;
      },
      create(value, rows, at) {
        const inserted = database2.execute("INSERT INTO inventory_sessions(id,status,actor_id,comment,started_at,completed_at,version,updated_at) VALUES (?,?,?,?,?,?,0,?) ON CONFLICT DO NOTHING", [value.id, value.status, value.actorId, value.comment, value.startedAt, value.completedAt ?? null, at]);
        if (inserted.changes !== 1) return false;
        for (const row of rows) database2.execute("INSERT INTO inventory_session_rows(session_id,product_id,expected_quantity_minor,actual_quantity_minor,version,updated_at) VALUES (?,?,?,NULL,0,?)", [row.sessionId, row.productId, quantityToMinor(row.expected, "\u0448\u0442"), at]);
        return true;
      },
      rows(sessionId) {
        return database2.query("SELECT * FROM inventory_session_rows WHERE session_id=? ORDER BY product_id", [sessionId]).map((row) => ({ sessionId: String(row.session_id), productId: String(row.product_id), expected: quantityFromMinor(Number(row.expected_quantity_minor)), actual: row.actual_quantity_minor === null ? void 0 : quantityFromMinor(Number(row.actual_quantity_minor)), version: Number(row.version) }));
      },
      save(value, expectedVersion, at) {
        return database2.execute("UPDATE inventory_sessions SET status=?,comment=?,completed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?", [value.status, value.comment, value.completedAt ?? null, at, value.id, expectedVersion]).changes === 1;
      },
      saveActual(sessionId, productId, actual, expectedVersion, at) {
        return database2.execute("UPDATE inventory_session_rows SET actual_quantity_minor=?,version=version+1,updated_at=? WHERE session_id=? AND product_id=? AND version=?", [quantityToMinor(actual, "\u0448\u0442"), at, sessionId, productId, expectedVersion]).changes === 1;
      }
    },
    totals: {
      find(productId) {
        const row = database2.query("SELECT * FROM inventory_balances WHERE product_id=?", [productId])[0];
        return row ? { quantity: quantityFromMinor(Number(row.quantity_minor)), version: Number(row.version) } : void 0;
      },
      save(productId, quantity3, expectedVersion, at) {
        return database2.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [quantityToMinor(quantity3, "\u0448\u0442"), at, productId, expectedVersion]).changes === 1;
      }
    },
    ledger: {
      appendOperation(operation) {
        const product = products2.findById(operation.productId)?.entity;
        if (!product) return false;
        const row = stockOperationMapper.toRow(operation, product.inventoryKind === "weight" ? "\u0448\u0442" : product.unit);
        const columns = ["id", "type", "product_id", "from_location_id", "to_location_id", "quantity", "quantity_minor", "actor_id", "reason", "idempotency_key", "reversed_operation_id", "metadata_json", "created_at"];
        return database2.execute(`INSERT INTO stock_operations(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`, columns.map((column) => row[column])).changes === 1;
      },
      appendConsumption(value) {
        return database2.execute("INSERT INTO consumption_records(id,product_id,quantity_minor,source,inventory_session_id,stock_operation_id,actor_id,comment,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [value.id, value.productId, quantityToMinor(value.quantity, "\u0448\u0442"), value.source, value.inventorySessionId ?? null, value.stockOperationId, value.actorId, value.comment, value.createdAt]).changes === 1;
      }
    },
    audit: createAuditRepository3(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}

// src/server/mappers/schedule.ts
var scheduleDayStatuses = ["working", "closed"];
var shiftStatuses = ["draft", "scheduled", "in_progress", "completed", "cancelled"];
var swapStatuses = ["pending", "accepted", "declined", "cancelled", "expired"];
function version(entity, row) {
  const value = integer(entity, row, "version");
  if (value < 0) throw new RowMappingError(entity, rowIdentity(row), "version", "INTEGER");
  return value;
}
function versionForWrite2(entity, id, value, revision2) {
  if (!Number.isSafeInteger(value) || value < 0 || revision2 !== String(value)) {
    throw new RowMappingError(entity, id, "version", "INTEGER");
  }
  return value;
}
function sourceShiftRevision(row) {
  const value = integer("shift_swap_requests", row, "source_shift_version");
  if (value < 0) throw new RowMappingError("shift_swap_requests", rowIdentity(row), "source_shift_version", "INTEGER");
  return String(value);
}
function sourceShiftRevisionForWrite(id, revision2) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision2)) {
    throw new RowMappingError("shift_swap_requests", id, "source_shift_version", "INTEGER");
  }
  const value = Number(revision2);
  if (!Number.isSafeInteger(value)) throw new RowMappingError("shift_swap_requests", id, "source_shift_version", "INTEGER");
  return value;
}
function localTime(row, field) {
  const value = requiredString("shifts", row, field);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RowMappingError("shifts", rowIdentity(row), field, "DATE");
  }
  return value;
}
var scheduleDayMapper = {
  fromRow(row) {
    const mappedVersion = version("schedule_days", row);
    const updatedAt = utcTimestamp("schedule_days", row, "updated_at");
    return {
      id: requiredString("schedule_days", row, "id"),
      date: localDate("schedule_days", row, "local_date"),
      locationId: requiredString("schedule_days", row, "location_id"),
      status: enumValue("schedule_days", row, "status", scheduleDayStatuses),
      comment: requiredString("schedule_days", row, "comment"),
      version: mappedVersion,
      createdByUserId: nullableString("schedule_days", row, "created_by_user_id"),
      createdAt: utcTimestamp("schedule_days", row, "created_at"),
      updatedAt,
      revision: String(mappedVersion)
    };
  },
  toRow(value) {
    return {
      id: value.id,
      local_date: value.date,
      location_id: value.locationId,
      status: value.status,
      comment: value.comment,
      version: versionForWrite2("schedule_days", value.id, value.version, value.revision),
      created_by_user_id: toNullable(value.createdByUserId),
      created_at: value.createdAt,
      updated_at: value.updatedAt
    };
  }
};
var shiftMapper = {
  fromRow(row) {
    const mappedVersion = version("shifts", row);
    const updatedAt = utcTimestamp("shifts", row, "updated_at");
    return {
      id: requiredString("shifts", row, "id"),
      scheduleDayId: requiredString("shifts", row, "schedule_day_id"),
      locationId: requiredString("shifts", row, "location_id"),
      date: localDate("shifts", row, "local_date"),
      start: localTime(row, "start_time"),
      end: localTime(row, "end_time"),
      status: enumValue("shifts", row, "status", shiftStatuses),
      comment: requiredString("shifts", row, "comment"),
      version: mappedVersion,
      createdByUserId: nullableString("shifts", row, "created_by_user_id"),
      createdAt: utcTimestamp("shifts", row, "created_at"),
      updatedAt,
      revision: String(mappedVersion)
    };
  },
  toRow(value) {
    return {
      id: value.id,
      schedule_day_id: value.scheduleDayId,
      location_id: value.locationId,
      local_date: localDate("shifts", { id: value.id, local_date: value.date }, "local_date"),
      start_time: localTime({ id: value.id, start_time: value.start }, "start_time"),
      end_time: localTime({ id: value.id, end_time: value.end }, "end_time"),
      status: value.status,
      comment: value.comment,
      version: versionForWrite2("shifts", value.id, value.version, value.revision),
      created_by_user_id: toNullable(value.createdByUserId),
      created_at: value.createdAt,
      updated_at: value.updatedAt
    };
  }
};
var assignmentIdentity = ["shift_id", "user_id"];
var shiftAssignmentMapper = {
  fromRow(row) {
    return {
      shiftId: requiredString("shift_assignments", row, "shift_id", assignmentIdentity),
      userId: requiredString("shift_assignments", row, "user_id", assignmentIdentity),
      assignedByUserId: nullableString("shift_assignments", row, "assigned_by_user_id", assignmentIdentity),
      assignedAt: utcTimestamp("shift_assignments", row, "assigned_at", assignmentIdentity)
    };
  },
  toRow(value) {
    return {
      shift_id: value.shiftId,
      user_id: value.userId,
      assigned_by_user_id: toNullable(value.assignedByUserId),
      assigned_at: value.assignedAt
    };
  }
};
var shiftSwapRequestMapper = {
  fromRow(row) {
    const mappedVersion = version("shift_swap_requests", row);
    return {
      id: requiredString("shift_swap_requests", row, "id"),
      fromShiftId: requiredString("shift_swap_requests", row, "from_shift_id"),
      fromUserId: requiredString("shift_swap_requests", row, "from_user_id"),
      toUserId: requiredString("shift_swap_requests", row, "to_user_id"),
      sourceShiftRevision: sourceShiftRevision(row),
      status: enumValue("shift_swap_requests", row, "status", swapStatuses),
      createdAt: utcTimestamp("shift_swap_requests", row, "created_at"),
      resolvedAt: nullableUtcTimestamp("shift_swap_requests", row, "resolved_at"),
      resolvedByUserId: nullableString("shift_swap_requests", row, "resolved_by_user_id"),
      version: mappedVersion,
      updatedAt: utcTimestamp("shift_swap_requests", row, "updated_at"),
      revision: String(mappedVersion)
    };
  },
  toRow(value) {
    return {
      id: value.id,
      from_shift_id: value.fromShiftId,
      from_user_id: value.fromUserId,
      to_user_id: value.toUserId,
      source_shift_version: sourceShiftRevisionForWrite(value.id, value.sourceShiftRevision),
      status: value.status,
      created_at: value.createdAt,
      resolved_at: toNullable(value.resolvedAt),
      resolved_by_user_id: toNullable(value.resolvedByUserId),
      version: versionForWrite2("shift_swap_requests", value.id, value.version, value.revision),
      updated_at: value.updatedAt
    };
  }
};

// src/server/sqlite-schedule-command-repositories.ts
function first4(database2, sql, parameters) {
  return database2.query(sql, parameters)[0];
}
function values4(row, columns) {
  return columns.map((column) => row[column]);
}
function revisionNumber4(revision2) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision2)) return void 0;
  const value = Number(revision2);
  return Number.isSafeInteger(value) ? value : void 0;
}
function assertCreateOptions4(options) {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}
function locationRecord2(database2, locationId) {
  const row = first4(database2, "SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row) return void 0;
  const mapped = locationMapper.fromRow(row);
  const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: revision2, ...location } = mapped;
  return { entity: location, revision: revision2 };
}
function dayRecord(database2, date2, locationId) {
  const row = first4(database2, "SELECT * FROM schedule_days WHERE local_date = ? AND location_id = ?", [date2, locationId]);
  if (!row) return void 0;
  const mapped = scheduleDayMapper.fromRow(row);
  const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision: revision2, ...day } = mapped;
  return { entity: day, revision: revision2 };
}
function dayRecordById(database2, dayId2) {
  const row = first4(database2, "SELECT * FROM schedule_days WHERE id = ?", [dayId2]);
  if (!row) return void 0;
  const mapped = scheduleDayMapper.fromRow(row);
  const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision: revision2, ...day } = mapped;
  return { entity: day, revision: revision2 };
}
function shiftRecord(database2, shiftId) {
  const row = first4(database2, "SELECT * FROM shifts WHERE id = ?", [shiftId]);
  if (!row) return void 0;
  const mapped = shiftMapper.fromRow(row);
  const assignments = database2.query(
    "SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id",
    [shiftId]
  ).map((assignment) => shiftAssignmentMapper.fromRow(assignment).userId);
  const {
    scheduleDayId: _scheduleDayId,
    version: _version,
    createdByUserId: _createdByUserId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    revision: revision2,
    ...shift
  } = mapped;
  return { entity: { ...shift, employeeIds: assignments }, revision: revision2 };
}
function swapRecord(database2, swapId) {
  const row = first4(database2, "SELECT * FROM shift_swap_requests WHERE id = ?", [swapId]);
  if (!row) return void 0;
  const mapped = shiftSwapRequestMapper.fromRow(row);
  const { version: _version, updatedAt: _updatedAt, revision: revision2, ...swap } = mapped;
  return { entity: swap, revision: revision2 };
}
function notificationRecord2(database2, notificationId) {
  const row = first4(database2, "SELECT * FROM webapp_notifications WHERE id = ?", [notificationId]);
  if (!row) return void 0;
  const mapped = webappNotificationFromRow(row);
  return { entity: mapped.entity.notification, revision: mapped.revision };
}
function outboxRecord3(database2, messageId, channel2, idempotencyKey) {
  const row = first4(
    database2,
    channel2 && idempotencyKey ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1" : "SELECT * FROM outbox_messages WHERE id = ?",
    channel2 && idempotencyKey ? [messageId, channel2, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return void 0;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}
function auditRecord4(database2, entryId) {
  const row = first4(database2, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return void 0;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}
function createRolesRepository3(database2) {
  return {
    getAuthorization(userId) {
      const rawUser = first4(database2, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };
      const roles3 = database2.query("SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id", [userId]).map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(roles3)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };
      const role = distinctRoles[0];
      const permissions2 = database2.query("SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id", [role]).map((row) => rolePermissionMapper.fromRow(row).permission);
      return { outcome: "found", snapshot: { userId, role, permissions: permissions2, revision: user.revision } };
    }
  };
}
function createParticipantsRepository(database2) {
  return {
    findStatus(userId) {
      const row = first4(database2, "SELECT * FROM users WHERE id = ?", [userId]);
      return row ? userMapper.fromRow(row).status : void 0;
    }
  };
}
function createScheduleRepository(database2) {
  return {
    findDay: (date2, locationId) => dayRecord(database2, date2, locationId),
    hasBlockingShifts(date2, locationId) {
      return first4(
        database2,
        "SELECT 1 AS present FROM shifts WHERE local_date = ? AND location_id = ? AND status IN ('draft','scheduled','in_progress') LIMIT 1",
        [date2, locationId]
      ) !== void 0;
    },
    saveDay(day, options) {
      const persisted = scheduleDayMapper.toRow({
        ...day,
        createdAt: options.at,
        updatedAt: options.at,
        revision: String(day.version)
      });
      const columns = [
        "id",
        "local_date",
        "location_id",
        "status",
        "comment",
        "version",
        "created_by_user_id",
        "created_at",
        "updated_at"
      ];
      if (options.expectedRevision === null) {
        if (day.version !== 0) throw new TypeError("A new schedule day must start at version 0");
        const result2 = database2.execute(
          `INSERT INTO schedule_days(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values4(persisted, columns)
        );
        const current2 = dayRecord(database2, day.date, day.locationId) ?? dayRecordById(database2, day.id);
        if (!current2) throw new Error("schedule day insert did not create or find a row");
        return result2.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
      }
      const expected = revisionNumber4(options.expectedRevision);
      if (expected === void 0) {
        const current2 = dayRecordById(database2, day.id);
        return current2 ? { outcome: "stale", current: current2 } : { outcome: "missing" };
      }
      if (!Number.isSafeInteger(expected + 1) || day.version !== expected + 1) {
        throw new TypeError("A schedule day update must increment version by exactly one");
      }
      const result = database2.execute(
        `UPDATE schedule_days
         SET local_date = ?, location_id = ?, status = ?, comment = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [persisted.local_date, persisted.location_id, persisted.status, persisted.comment, persisted.version, persisted.updated_at, day.id, expected]
      );
      const current = dayRecordById(database2, day.id);
      if (result.changes === 1) {
        if (!current) throw new Error("schedule day update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    findShift: (shiftId) => shiftRecord(database2, shiftId),
    saveShift(shift, options) {
      if (new Set(shift.employeeIds).size !== shift.employeeIds.length) {
        throw new TypeError("Shift assignments must be unique");
      }
      const expected = options.expectedRevision === null ? null : revisionNumber4(options.expectedRevision);
      if (options.expectedRevision !== null && expected === void 0) {
        const current = shiftRecord(database2, shift.id);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      const version2 = expected === null ? 0 : expected + 1;
      if (!Number.isSafeInteger(version2)) throw new TypeError("Shift version exceeds safe integer range");
      const day = dayRecord(database2, shift.date, shift.locationId);
      if (!day) throw new Error("Cannot save a shift without its schedule day");
      const existingRow = first4(database2, "SELECT * FROM shifts WHERE id = ?", [shift.id]);
      const existing = existingRow ? shiftMapper.fromRow(existingRow) : void 0;
      const persisted = shiftMapper.toRow({
        ...shift,
        scheduleDayId: day.entity.id,
        version: version2,
        createdByUserId: existing?.createdByUserId ?? options.assignedByUserId,
        createdAt: existing?.createdAt ?? options.at,
        updatedAt: options.at,
        revision: String(version2)
      });
      const columns = [
        "id",
        "schedule_day_id",
        "location_id",
        "local_date",
        "start_time",
        "end_time",
        "status",
        "comment",
        "version",
        "created_by_user_id",
        "created_at",
        "updated_at"
      ];
      if (expected === null) {
        const result = database2.execute(
          `INSERT INTO shifts(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values4(persisted, columns)
        );
        if (result.changes !== 1) {
          const current = shiftRecord(database2, shift.id);
          if (!current) throw new Error("shift insert collided without a readable row");
          return { outcome: "duplicate", current };
        }
      } else {
        const result = database2.execute(
          `UPDATE shifts
           SET schedule_day_id = ?, location_id = ?, local_date = ?, start_time = ?, end_time = ?,
               status = ?, comment = ?, version = ?, updated_at = ?
           WHERE id = ? AND version = ?`,
          [
            persisted.schedule_day_id,
            persisted.location_id,
            persisted.local_date,
            persisted.start_time,
            persisted.end_time,
            persisted.status,
            persisted.comment,
            persisted.version,
            persisted.updated_at,
            shift.id,
            expected
          ]
        );
        if (result.changes !== 1) {
          const current = shiftRecord(database2, shift.id);
          return current ? { outcome: "stale", current } : { outcome: "missing" };
        }
      }
      const existingAssignments = new Set(database2.query(
        "SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id",
        [shift.id]
      ).map((row) => shiftAssignmentMapper.fromRow(row).userId));
      const desiredAssignments = new Set(shift.employeeIds);
      for (const userId of existingAssignments) {
        if (desiredAssignments.has(userId)) continue;
        const deleted = database2.execute("DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [shift.id, userId]);
        if (deleted.changes !== 1) throw new Error("shift assignment delete lost its row");
      }
      for (const userId of shift.employeeIds) {
        if (existingAssignments.has(userId)) continue;
        const assignment = shiftAssignmentMapper.toRow({
          shiftId: shift.id,
          userId,
          assignedByUserId: options.assignedByUserId,
          assignedAt: options.at
        });
        const inserted = database2.execute(
          `INSERT INTO shift_assignments(shift_id, user_id, assigned_by_user_id, assigned_at)
           VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [assignment.shift_id, assignment.user_id, assignment.assigned_by_user_id, assignment.assigned_at]
        );
        if (inserted.changes !== 1) throw new Error("duplicate shift assignment in write input");
      }
      const record2 = shiftRecord(database2, shift.id);
      if (!record2) throw new Error("shift write lost its row");
      return expected === null ? { outcome: "created", record: record2 } : { outcome: "updated", record: record2 };
    },
    findAssignmentConflicts(input) {
      if (input.userIds.length === 0) return [];
      const placeholders = input.userIds.map(() => "?").join(", ");
      const rows = database2.query(
        `SELECT DISTINCT sa.user_id
         FROM shift_assignments sa
         JOIN shifts s ON s.id = sa.shift_id
         WHERE s.local_date = ?
           AND s.status <> 'cancelled'
           AND s.start_time < ?
           AND s.end_time > ?
           AND sa.user_id IN (${placeholders})
           ${input.excludeShiftId ? "AND s.id <> ?" : ""}
         ORDER BY sa.user_id`,
        [input.date, input.end, input.start, ...input.userIds, ...input.excludeShiftId ? [input.excludeShiftId] : []]
      );
      return rows.map((row) => row.user_id);
    },
    findSwap: (swapId) => swapRecord(database2, swapId),
    saveSwap(swap, options) {
      const expected = options.expectedRevision === null ? null : revisionNumber4(options.expectedRevision);
      if (options.expectedRevision !== null && expected === void 0) {
        const current2 = swapRecord(database2, swap.id);
        return current2 ? { outcome: "stale", current: current2 } : { outcome: "missing" };
      }
      const version2 = expected === null ? 0 : expected + 1;
      if (!Number.isSafeInteger(version2)) throw new TypeError("Swap version exceeds safe integer range");
      const persisted = shiftSwapRequestMapper.toRow({ ...swap, version: version2, updatedAt: options.at, revision: String(version2) });
      const columns = [
        "id",
        "from_shift_id",
        "from_user_id",
        "to_user_id",
        "source_shift_version",
        "status",
        "created_at",
        "resolved_at",
        "resolved_by_user_id",
        "version",
        "updated_at"
      ];
      if (expected === null) {
        const result2 = database2.execute(
          `INSERT INTO shift_swap_requests(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values4(persisted, columns)
        );
        let current2 = swapRecord(database2, swap.id);
        if (!current2 && swap.status === "pending") {
          const row = first4(
            database2,
            "SELECT id FROM shift_swap_requests WHERE from_shift_id = ? AND from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
            [swap.fromShiftId, swap.fromUserId, swap.toUserId]
          );
          if (typeof row?.id === "string") current2 = swapRecord(database2, row.id);
        }
        if (!current2) throw new Error("swap insert did not create or find a row");
        return result2.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
      }
      const result = database2.execute(
        `UPDATE shift_swap_requests
         SET status = ?, resolved_at = ?, resolved_by_user_id = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [persisted.status, persisted.resolved_at, persisted.resolved_by_user_id, persisted.version, persisted.updated_at, swap.id, expected]
      );
      const current = swapRecord(database2, swap.id);
      if (result.changes === 1) {
        if (!current) throw new Error("swap update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    listPendingSiblingSwaps(input) {
      return database2.query(
        `SELECT * FROM shift_swap_requests
         WHERE from_shift_id = ? AND from_user_id = ? AND status = 'pending' AND id <> ?
         ORDER BY created_at, id`,
        [input.fromShiftId, input.fromUserId, input.excludeSwapId]
      ).map((row) => {
        const mapped = shiftSwapRequestMapper.fromRow(row);
        const { version: _version, updatedAt: _updatedAt, revision: revision2, ...swap } = mapped;
        return { entity: swap, revision: revision2 };
      });
    }
  };
}
function createNotificationsRepository2(database2) {
  return {
    append(notification, options) {
      assertCreateOptions4(options);
      const mapped = webappNotificationToRow({ entity: { notification, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "recipient_user_id", "type", "payload_json", "is_read", "created_at", "read_at", "version", "updated_at"];
      const result = database2.execute(
        `INSERT INTO webapp_notifications(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values4(mapped, columns)
      );
      const current = notificationRecord2(database2, notification.id);
      if (!current) throw new Error("notification insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createOutboxRepository3(database2) {
  return {
    enqueue(message, options) {
      assertCreateOptions4(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id",
        "channel",
        "recipient_user_id",
        "type",
        "payload_json",
        "status",
        "idempotency_key",
        "attempt_count",
        "max_attempts",
        "available_at",
        "last_error",
        "last_error_code",
        "lease_owner",
        "lease_token",
        "lease_expires_at",
        "failed_at",
        "sent_at",
        "created_at",
        "version",
        "updated_at"
      ];
      const result = database2.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values4(mapped, columns)
      );
      const current = outboxRecord3(database2, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createAuditRepository4(database2) {
  return {
    append(entry, options) {
      assertCreateOptions4(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "actor_id", "entity_type", "entity_id", "action", "changes_json", "request_id", "created_at", "version", "updated_at"];
      const result = database2.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values4(mapped, columns)
      );
      const current = auditRecord4(database2, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}
function createSqliteScheduleCommandRepositories(database2) {
  return Object.freeze({
    roles: createRolesRepository3(database2),
    participants: createParticipantsRepository(database2),
    locations: { findById: (locationId) => locationRecord2(database2, locationId) },
    schedule: createScheduleRepository(database2),
    notifications: createNotificationsRepository2(database2),
    outbox: createOutboxRepository3(database2),
    audit: createAuditRepository4(database2),
    idempotency: createSqliteIdempotencyRepository(database2)
  });
}

// src/server/inventory-reversal-service.ts
init_quantity();
import { nanoid as nanoid9 } from "nanoid";

// src/server/stock-operation-service.ts
init_quantity();
import { nanoid as nanoid8 } from "nanoid";
var stockTypes = ["receipt", "transfer", "write_off", "correction"];
function response4(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function requireActiveAuthorization(context) {
  if (context.actor.kind !== "user") return void 0;
  return context.transaction.repositories.roles.getAuthorization(context.actor.userId);
}
function writeSucceeded(result, entity) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}
function saveBalance(repository, current, next, at) {
  const result = current ? repository.saveBalance(next, { at, expectedRevision: current.revision }) : repository.saveBalance(next, { at, expectedRevision: null });
  if (current && result.outcome !== "updated" || !current && result.outcome !== "created") {
    throw new Error("Stock balance conditional write failed inside immediate transaction");
  }
}
function detectStockLevelEvent(before, after, threshold) {
  if (before > 0 && after === 0) return "stock.zero";
  if (after > 0 && before > threshold && after <= threshold) return "stock.threshold";
  return void 0;
}
function writeStockLevelEvent(context, eventType, input, at, options) {
  const repositories = context.transaction.repositories;
  const payload = { schemaVersion: 1, eventType, ...input };
  for (const delivery of repositories.stockEventRecipients.resolveInstant(eventType)) {
    if (delivery.channel === "webapp") {
      writeSucceeded(repositories.notifications.append({
        id: options.createId("notification"),
        channel: "webapp",
        userId: delivery.userId,
        type: eventType,
        payload: { schemaVersion: 1, value: payload },
        read: false,
        createdAt: at
      }, { at, expectedRevision: null }), "notification");
    } else {
      writeSucceeded(repositories.outbox.enqueue({
        id: options.createId("outbox"),
        channel: "telegram",
        userId: delivery.userId,
        type: eventType,
        payload: { schemaVersion: 1, value: payload },
        status: "pending",
        attemptCount: 0,
        maxAttempts: options.outboxMaxAttempts,
        availableAt: at,
        createdAt: at,
        idempotencyKey: `stock:${input.operationId}:${eventType}:${delivery.userId}`
      }, { at, expectedRevision: null }), "outbox");
    }
  }
}
var StockOperationService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid8());
  }
  executor;
  options;
  createId;
  execute(metadata, input) {
    return this.executor.execute(metadata, (context) => this.executeInContext(context, input), { transactionMode: "immediate" });
  }
  executeInContext(context, input) {
    const authorization2 = requireActiveAuthorization(context);
    if (!authorization2 || authorization2.outcome !== "found" || !authorization2.snapshot.permissions.includes("stock:move")) {
      return { outcome: "rejected", ...response4(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
    }
    if (authorization2.snapshot.role === "seller" && (input.type === "receipt" || input.type === "correction")) {
      return { outcome: "rejected", ...response4(403, "FORBIDDEN_OPERATION", "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0442\u044C \u043F\u0440\u0438\u0445\u043E\u0434 \u0438\u043B\u0438 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u043A\u0443") };
    }
    if (context.transaction.repositories.inventoryGuard.isOpen()) {
      return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "\u0421\u043A\u043B\u0430\u0434\u0441\u043A\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0435\u0439" } };
    }
    const request = {
      type: input.type,
      productId: input.productId,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      quantity: input.quantity,
      reason: input.reason ?? ""
    };
    return executeIdempotently(
      context,
      "stock.operation",
      request,
      { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs },
      () => this.apply(context, authorization2.snapshot.userId, input)
    );
  }
  apply(context, actorId, input) {
    const repositories = context.transaction.repositories;
    if (!stockTypes.includes(input.type)) return response4(400, "UNSUPPORTED_OPERATION", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F");
    if (!input.productId.trim()) return response4(400, "BAD_PRODUCT_ID", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D");
    const productRecord2 = repositories.products.findById(input.productId);
    if (!productRecord2 || productRecord2.entity.status === "deleted") {
      return response4(404, "PRODUCT_NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", { productId: input.productId });
    }
    const product = productRecord2.entity;
    let quantity3;
    try {
      quantity3 = requireQuantity(input.quantity, { unit: product.inventoryKind === "weight" ? "\u0448\u0442" : product.unit, allowZero: false });
    } catch {
      return response4(400, "BAD_QUANTITY", "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0443\u043B\u044F");
    }
    const shapeError = this.validateShape(input);
    if (shapeError) return shapeError;
    const sourceLocation = input.fromLocationId ? repositories.locations.findById(input.fromLocationId) : void 0;
    const targetLocation = input.toLocationId ? repositories.locations.findById(input.toLocationId) : void 0;
    if (input.fromLocationId && (!sourceLocation || sourceLocation.entity.status !== "active")) {
      return response4(404, "LOCATION_NOT_FOUND", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", { locationId: input.fromLocationId, role: "source" });
    }
    if (input.toLocationId && (!targetLocation || targetLocation.entity.status !== "active")) {
      return response4(404, "LOCATION_NOT_FOUND", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", { locationId: input.toLocationId, role: "target" });
    }
    let beforeTotal;
    try {
      beforeTotal = repositories.stock.sumBalance(input.productId);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response4(409, "STOCK_TOTAL_OUT_OF_RANGE", "\u0421\u0443\u043C\u043C\u0430\u0440\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D");
    }
    const source = input.fromLocationId ? repositories.stock.findBalance(input.productId, input.fromLocationId) : void 0;
    const target = input.toLocationId ? repositories.stock.findBalance(input.productId, input.toLocationId) : void 0;
    if (input.fromLocationId && (source?.entity.quantity ?? 0) < quantity3) {
      return response4(409, "NEGATIVE_STOCK_BLOCKED", "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u0442\u0430\u0442\u044C \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C");
    }
    let sourceNext;
    let targetNext;
    let afterTotal;
    try {
      if (input.fromLocationId) {
        const current = source?.entity.quantity ?? 0;
        sourceNext = {
          productId: input.productId,
          locationId: input.fromLocationId,
          quantity: subtractQuantity(current, quantity3, product.unit),
          version: (source?.entity.version ?? 0) + 1
        };
      }
      if (input.toLocationId) {
        const current = target?.entity.quantity ?? 0;
        targetNext = {
          productId: input.productId,
          locationId: input.toLocationId,
          quantity: addQuantity(current, quantity3, product.unit),
          version: (target?.entity.version ?? 0) + 1
        };
      }
      afterTotal = input.type === "transfer" ? beforeTotal : input.fromLocationId ? subtractQuantity(beforeTotal, quantity3, product.unit) : addQuantity(beforeTotal, quantity3, product.unit);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response4(409, "STOCK_LIMIT_EXCEEDED", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0438\u0440\u0443\u044E\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D");
    }
    const at = context.clock.now();
    if (sourceNext) {
      saveBalance(repositories.stock, source, sourceNext, at);
    }
    if (targetNext) {
      saveBalance(repositories.stock, target, targetNext, at);
    }
    const operationId = this.createId("operation");
    const operation = {
      id: operationId,
      type: input.type,
      productId: input.productId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity: quantity3,
      actorId,
      reason: input.reason?.trim() || "\u0411\u0435\u0437 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F",
      idempotencyKey: `stock.operation:${context.idempotencyKey}`,
      metadata: { schemaVersion: 1, value: { correlationId: context.correlationId } },
      createdAt: at
    };
    writeSucceeded(repositories.stock.appendOperation(operation, { at, expectedRevision: null }), "stock operation");
    writeSucceeded(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "stock_operation",
      entityId: operationId,
      action: "create",
      changes: {
        schemaVersion: 1,
        value: {
          type: operation.type,
          productId: operation.productId,
          fromLocationId: operation.fromLocationId ?? null,
          toLocationId: operation.toLocationId ?? null,
          quantity: quantity3,
          actorId,
          reason: operation.reason,
          idempotencyKey: operation.idempotencyKey ?? null,
          correlationId: context.correlationId
        }
      },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "audit");
    const eventType = detectStockLevelEvent(beforeTotal, afterTotal, product.lowStockThreshold);
    if (eventType) writeStockLevelEvent(context, eventType, {
      operationId,
      productId: input.productId,
      before: beforeTotal,
      after: afterTotal,
      threshold: product.lowStockThreshold,
      correlationId: context.correlationId
    }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });
    return {
      status: 201,
      body: {
        id: operationId,
        type: operation.type,
        productId: operation.productId,
        fromLocationId: operation.fromLocationId ?? null,
        toLocationId: operation.toLocationId ?? null,
        quantity: quantity3,
        actorId,
        reason: operation.reason,
        idempotencyKey: context.idempotencyKey,
        metadata: { correlationId: context.correlationId },
        createdAt: at,
        eventType: eventType ?? null
      }
    };
  }
  validateShape(input) {
    if (input.type === "transfer") {
      if (!input.fromLocationId || !input.toLocationId) return response4(400, "BAD_TRANSFER", "\u041D\u0443\u0436\u043D\u044B \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435");
      if (input.fromLocationId === input.toLocationId) return response4(400, "BAD_TRANSFER", "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F");
    } else if (input.type === "write_off") {
      if (!input.fromLocationId || input.toLocationId) return response4(400, "BAD_WRITE_OFF", "\u041D\u0443\u0436\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
    } else if (!input.toLocationId || input.fromLocationId) {
      return response4(400, "BAD_RECEIPT", "\u041D\u0443\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0430");
    }
    return void 0;
  }
};

// src/server/inventory-reversal-service.ts
function response5(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function authorized2(context, permission) {
  if (context.actor.kind !== "user") return void 0;
  const authorization2 = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return authorization2.outcome === "found" && authorization2.snapshot.permissions.includes(permission) ? authorization2.snapshot : void 0;
}
function saveExistingBalance(repositories, current, next, at) {
  const result = repositories.stock.saveBalance(next, { at, expectedRevision: current.revision });
  if (result.outcome !== "updated") throw new Error("Inventory/reversal balance CAS failed");
}
function saveMaybeNewBalance(repositories, current, next, at) {
  const result = current ? repositories.stock.saveBalance(next, { at, expectedRevision: current.revision }) : repositories.stock.saveBalance(next, { at, expectedRevision: null });
  if (current && result.outcome !== "updated" || !current && result.outcome !== "created") throw new Error("Reversal balance CAS failed");
}
function created2(result, entity) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided`);
}
var InventoryService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid9());
  }
  executor;
  options;
  createId;
  execute(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const actor3 = authorized2(context, "inventory:write");
      if (!actor3) return { outcome: "rejected", ...response5(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      if (context.transaction.repositories.inventoryGuard.isOpen()) return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0441\u0435\u0441\u0441\u0438\u044E \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438" } };
      const request = {
        comment: input.comment,
        rows: input.rows.map((row) => ({
          productId: row.productId,
          locationId: row.locationId,
          expected: row.expected,
          version: row.version,
          actual: row.actual ?? null
        }))
      };
      return executeIdempotently(context, "stock.inventory", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, actor3.userId, input));
    }, { transactionMode: "immediate" });
  }
  apply(context, actorId, input) {
    if (!input.comment.trim()) return response5(400, "COMMENT_REQUIRED", "\u0414\u043B\u044F \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439");
    if (!input.rows.length) return response5(400, "EMPTY_INVENTORY", "\u0421\u0442\u0440\u043E\u043A\u0438 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u044B");
    const repositories = context.transaction.repositories;
    const invalid = [];
    const conflicts = [];
    const seen = /* @__PURE__ */ new Set();
    const plans = [];
    for (const row of input.rows) {
      const key = `${row.productId}\0${row.locationId}`;
      if (seen.has(key)) {
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "DUPLICATE_ROW" });
        continue;
      }
      seen.add(key);
      const productRecord2 = repositories.products.findById(row.productId);
      const locationRecord3 = repositories.locations.findById(row.locationId);
      const balance = repositories.stock.findBalance(row.productId, row.locationId);
      if (!productRecord2 || productRecord2.entity.status === "deleted" || !locationRecord3 || locationRecord3.entity.status !== "active" || !balance) {
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "NOT_FOUND" });
        continue;
      }
      let actual;
      let expected;
      try {
        actual = requireQuantity(row.actual, { unit: productRecord2.entity.unit });
        expected = requireQuantity(row.expected, { unit: productRecord2.entity.unit });
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "BAD_QUANTITY" });
        continue;
      }
      if (!Number.isSafeInteger(row.version) || row.version !== balance.entity.version || expected !== balance.entity.quantity) {
        conflicts.push({ productId: row.productId, locationId: row.locationId, expectedVersion: row.version, actualVersion: balance.entity.version });
        continue;
      }
      try {
        const delta = subtractQuantity(actual, balance.entity.quantity, productRecord2.entity.unit);
        plans.push({ row: { ...row, actual }, product: productRecord2.entity, balance, delta });
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "STOCK_LIMIT_EXCEEDED" });
      }
    }
    if (invalid.length) return response5(400, "BAD_INVENTORY_ROWS", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438", { rows: invalid });
    if (conflicts.length) return response5(409, "INVENTORY_CONFLICT", "\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0441\u043B\u0435 snapshot", { rows: conflicts });
    const totals = /* @__PURE__ */ new Map();
    try {
      for (const plan of plans) {
        let current = totals.get(plan.row.productId);
        if (!current) {
          const before = repositories.stock.sumBalance(plan.row.productId);
          current = { before, after: before, threshold: plan.product.lowStockThreshold };
        }
        current.after = addQuantity(current.after, plan.delta, plan.product.unit);
        totals.set(plan.row.productId, current);
      }
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response5(409, "STOCK_LIMIT_EXCEEDED", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0438\u0440\u0443\u044E\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D");
    }
    const at = context.clock.now();
    const operations = [];
    const lastOperationByProduct = /* @__PURE__ */ new Map();
    for (const plan of plans) {
      if (plan.delta === 0) continue;
      saveExistingBalance(repositories, plan.balance, {
        ...plan.balance.entity,
        quantity: plan.row.actual,
        version: plan.balance.entity.version + 1
      }, at);
      const operationId = this.createId("operation");
      const operation = {
        id: operationId,
        type: "inventory_adjustment",
        productId: plan.row.productId,
        toLocationId: plan.row.locationId,
        quantity: Math.abs(plan.delta),
        actorId,
        reason: input.comment.trim(),
        idempotencyKey: `stock.inventory:${canonicalRequestHash([context.idempotencyKey, plan.row.productId, plan.row.locationId])}`,
        metadata: { schemaVersion: 1, value: { expected: plan.row.expected, actual: plan.row.actual, delta: plan.delta, correlationId: context.correlationId } },
        createdAt: at
      };
      created2(repositories.stock.appendOperation(operation, { at, expectedRevision: null }), "inventory operation");
      operations.push({ id: operationId, productId: plan.row.productId, locationId: plan.row.locationId, expected: plan.row.expected, actual: plan.row.actual, delta: plan.delta });
      lastOperationByProduct.set(plan.row.productId, operationId);
    }
    for (const [productId, total] of totals) {
      const operationId = lastOperationByProduct.get(productId);
      const eventType = detectStockLevelEvent(total.before, total.after, total.threshold);
      if (operationId && eventType) writeStockLevelEvent(context, eventType, {
        operationId,
        productId,
        before: total.before,
        after: total.after,
        threshold: total.threshold,
        correlationId: context.correlationId
      }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });
    }
    created2(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "inventory",
      entityId: context.idempotencyKey,
      action: "apply",
      changes: { schemaVersion: 1, value: {
        comment: input.comment.trim(),
        requestedCount: input.rows.length,
        changedCount: operations.length,
        operationIds: operations.map((operation) => operation.id),
        rows: operations,
        correlationId: context.correlationId
      } },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "inventory audit");
    return { status: 201, body: { operations } };
  }
};
var ReversalService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid9());
  }
  executor;
  options;
  createId;
  execute(metadata, operationId) {
    return this.executor.execute(metadata, (context) => {
      const actor3 = authorized2(context, "techlog:read");
      if (!actor3) return { outcome: "rejected", ...response5(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      if (context.transaction.repositories.inventoryGuard.isOpen()) return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "\u0421\u043A\u043B\u0430\u0434\u0441\u043A\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0435\u0439" } };
      return executeIdempotently(context, "stock.reversal", { operationId }, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, actor3.userId, operationId));
    }, { transactionMode: "immediate" });
  }
  apply(context, actorId, operationId) {
    const repositories = context.transaction.repositories;
    const originalRecord = repositories.stock.findOperation(operationId);
    if (!originalRecord) return response5(404, "NOT_FOUND", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    const original = originalRecord.entity;
    if (original.type === "reversal" || original.type === "merge") return response5(400, "BAD_REVERSAL_TARGET", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044E \u043D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C");
    if (repositories.stock.findReversalFor(operationId)) return response5(409, "ALREADY_REVERSED", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0443\u0436\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430");
    const productRecord2 = repositories.products.findById(original.productId);
    if (!productRecord2 || productRecord2.entity.status === "deleted") return response5(404, "PRODUCT_NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const unit = productRecord2.entity.unit;
    const malformedShape = original.type === "transfer" && (!original.fromLocationId || !original.toLocationId || original.fromLocationId === original.toLocationId) || (original.type === "receipt" || original.type === "correction") && (!original.toLocationId || original.fromLocationId !== void 0) || original.type === "write_off" && (!original.fromLocationId || original.toLocationId !== void 0) || original.type === "inventory_adjustment" && (!original.toLocationId || original.fromLocationId !== void 0);
    if (malformedShape) return response5(409, "BAD_REVERSAL_STATE", "\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u0438\u043C\u0435\u0435\u0442 \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0443\u044E \u0444\u043E\u0440\u043C\u0443");
    let decrementLocation = original.toLocationId;
    let incrementLocation = original.fromLocationId;
    if (original.type === "inventory_adjustment") {
      const metadata = original.metadata?.value;
      const expected = metadata?.expected;
      const actual = metadata?.actual;
      const delta = metadata?.delta;
      try {
        if (typeof expected !== "number" || typeof actual !== "number" || typeof delta !== "number") throw new QuantityError("NOT_FINITE");
        const normalizedExpected = requireQuantity(expected, { unit });
        const normalizedActual = requireQuantity(actual, { unit });
        const normalizedDelta = subtractQuantity(normalizedActual, normalizedExpected, unit);
        if (delta === 0 || normalizedDelta !== delta || Math.abs(normalizedDelta) !== original.quantity) throw new QuantityError("PRECISION");
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        return response5(409, "BAD_REVERSAL_STATE", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0435\u043D\u0430");
      }
      if (delta < 0) {
        decrementLocation = void 0;
        incrementLocation = original.toLocationId;
      } else {
        decrementLocation = original.toLocationId;
        incrementLocation = void 0;
      }
    }
    const decrement = decrementLocation ? repositories.stock.findBalance(original.productId, decrementLocation) : void 0;
    const increment = incrementLocation ? repositories.stock.findBalance(original.productId, incrementLocation) : void 0;
    if (decrementLocation && (!decrement || decrement.entity.quantity < original.quantity)) {
      return response5(409, "NEGATIVE_STOCK_BLOCKED", "\u041E\u0442\u043C\u0435\u043D\u0430 \u043F\u0440\u0438\u0432\u0435\u0434\u0451\u0442 \u043A \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u043C\u0443 \u043E\u0441\u0442\u0430\u0442\u043A\u0443");
    }
    let beforeTotal;
    let afterTotal;
    let decrementNext;
    let incrementNext;
    try {
      beforeTotal = repositories.stock.sumBalance(original.productId);
      if (decrementLocation && decrement) decrementNext = { ...decrement.entity, quantity: subtractQuantity(decrement.entity.quantity, original.quantity, unit), version: decrement.entity.version + 1 };
      if (incrementLocation) incrementNext = {
        productId: original.productId,
        locationId: incrementLocation,
        quantity: addQuantity(increment?.entity.quantity ?? 0, original.quantity, unit),
        version: (increment?.entity.version ?? 0) + 1
      };
      const totalDelta = (incrementLocation ? original.quantity : 0) - (decrementLocation ? original.quantity : 0);
      afterTotal = addQuantity(beforeTotal, totalDelta, unit);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response5(409, "STOCK_LIMIT_EXCEEDED", "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0438\u0440\u0443\u044E\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D");
    }
    const at = context.clock.now();
    if (decrementNext && decrement) saveExistingBalance(repositories, decrement, decrementNext, at);
    if (incrementNext) saveMaybeNewBalance(repositories, increment, incrementNext, at);
    const reversalId = this.createId("operation");
    const reversal = {
      id: reversalId,
      type: "reversal",
      productId: original.productId,
      fromLocationId: decrementLocation,
      toLocationId: incrementLocation,
      quantity: original.quantity,
      actorId,
      reason: `\u041E\u0442\u043C\u0435\u043D\u0430 ${original.id}`,
      idempotencyKey: `stock.reversal:${canonicalRequestHash([context.idempotencyKey, original.id])}`,
      reversedOperationId: original.id,
      metadata: { schemaVersion: 1, value: { originalId: original.id, correlationId: context.correlationId } },
      createdAt: at
    };
    created2(repositories.stock.appendOperation(reversal, { at, expectedRevision: null }), "reversal");
    created2(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "stock_operation",
      entityId: reversalId,
      action: "reverse",
      changes: { schemaVersion: 1, value: {
        originalId: original.id,
        reversalId,
        originalType: original.type,
        quantity: original.quantity,
        correlationId: context.correlationId
      } },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "reversal audit");
    const eventType = detectStockLevelEvent(beforeTotal, afterTotal, productRecord2.entity.lowStockThreshold);
    if (eventType) writeStockLevelEvent(context, eventType, {
      operationId: reversalId,
      productId: original.productId,
      before: beforeTotal,
      after: afterTotal,
      threshold: productRecord2.entity.lowStockThreshold,
      correlationId: context.correlationId
    }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });
    return { status: 201, body: { id: reversalId, type: "reversal", productId: original.productId, fromLocationId: decrementLocation ?? null, toLocationId: incrementLocation ?? null, quantity: original.quantity, actorId, reason: reversal.reason, idempotencyKey: context.idempotencyKey, reversedOperationId: original.id, createdAt: at } };
  }
};

// src/server/schedule-swap-service.ts
import { nanoid as nanoid10 } from "nanoid";
function response6(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function activeAuthorization(context) {
  if (context.actor.kind !== "user") return void 0;
  return context.transaction.repositories.roles.getAuthorization(context.actor.userId);
}
function writeCreated2(result, entity) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}
function writeMutated(result, entity, create) {
  if (create && result.outcome === "created") return result.record;
  if (!create && result.outcome === "updated") return result.record;
  throw new Error(`${entity} conditional write failed inside immediate transaction`);
}
function canonicalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function canonicalTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function expectedRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : void 0;
}
function uniqueEmployeeIds(values5) {
  if (!Array.isArray(values5) || values5.length === 0 || values5.length > 3) return void 0;
  const normalized = values5.map((value) => typeof value === "string" ? value.trim() : "");
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) return void 0;
  return normalized;
}
var editableShiftStatuses = /* @__PURE__ */ new Set(["draft", "scheduled"]);
var allowedShiftTransitions = {
  draft: ["draft", "scheduled", "cancelled"],
  scheduled: ["scheduled", "in_progress", "cancelled"],
  in_progress: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: []
};
var ScheduleSwapService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid10());
  }
  executor;
  options;
  createId;
  saveDay(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const authorization2 = activeAuthorization(context);
      if (!authorization2 || authorization2.outcome !== "found" || !authorization2.snapshot.permissions.includes("schedule:manage")) {
        return { outcome: "rejected", ...response6(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      return executeIdempotently(context, "schedule.day.save", {
        date: input.date,
        locationId: input.locationId,
        status: input.status,
        comment: input.comment ?? "",
        expectedVersion: input.expectedVersion
      }, this.idempotencyOptions(), () => this.applySaveDay(context, authorization2.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }
  saveShift(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const authorization2 = activeAuthorization(context);
      if (!authorization2 || authorization2.outcome !== "found" || !authorization2.snapshot.permissions.includes("schedule:manage")) {
        return { outcome: "rejected", ...response6(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      return executeIdempotently(context, "schedule.shift.save", {
        id: input.id ?? null,
        date: input.date,
        start: input.start,
        end: input.end,
        locationId: input.locationId,
        employeeIds: [...input.employeeIds],
        status: input.status,
        comment: input.comment ?? "",
        expectedVersion: input.expectedVersion
      }, this.idempotencyOptions(), () => this.applySaveShift(context, authorization2.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }
  createSwap(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const authorization2 = activeAuthorization(context);
      if (!authorization2 || authorization2.outcome !== "found") {
        return { outcome: "rejected", ...response6(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      return executeIdempotently(context, "schedule.swap.create", {
        shiftId: input.shiftId,
        toUserId: input.toUserId
      }, this.idempotencyOptions(), () => this.applyCreateSwap(context, authorization2.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }
  resolveSwap(metadata, input) {
    return this.executor.execute(metadata, (context) => {
      const authorization2 = activeAuthorization(context);
      if (!authorization2 || authorization2.outcome !== "found") {
        return { outcome: "rejected", ...response6(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      }
      return executeIdempotently(context, "schedule.swap.resolve", {
        swapId: input.swapId,
        action: input.action
      }, this.idempotencyOptions(), () => this.applyResolveSwap(context, authorization2.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }
  idempotencyOptions() {
    return { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs };
  }
  applySaveDay(context, actorId, input) {
    if (!canonicalDate(input.date)) return response6(400, "BAD_DATE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430");
    if (!input.locationId.trim()) return response6(400, "BAD_LOCATION_ID", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430");
    if (input.status !== "working" && input.status !== "closed") return response6(400, "BAD_DAY_STATUS", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0434\u043D\u044F");
    const expected = input.expectedVersion === null ? null : expectedRevision(input.expectedVersion);
    if (input.expectedVersion !== null && expected === void 0) return response6(400, "BAD_EXPECTED_VERSION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F");
    const repositories = context.transaction.repositories;
    const location = repositories.locations.findById(input.locationId);
    if (!location || location.entity.status !== "active") return response6(404, "LOCATION_NOT_FOUND", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    const current = repositories.schedule.findDay(input.date, input.locationId);
    if (expected === null && current) return response6(409, "DAY_EXISTS", "\u0414\u0435\u043D\u044C \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442", { currentVersion: current.entity.version });
    if (expected !== null && !current) return response6(404, "DAY_NOT_FOUND", "\u0414\u0435\u043D\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    if (expected !== null && current?.revision !== expected) {
      return response6(409, "STALE_DAY", "\u0414\u0435\u043D\u044C \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D", { currentVersion: current?.entity.version ?? null });
    }
    if (input.status === "closed" && repositories.schedule.hasBlockingShifts(input.date, input.locationId)) {
      return response6(409, "DAY_HAS_ACTIVE_SHIFTS", "\u041D\u0435\u043B\u044C\u0437\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u044C \u0434\u0435\u043D\u044C \u0441 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C\u0438 \u0441\u043C\u0435\u043D\u0430\u043C\u0438");
    }
    const at = context.clock.now();
    const next = {
      id: current?.entity.id ?? this.createId("day"),
      date: input.date,
      locationId: input.locationId,
      status: input.status,
      comment: input.comment?.trim() ?? "",
      version: current ? current.entity.version + 1 : 0
    };
    const saved = writeMutated(repositories.schedule.saveDay(next, expected === null ? { at, expectedRevision: null } : { at, expectedRevision: expected }), "schedule day", expected === null);
    this.audit(context, actorId, "schedule_day", next.id, current ? "update" : "create", {
      date: next.date,
      locationId: next.locationId,
      status: next.status,
      comment: next.comment,
      version: Number(saved.revision),
      correlationId: context.correlationId
    }, at);
    return { status: current ? 200 : 201, body: { ...next, version: Number(saved.revision) } };
  }
  applySaveShift(context, actorId, input) {
    if (!canonicalDate(input.date)) return response6(400, "BAD_DATE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430");
    if (!canonicalTime(input.start) || !canonicalTime(input.end) || input.start >= input.end) {
      return response6(400, "BAD_SHIFT_INTERVAL", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0438\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u0441\u043C\u0435\u043D\u044B");
    }
    const employeeIds = uniqueEmployeeIds(input.employeeIds);
    if (!employeeIds) return response6(400, "BAD_ASSIGNMENTS", "\u0412 \u0441\u043C\u0435\u043D\u0435 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u043E\u0442 \u043E\u0434\u043D\u043E\u0433\u043E \u0434\u043E \u0442\u0440\u0451\u0445 \u0443\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432");
    const expected = input.expectedVersion === null ? null : expectedRevision(input.expectedVersion);
    if (input.expectedVersion !== null && expected === void 0) return response6(400, "BAD_EXPECTED_VERSION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F");
    if (expected === null && input.id) return response6(400, "CREATE_SHIFT_ID_FORBIDDEN", "ID \u043D\u043E\u0432\u043E\u0439 \u0441\u043C\u0435\u043D\u044B \u043D\u0430\u0437\u043D\u0430\u0447\u0430\u0435\u0442\u0441\u044F \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C");
    if (expected !== null && !input.id) return response6(400, "SHIFT_ID_REQUIRED", "ID \u0441\u043C\u0435\u043D\u044B \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D");
    if (expected === null && !editableShiftStatuses.has(input.status)) {
      return response6(400, "BAD_INITIAL_SHIFT_STATUS", "\u041D\u043E\u0432\u0443\u044E \u0441\u043C\u0435\u043D\u0443 \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A draft \u0438\u043B\u0438 scheduled");
    }
    const repositories = context.transaction.repositories;
    const location = repositories.locations.findById(input.locationId);
    if (!location || location.entity.status !== "active") return response6(404, "LOCATION_NOT_FOUND", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    for (const userId of employeeIds) {
      if (repositories.participants.findStatus(userId) !== "active") {
        return response6(409, "INACTIVE_EMPLOYEE", "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", { userId });
      }
    }
    const current = input.id ? repositories.schedule.findShift(input.id) : void 0;
    if (expected !== null && !current) return response6(404, "SHIFT_NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    if (expected !== null && current?.revision !== expected) {
      return response6(409, "STALE_SHIFT", "\u0421\u043C\u0435\u043D\u0430 \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430", { currentVersion: current ? Number(current.revision) : null });
    }
    if (current && !allowedShiftTransitions[current.entity.status].includes(input.status)) {
      return response6(409, "INVALID_SHIFT_TRANSITION", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0441\u0442\u0430\u0442\u0443\u0441\u0430", { currentStatus: current.entity.status });
    }
    const day = repositories.schedule.findDay(input.date, input.locationId);
    if (day?.entity.status === "closed") return response6(409, "DAY_CLOSED", "\u0414\u0435\u043D\u044C \u0437\u0430\u043A\u0440\u044B\u0442");
    const conflicts = input.status === "cancelled" ? [] : repositories.schedule.findAssignmentConflicts({
      date: input.date,
      start: input.start,
      end: input.end,
      userIds: employeeIds,
      ...current ? { excludeShiftId: current.entity.id } : {}
    });
    if (conflicts.length) return response6(409, "SHIFT_CONFLICT", "\u0421\u043C\u0435\u043D\u0430 \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u0435\u0442\u0441\u044F \u0441 \u0434\u0440\u0443\u0433\u043E\u0439", { userIds: [...conflicts] });
    const at = context.clock.now();
    let usableDay = day;
    if (!usableDay) {
      const createdDay = {
        id: this.createId("day"),
        date: input.date,
        locationId: input.locationId,
        status: "working",
        comment: "",
        version: 0
      };
      usableDay = writeMutated(repositories.schedule.saveDay(createdDay, { at, expectedRevision: null }), "schedule day", true);
    }
    const next = {
      id: current?.entity.id ?? this.createId("shift"),
      date: input.date,
      start: input.start,
      end: input.end,
      locationId: input.locationId,
      employeeIds,
      status: input.status,
      comment: input.comment?.trim() ?? ""
    };
    const saved = writeMutated(repositories.schedule.saveShift(next, expected === null ? { at, expectedRevision: null, assignedByUserId: actorId } : { at, expectedRevision: expected, assignedByUserId: actorId }), "shift", expected === null);
    this.audit(context, actorId, "shift", next.id, current ? "update" : "create", {
      date: next.date,
      start: next.start,
      end: next.end,
      locationId: next.locationId,
      employeeIds: [...next.employeeIds],
      status: next.status,
      comment: next.comment,
      version: Number(saved.revision),
      scheduleDayId: usableDay.entity.id,
      correlationId: context.correlationId
    }, at);
    return { status: current ? 200 : 201, body: { ...next, employeeIds: [...next.employeeIds], version: Number(saved.revision) } };
  }
  applyCreateSwap(context, actorId, input) {
    if (!input.shiftId.trim() || !input.toUserId.trim()) return response6(400, "BAD_SWAP_INPUT", "\u0421\u043C\u0435\u043D\u0430 \u0438 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B");
    if (actorId === input.toUserId) return response6(400, "SAME_SWAP_USER", "\u041D\u0435\u043B\u044C\u0437\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0441\u043C\u0435\u043D\u0443 \u0441\u0435\u0431\u0435");
    const repositories = context.transaction.repositories;
    const validation = this.validateSwapAssignment(repositories, input.shiftId, actorId, input.toUserId);
    if (validation.error) return validation.error;
    const pending = repositories.schedule.listPendingSiblingSwaps({ fromShiftId: input.shiftId, fromUserId: actorId, excludeSwapId: "" });
    const at = context.clock.now();
    const stale = pending.filter((record2) => record2.entity.sourceShiftRevision !== validation.shift.revision);
    if (stale.length) this.expireStaleSwaps(context, actorId, stale, validation.shift.revision, at);
    const duplicate = pending.filter((record2) => record2.entity.sourceShiftRevision === validation.shift.revision).find((record2) => record2.entity.toUserId === input.toUserId);
    if (duplicate) return response6(409, "SWAP_ALREADY_PENDING", "\u0417\u0430\u043F\u0440\u043E\u0441 \u0443\u0436\u0435 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430", { swapId: duplicate.entity.id });
    const swap = {
      id: this.createId("swap"),
      fromShiftId: input.shiftId,
      fromUserId: actorId,
      toUserId: input.toUserId,
      sourceShiftRevision: validation.shift.revision,
      status: "pending",
      createdAt: at
    };
    writeMutated(repositories.schedule.saveSwap(swap, { at, expectedRevision: null }), "swap", true);
    this.audit(context, actorId, "shift_swap", swap.id, "create", {
      shiftId: input.shiftId,
      fromUserId: actorId,
      toUserId: input.toUserId,
      status: "pending",
      correlationId: context.correlationId
    }, at);
    this.deliver(context, input.toUserId, "swap.requested", swap.id, {
      swapId: swap.id,
      shiftId: input.shiftId,
      fromUserId: actorId,
      toUserId: input.toUserId,
      status: "pending",
      correlationId: context.correlationId
    }, at);
    return { status: 201, body: { ...swap } };
  }
  applyResolveSwap(context, actorId, input) {
    if (!input.swapId.trim() || !["accept", "decline", "cancel"].includes(input.action)) {
      return response6(400, "BAD_SWAP_RESOLUTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435");
    }
    const repositories = context.transaction.repositories;
    const current = repositories.schedule.findSwap(input.swapId);
    if (!current) return response6(404, "SWAP_NOT_FOUND", "\u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0431\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    if (current.entity.status !== "pending") {
      return response6(409, "STALE_SWAP", "\u0417\u0430\u043F\u0440\u043E\u0441 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D", { currentStatus: current.entity.status, swapId: current.entity.id });
    }
    const isSource = actorId === current.entity.fromUserId;
    const isTarget = actorId === current.entity.toUserId;
    if (input.action === "cancel" && !isSource || input.action !== "cancel" && !isTarget) {
      return response6(403, "SWAP_ACTOR_MISMATCH", "\u042D\u0442\u043E\u0442 \u0437\u0430\u043F\u0440\u043E\u0441 \u043F\u0440\u0435\u0434\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044E");
    }
    const at = context.clock.now();
    if (input.action === "accept") return this.acceptSwap(context, actorId, current, at);
    const nextStatus = input.action === "decline" ? "declined" : "cancelled";
    const next = { ...current.entity, status: nextStatus, resolvedAt: at, resolvedByUserId: actorId };
    writeMutated(repositories.schedule.saveSwap(next, { at, expectedRevision: current.revision }), "swap", false);
    this.audit(context, actorId, "shift_swap", next.id, input.action, {
      swapId: next.id,
      shiftId: next.fromShiftId,
      status: nextStatus,
      correlationId: context.correlationId
    }, at);
    const recipientId = input.action === "decline" ? next.fromUserId : next.toUserId;
    this.deliver(context, recipientId, `swap.${nextStatus}`, next.id, {
      swapId: next.id,
      shiftId: next.fromShiftId,
      status: nextStatus,
      correlationId: context.correlationId
    }, at);
    return { status: 200, body: { swapId: next.id, status: nextStatus, resolvedAt: at } };
  }
  acceptSwap(context, actorId, current, at) {
    const repositories = context.transaction.repositories;
    const latestShift = repositories.schedule.findShift(current.entity.fromShiftId);
    if (!latestShift) return response6(404, "SHIFT_NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    if (latestShift.revision !== current.entity.sourceShiftRevision) {
      const stale = [current, ...repositories.schedule.listPendingSiblingSwaps({
        fromShiftId: current.entity.fromShiftId,
        fromUserId: current.entity.fromUserId,
        excludeSwapId: current.entity.id
      })].filter((record2) => record2.entity.sourceShiftRevision !== latestShift.revision);
      this.expireStaleSwaps(context, actorId, stale, latestShift.revision, at);
      return response6(409, "STALE_SWAP", "\u0421\u043C\u0435\u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u043E\u0441\u0430", {
        swapId: current.entity.id,
        expectedShiftVersion: Number(current.entity.sourceShiftRevision),
        currentShiftVersion: Number(latestShift.revision),
        currentStatus: "expired"
      });
    }
    const validation = this.validateSwapAssignment(
      repositories,
      current.entity.fromShiftId,
      current.entity.fromUserId,
      current.entity.toUserId
    );
    if (validation.error) return validation.error;
    const shiftRecord2 = validation.shift;
    const nextShift = {
      ...shiftRecord2.entity,
      employeeIds: shiftRecord2.entity.employeeIds.map((userId) => userId === current.entity.fromUserId ? current.entity.toUserId : userId)
    };
    const savedShift = writeMutated(repositories.schedule.saveShift(nextShift, {
      at,
      expectedRevision: shiftRecord2.revision,
      assignedByUserId: actorId
    }), "shift assignment", false);
    const accepted = {
      ...current.entity,
      status: "accepted",
      resolvedAt: at,
      resolvedByUserId: actorId
    };
    writeMutated(repositories.schedule.saveSwap(accepted, { at, expectedRevision: current.revision }), "swap", false);
    const siblings = repositories.schedule.listPendingSiblingSwaps({
      fromShiftId: current.entity.fromShiftId,
      fromUserId: current.entity.fromUserId,
      excludeSwapId: current.entity.id
    });
    for (const sibling of siblings) {
      const cancelled = {
        ...sibling.entity,
        status: "cancelled",
        resolvedAt: at,
        resolvedByUserId: actorId
      };
      writeMutated(repositories.schedule.saveSwap(cancelled, { at, expectedRevision: sibling.revision }), "sibling swap", false);
      this.deliver(context, sibling.entity.toUserId, "swap.cancelled", sibling.entity.id, {
        swapId: sibling.entity.id,
        acceptedSwapId: current.entity.id,
        shiftId: current.entity.fromShiftId,
        status: "cancelled",
        correlationId: context.correlationId
      }, at);
    }
    this.audit(context, actorId, "shift", shiftRecord2.entity.id, "swap_assignment", {
      shiftId: shiftRecord2.entity.id,
      fromUserId: current.entity.fromUserId,
      toUserId: current.entity.toUserId,
      version: Number(savedShift.revision),
      correlationId: context.correlationId
    }, at);
    this.audit(context, actorId, "shift_swap", accepted.id, "accept", {
      swapId: accepted.id,
      shiftId: accepted.fromShiftId,
      status: "accepted",
      cancelledSiblingIds: siblings.map((item) => item.entity.id),
      correlationId: context.correlationId
    }, at);
    this.deliver(context, accepted.fromUserId, "swap.accepted", accepted.id, {
      swapId: accepted.id,
      shiftId: accepted.fromShiftId,
      fromUserId: accepted.fromUserId,
      toUserId: accepted.toUserId,
      status: "accepted",
      correlationId: context.correlationId
    }, at);
    return {
      status: 200,
      body: {
        swapId: accepted.id,
        status: "accepted",
        shiftId: accepted.fromShiftId,
        employeeIds: [...nextShift.employeeIds],
        shiftVersion: Number(savedShift.revision),
        cancelledSiblingIds: siblings.map((item) => item.entity.id),
        resolvedAt: at
      }
    };
  }
  validateSwapAssignment(repositories, shiftId, fromUserId, toUserId) {
    const shift = repositories.schedule.findShift(shiftId);
    if (!shift) return { error: response6(404, "SHIFT_NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430") };
    if (shift.entity.status !== "scheduled") return { error: response6(409, "SHIFT_NOT_SCHEDULED", "\u041E\u0431\u043C\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0441\u043C\u0435\u043D\u044B") };
    const day = repositories.schedule.findDay(shift.entity.date, shift.entity.locationId);
    if (!day || day.entity.status !== "working") return { error: response6(409, "DAY_CLOSED", "\u0414\u0435\u043D\u044C \u0437\u0430\u043A\u0440\u044B\u0442") };
    const location = repositories.locations.findById(shift.entity.locationId);
    if (!location || location.entity.status !== "active") return { error: response6(409, "LOCATION_INACTIVE", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430") };
    if (repositories.participants.findStatus(fromUserId) !== "active") {
      return { error: response6(409, "SOURCE_USER_INACTIVE", "\u0418\u043D\u0438\u0446\u0438\u0430\u0442\u043E\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D") };
    }
    if (repositories.participants.findStatus(toUserId) !== "active") {
      return { error: response6(409, "TARGET_USER_INACTIVE", "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D") };
    }
    if (shift.entity.employeeIds.filter((userId) => userId === fromUserId).length !== 1) {
      return { error: response6(409, "SOURCE_ASSIGNMENT_STALE", "\u0418\u043D\u0438\u0446\u0438\u0430\u0442\u043E\u0440 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u043D\u0430 \u0441\u043C\u0435\u043D\u0443") };
    }
    if (shift.entity.employeeIds.includes(toUserId)) {
      return { error: response6(409, "TARGET_ALREADY_ASSIGNED", "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C \u0443\u0436\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u043D\u0430 \u0441\u043C\u0435\u043D\u0443") };
    }
    const conflicts = repositories.schedule.findAssignmentConflicts({
      date: shift.entity.date,
      start: shift.entity.start,
      end: shift.entity.end,
      userIds: [toUserId],
      excludeShiftId: shift.entity.id
    });
    if (conflicts.includes(toUserId)) return { error: response6(409, "TARGET_SHIFT_CONFLICT", "\u0423 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u0435\u0442\u0441\u044F \u0441\u043C\u0435\u043D\u0430") };
    return { shift };
  }
  expireStaleSwaps(context, actorId, records, currentShiftRevision, at) {
    const repositories = context.transaction.repositories;
    for (const record2 of records) {
      const expired = {
        ...record2.entity,
        status: "expired",
        resolvedAt: at,
        resolvedByUserId: actorId
      };
      writeMutated(repositories.schedule.saveSwap(expired, { at, expectedRevision: record2.revision }), "stale swap", false);
      this.audit(context, actorId, "shift_swap", expired.id, "expire", {
        swapId: expired.id,
        shiftId: expired.fromShiftId,
        expectedShiftVersion: Number(expired.sourceShiftRevision),
        currentShiftVersion: Number(currentShiftRevision),
        status: "expired",
        correlationId: context.correlationId
      }, at);
      this.deliver(context, expired.toUserId, "swap.expired", expired.id, {
        swapId: expired.id,
        shiftId: expired.fromShiftId,
        status: "expired",
        correlationId: context.correlationId
      }, at);
    }
  }
  audit(context, actorId, entity, entityId, action, changes, at) {
    writeCreated2(context.transaction.repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity,
      entityId,
      action,
      changes: { schemaVersion: 1, value: changes },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "audit");
  }
  deliver(context, userId, type, eventId, payload, at) {
    const repositories = context.transaction.repositories;
    writeCreated2(repositories.notifications.append({
      id: this.createId("notification"),
      channel: "webapp",
      userId,
      type,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } },
      read: false,
      createdAt: at
    }, { at, expectedRevision: null }), "notification");
    writeCreated2(repositories.outbox.enqueue({
      id: this.createId("outbox"),
      channel: "telegram",
      userId,
      type,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } },
      status: "pending",
      attemptCount: 0,
      maxAttempts: this.options.outboxMaxAttempts,
      availableAt: at,
      createdAt: at,
      idempotencyKey: `schedule:${eventId}:${type}:${userId}`
    }, { at, expectedRevision: null }), "outbox");
  }
};

// src/server/staff-schedule-service.ts
import { nanoid as nanoid11 } from "nanoid";
function response7(status, code, message, details) {
  return { status, body: { code, message, ...details ? { details } : {} } };
}
function date(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && (/* @__PURE__ */ new Date(`${value}T00:00:00.000Z`)).toISOString().slice(0, 10) === value;
}
function json(value) {
  return JSON.parse(JSON.stringify(value));
}
var StaffScheduleService = class {
  constructor(executor, options) {
    this.executor = executor;
    this.options = options;
    this.createId = options.createId ?? (() => nanoid11());
  }
  executor;
  options;
  createId;
  saveProfile(metadata, userId, input) {
    return this.command(metadata, "staff.profile.save", "staff:manage", json({ userId, ...input }), (context, actorId) => {
      if (context.transaction.repositories.staff.userStatus(userId) === void 0) return response7(404, "USER_NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      if (!input.position?.trim() || !date(input.hiredOn) || input.dismissedOn && !date(input.dismissedOn)) return response7(400, "BAD_PROFILE", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430");
      if (input.status === "active" && input.dismissedOn || input.status === "dismissed" && !input.dismissedOn) return response7(400, "BAD_EMPLOYMENT_STATUS", "\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0432\u043E\u043B\u044C\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D \u0441 \u0434\u0430\u0442\u043E\u0439");
      const current = context.transaction.repositories.staff.profile(userId);
      const expected = current ? String(input.expectedVersion ?? -1) : null;
      if (current && expected !== current.revision) return response7(409, "STALE_PROFILE", "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D", { currentVersion: Number(current.revision) });
      const profile2 = { userId, personnelNumber: input.personnelNumber?.trim() || void 0, position: input.position.trim(), hiredOn: input.hiredOn, dismissedOn: input.dismissedOn, status: input.status, version: current ? Number(current.revision) + 1 : 0 };
      const saved = context.transaction.repositories.staff.saveProfile(profile2, expected, context.clock.now());
      if (!current && saved.outcome !== "created" || current && saved.outcome !== "updated") throw new Error("employee profile conditional write failed");
      this.audit(context, actorId, "employee_profile", userId, current ? "update" : "create", json(profile2));
      return { status: current ? 200 : 201, body: json(profile2) };
    });
  }
  recordHrEvent(metadata, input) {
    return this.command(metadata, "staff.hr_event.create", "staff:manage", json(input), (context, actorId) => {
      const endDate = input.endDate || input.startDate;
      if (!date(input.startDate) || !date(endDate) || input.startDate > endDate || !["vacation", "sick_leave", "late", "no_show", "partial_shift"].includes(input.type)) return response7(400, "BAD_HR_EVENT", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043A\u0430\u0434\u0440\u043E\u0432\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435");
      if (context.transaction.repositories.staff.userStatus(input.userId) === void 0) return response7(404, "USER_NOT_FOUND", "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      if (input.type === "late" !== (Number.isSafeInteger(input.minutesLate) && Number(input.minutesLate) > 0)) return response7(400, "BAD_LATE_MINUTES", "\u0414\u043B\u044F \u043E\u043F\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043C\u0438\u043D\u0443\u0442\u044B");
      if (input.shiftId) {
        const shift = context.transaction.repositories.schedule.findShift(input.shiftId);
        if (!shift || !shift.entity.employeeIds.includes(input.userId)) return response7(409, "SHIFT_ASSIGNMENT_REQUIRED", "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u043D\u0430 \u0441\u043C\u0435\u043D\u0443");
      }
      const at = context.clock.now();
      const event = { id: this.createId("hr"), userId: input.userId, type: input.type, startDate: input.startDate, endDate, shiftId: input.shiftId, minutesLate: input.type === "late" ? input.minutesLate : void 0, comment: input.comment?.trim() || "", createdByUserId: actorId, createdAt: at };
      if (!context.transaction.repositories.staff.appendHrEvent(event, at)) throw new Error("HR event insert collided");
      this.audit(context, actorId, "hr_event", event.id, "create", json(event));
      return { status: 201, body: json(event) };
    });
  }
  createExchange(metadata, input) {
    return this.command(metadata, "schedule.exchange.create", void 0, input, (context, actorId) => {
      const repositories = context.transaction.repositories;
      const from = repositories.schedule.findShift(input.fromShiftId);
      const to = repositories.schedule.findShift(input.toShiftId);
      if (!from || !to || from.entity.id === to.entity.id) return response7(400, "BAD_EXCHANGE_SHIFTS", "\u041D\u0443\u0436\u043D\u044B \u0434\u0432\u0435 \u0440\u0430\u0437\u043D\u044B\u0435 \u0441\u043C\u0435\u043D\u044B");
      if (from.entity.status !== "scheduled" || to.entity.status !== "scheduled") return response7(409, "SHIFT_NOT_SCHEDULED", "\u041E\u0431\u043C\u0435\u043D \u0432\u043E\u0437\u043C\u043E\u0436\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0441\u043C\u0435\u043D");
      if (!from.entity.employeeIds.includes(actorId)) return response7(403, "SOURCE_ASSIGNMENT_REQUIRED", "\u041C\u043E\u0436\u043D\u043E \u043E\u0431\u043C\u0435\u043D\u044F\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u044E \u0441\u043C\u0435\u043D\u0443");
      const candidates = to.entity.employeeIds.filter((id) => id !== actorId && repositories.staff.userStatus(id) === "active");
      if (candidates.length !== 1) return response7(409, "TARGET_ASSIGNMENT_AMBIGUOUS", "\u0412\u043E \u0432\u0442\u043E\u0440\u043E\u0439 \u0441\u043C\u0435\u043D\u0435 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043E\u0434\u0438\u043D \u0434\u0440\u0443\u0433\u043E\u0439 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A");
      const toUserId = candidates[0];
      const warnings = [
        ...repositories.staff.absenceWarnings(toUserId, from.entity),
        ...repositories.staff.absenceWarnings(actorId, to.entity),
        ...repositories.schedule.findAssignmentConflicts({ date: from.entity.date, start: from.entity.start, end: from.entity.end, userIds: [toUserId], excludeShiftId: to.entity.id }).map(() => "\u0423 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F \u0435\u0441\u0442\u044C \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435 \u0441\u043C\u0435\u043D"),
        ...repositories.schedule.findAssignmentConflicts({ date: to.entity.date, start: to.entity.start, end: to.entity.end, userIds: [actorId], excludeShiftId: from.entity.id }).map(() => "\u0423 \u0438\u043D\u0438\u0446\u0438\u0430\u0442\u043E\u0440\u0430 \u0435\u0441\u0442\u044C \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435 \u0441\u043C\u0435\u043D")
      ];
      const at = context.clock.now();
      const exchange2 = { id: this.createId("exchange"), fromShiftId: from.entity.id, toShiftId: to.entity.id, fromUserId: actorId, toUserId, fromShiftRevision: from.revision, toShiftRevision: to.revision, status: "pending", warnings: [...new Set(warnings)], createdAt: at };
      const saved = repositories.staff.saveExchange(exchange2, null, at);
      if (saved.outcome !== "created") return response7(409, "EXCHANGE_ALREADY_PENDING", "\u0422\u0430\u043A\u043E\u0439 \u043E\u0431\u043C\u0435\u043D \u0443\u0436\u0435 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430");
      this.audit(context, actorId, "shift_exchange", exchange2.id, "create", json(exchange2));
      this.deliver(context, [toUserId], "exchange.requested", exchange2.id, json(exchange2));
      return { status: 201, body: json(exchange2) };
    });
  }
  resolveExchange(metadata, exchangeId, action) {
    return this.command(metadata, "schedule.exchange.resolve", void 0, { exchangeId, action }, (context, actorId, permissions2) => {
      const repositories = context.transaction.repositories;
      const current = repositories.staff.exchange(exchangeId);
      if (!current) return response7(404, "EXCHANGE_NOT_FOUND", "\u041E\u0431\u043C\u0435\u043D \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      if (current.entity.status === "accepted" && action === "cancel") {
        if (!permissions2.includes("schedule:manage")) return response7(403, "ADMIN_REQUIRED", "\u041F\u0440\u0438\u043D\u044F\u0442\u044B\u0439 \u043E\u0431\u043C\u0435\u043D \u043E\u0442\u043C\u0435\u043D\u044F\u0435\u0442 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440");
        return this.revertAccepted(context, actorId, current);
      }
      if (current.entity.status !== "pending") return response7(409, "STALE_EXCHANGE", "\u041E\u0431\u043C\u0435\u043D \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D");
      if (action === "cancel" ? actorId !== current.entity.fromUserId : actorId !== current.entity.toUserId) return response7(403, "EXCHANGE_ACTOR_MISMATCH", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u044D\u0442\u043E\u043C\u0443 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0443");
      if (action !== "accept") return this.finishExchange(context, actorId, current, action === "decline" ? "declined" : "cancelled");
      const from = repositories.schedule.findShift(current.entity.fromShiftId);
      const to = repositories.schedule.findShift(current.entity.toShiftId);
      if (!from || !to || from.revision !== current.entity.fromShiftRevision || to.revision !== current.entity.toShiftRevision) return this.finishExchange(context, actorId, current, "expired", 409);
      if (!from.entity.employeeIds.includes(current.entity.fromUserId) || !to.entity.employeeIds.includes(current.entity.toUserId)) return this.finishExchange(context, actorId, current, "expired", 409);
      this.swapAssignments(context, actorId, from, to, current.entity.fromUserId, current.entity.toUserId);
      return this.finishExchange(context, actorId, current, "accepted");
    });
  }
  swapAssignments(context, actorId, from, to, fromUserId, toUserId) {
    const first5 = { ...from.entity, employeeIds: from.entity.employeeIds.map((id) => id === fromUserId ? toUserId : id) };
    const second = { ...to.entity, employeeIds: to.entity.employeeIds.map((id) => id === toUserId ? fromUserId : id) };
    if (context.transaction.repositories.schedule.saveShift(first5, { at: context.clock.now(), expectedRevision: from.revision, assignedByUserId: actorId }).outcome !== "updated") throw new Error("exchange source shift CAS failed");
    if (context.transaction.repositories.schedule.saveShift(second, { at: context.clock.now(), expectedRevision: to.revision, assignedByUserId: actorId }).outcome !== "updated") throw new Error("exchange target shift CAS failed");
  }
  revertAccepted(context, actorId, current) {
    const from = context.transaction.repositories.schedule.findShift(current.entity.fromShiftId);
    const to = context.transaction.repositories.schedule.findShift(current.entity.toShiftId);
    if (!from || !to || !from.entity.employeeIds.includes(current.entity.toUserId) || !to.entity.employeeIds.includes(current.entity.fromUserId)) return response7(409, "EXCHANGE_REVERT_CONFLICT", "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0443\u0436\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C");
    this.swapAssignments(context, actorId, from, to, current.entity.toUserId, current.entity.fromUserId);
    return this.finishExchange(context, actorId, current, "cancelled");
  }
  finishExchange(context, actorId, current, status, httpStatus = 200) {
    const at = context.clock.now();
    const next = { ...current.entity, status, resolvedAt: at, resolvedByUserId: actorId };
    if (context.transaction.repositories.staff.saveExchange(next, current.revision, at).outcome !== "updated") throw new Error("exchange CAS failed");
    this.audit(context, actorId, "shift_exchange", next.id, status, { exchangeId: next.id, status });
    this.deliver(context, context.transaction.repositories.staff.activeUserIds(), `exchange.${status}`, next.id, { exchangeId: next.id, status });
    return { status: httpStatus, body: json(next) };
  }
  command(metadata, scope, permission, request, run) {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", ...response7(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      const auth = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (auth.outcome !== "found" || permission && !auth.snapshot.permissions.includes(permission)) return { outcome: "rejected", ...response7(403, "FORBIDDEN", "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432") };
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, auth.snapshot.userId, auth.snapshot.permissions));
    }, { transactionMode: "immediate" });
  }
  audit(context, actorId, entity, entityId, action, changes) {
    const at = context.clock.now();
    const result = context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("staff audit insert collided");
  }
  deliver(context, userIds, type, eventId, payload) {
    const at = context.clock.now();
    for (const userId of [...new Set(userIds)]) {
      const notification = context.transaction.repositories.notifications.append({ id: this.createId("notification"), channel: "webapp", userId, type, payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } }, read: false, createdAt: at }, { at, expectedRevision: null });
      if (notification.outcome !== "created") throw new Error("exchange notification insert collided");
      const outbox = context.transaction.repositories.outbox.enqueue({ id: this.createId("outbox"), channel: "telegram", userId, type, payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } }, status: "pending", attemptCount: 0, maxAttempts: this.options.outboxMaxAttempts, availableAt: at, createdAt: at, idempotencyKey: `exchange:${eventId}:${type}:${userId}` }, { at, expectedRevision: null });
      if (outbox.outcome !== "created") throw new Error("exchange outbox insert collided");
    }
  }
};

// src/server/sqlite-staff-schedule-repositories.ts
function profile(row) {
  const version2 = Number(row.version);
  return { entity: { userId: String(row.user_id), personnelNumber: row.personnel_number === null ? void 0 : String(row.personnel_number), position: String(row.position), hiredOn: String(row.hired_on), dismissedOn: row.dismissed_on === null ? void 0 : String(row.dismissed_on), status: row.status, version: version2 }, revision: String(version2) };
}
function exchange(row) {
  const parsed = JSON.parse(String(row.warning_json));
  return { entity: { id: String(row.id), fromShiftId: String(row.from_shift_id), toShiftId: String(row.to_shift_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), fromShiftRevision: String(row.from_shift_version), toShiftRevision: String(row.to_shift_version), status: row.status, warnings: parsed.value?.warnings ?? parsed.value?.conflicts ?? [], createdAt: String(row.created_at), resolvedAt: row.resolved_at === null ? void 0 : String(row.resolved_at), resolvedByUserId: row.resolved_by_user_id === null ? void 0 : String(row.resolved_by_user_id) }, revision: String(row.version) };
}
function createSqliteStaffScheduleRepositories(database2) {
  const schedule = createSqliteScheduleCommandRepositories(database2);
  const currentProfile = (userId) => {
    const row = database2.query("SELECT * FROM employee_profiles WHERE user_id=?", [userId])[0];
    return row ? profile(row) : void 0;
  };
  const currentExchange = (id) => {
    const row = database2.query("SELECT * FROM shift_exchange_requests WHERE id=?", [id])[0];
    return row ? exchange(row) : void 0;
  };
  return {
    ...schedule,
    staff: {
      userStatus(userId) {
        return database2.query("SELECT status FROM users WHERE id=?", [userId])[0]?.status;
      },
      activeUserIds() {
        return database2.query("SELECT id FROM users WHERE status='active' ORDER BY id").map((row) => row.id);
      },
      profile: currentProfile,
      saveProfile(value, expectedRevision2, at) {
        if (expectedRevision2 === null) {
          const inserted = database2.execute("INSERT INTO employee_profiles(user_id,personnel_number,position,hired_on,dismissed_on,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT DO NOTHING", [value.userId, value.personnelNumber ?? null, value.position, value.hiredOn, value.dismissedOn ?? null, value.status, at, at]);
          const current2 = currentProfile(value.userId);
          if (!current2) throw new Error("employee profile insert collision");
          return inserted.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
        }
        const expected = Number(expectedRevision2);
        const updated = database2.execute("UPDATE employee_profiles SET personnel_number=?,position=?,hired_on=?,dismissed_on=?,status=?,version=version+1,updated_at=? WHERE user_id=? AND version=?", [value.personnelNumber ?? null, value.position, value.hiredOn, value.dismissedOn ?? null, value.status, at, value.userId, expected]);
        const current = currentProfile(value.userId);
        if (updated.changes === 1 && current) return { outcome: "updated", record: current };
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      },
      appendHrEvent(value, at) {
        return database2.execute("INSERT INTO hr_events(id,user_id,type,start_date,end_date,shift_id,minutes_late,comment,created_by_user_id,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?) ON CONFLICT DO NOTHING", [value.id, value.userId, value.type, value.startDate, value.endDate, value.shiftId ?? null, value.minutesLate ?? null, value.comment, value.createdByUserId, value.createdAt, at]).changes === 1;
      },
      exchange: currentExchange,
      saveExchange(value, expectedRevision2, at) {
        const warningJson = JSON.stringify({ schemaVersion: 1, value: { warnings: value.warnings } });
        if (expectedRevision2 === null) {
          const inserted = database2.execute("INSERT INTO shift_exchange_requests(id,from_shift_id,to_shift_id,from_user_id,to_user_id,from_shift_version,to_shift_version,status,warning_json,created_at,resolved_at,resolved_by_user_id,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT DO NOTHING", [value.id, value.fromShiftId, value.toShiftId, value.fromUserId, value.toUserId, Number(value.fromShiftRevision), Number(value.toShiftRevision), value.status, warningJson, value.createdAt, value.resolvedAt ?? null, value.resolvedByUserId ?? null, at]);
          const current2 = currentExchange(value.id) ?? database2.query("SELECT * FROM shift_exchange_requests WHERE from_shift_id=? AND to_shift_id=? AND from_user_id=? AND to_user_id=? AND status='pending'", [value.fromShiftId, value.toShiftId, value.fromUserId, value.toUserId]).map(exchange)[0];
          if (!current2) throw new Error("exchange insert collision");
          return inserted.changes === 1 ? { outcome: "created", record: current2 } : { outcome: "duplicate", current: current2 };
        }
        const expected = Number(expectedRevision2);
        const updated = database2.execute("UPDATE shift_exchange_requests SET status=?,warning_json=?,resolved_at=?,resolved_by_user_id=?,version=version+1,updated_at=? WHERE id=? AND version=?", [value.status, warningJson, value.resolvedAt ?? null, value.resolvedByUserId ?? null, at, value.id, expected]);
        const current = currentExchange(value.id);
        if (updated.changes === 1 && current) return { outcome: "updated", record: current };
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      },
      absenceWarnings(userId, value) {
        return database2.query("SELECT DISTINCT type FROM hr_events WHERE user_id=? AND start_date<=? AND end_date>=? AND type IN ('vacation','sick_leave','no_show') ORDER BY type", [userId, value.date, value.date]).map((row) => `\u041A\u0430\u0434\u0440\u043E\u0432\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435: ${row.type}`);
      }
    }
  };
}

// src/server/unit-of-work.ts
init_database();
var UnitOfWork = class {
  constructor(database2, createRepositories) {
    this.database = database2;
    this.createRepositories = createRepositories;
  }
  database;
  createRepositories;
  active = false;
  transaction(run, options = {}) {
    if (this.active) throw new DatabaseError("transaction", "NESTED_TRANSACTION_FORBIDDEN");
    this.active = true;
    try {
      return this.database.transaction((database2) => run(Object.freeze({
        database: database2,
        repositories: this.createRepositories(database2)
      })), options);
    } finally {
      this.active = false;
    }
  }
};

// src/server/launch-scope.ts
var routeMatchers = [
  { feature: "tablet_buffer", matches: (path7) => path7 === "/api/stock/buffer/apply" },
  { feature: "imports", matches: (path7) => path7 === "/api/imports" || path7.startsWith("/api/imports/") },
  { feature: "merge", matches: (path7) => path7 === "/api/merges" || path7.startsWith("/api/merges/") },
  { feature: "archive_sweep", matches: (path7) => path7 === "/api/products/archive/preview" || path7 === "/api/products/archive/commit" },
  { feature: "schedule_rotation", matches: (path7) => path7 === "/api/schedule/rotation/preview" || path7 === "/api/schedule/rotation/commit" },
  { feature: "future_replacement", matches: (path7) => path7 === "/api/schedule/future-replacement/preview" || path7 === "/api/schedule/future-replacement/commit" },
  { feature: "external_media_url", matches: (path7) => path7 === "/api/media/validate-link" },
  { feature: "telegram_report_delivery", matches: (path7) => /^\/api\/reports\/[^/]+\/telegram$/.test(path7) }
];
function deferredLaunchFeatureForRoute(path7) {
  return routeMatchers.find((entry) => entry.matches(path7))?.feature;
}

// src/server/sqlite-catalog-query-service.ts
init_quantity();
function productFromRow(database2, row) {
  const mapped = productMapper.fromRow(row);
  const identifiers = database2.query("SELECT * FROM product_identifiers WHERE product_id = ? ORDER BY id", [mapped.id]).map((identifier2) => {
    const { normalizedValue: _normalizedValue, createdAt: _createdAt2, ...value } = productIdentifierMapper.fromRow(identifier2);
    return value;
  });
  const { createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...product } = mapped;
  return { ...product, identifiers };
}
function shiftFromRow(database2, row) {
  const mapped = shiftMapper.fromRow(row);
  const employeeIds = database2.query("SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id", [mapped.id]).map((assignment) => shiftAssignmentMapper.fromRow(assignment).userId);
  const {
    scheduleDayId: _scheduleDayId,
    version: _version,
    createdByUserId: _createdByUserId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    revision: _revision,
    ...shift
  } = mapped;
  return { shift: { ...shift, employeeIds }, revision: mapped.revision };
}
var SqlCatalogQueryService = class {
  constructor(database2) {
    this.database = database2;
  }
  database;
  products(input) {
    const status = input.status && input.status !== "all" ? input.status : void 0;
    const search = input.search?.trim().toLowerCase();
    const clauses = [];
    const parameters = [];
    if (status) {
      clauses.push("p.status = ?");
      parameters.push(status);
    }
    if (search) {
      for (const term of search.split(/\s+/).filter(Boolean)) {
        const like = `%${term}%`;
        clauses.push("(dvorik_normalize_search(p.official_name) LIKE ? OR dvorik_normalize_search(p.local_name) LIKE ? OR dvorik_normalize_search(p.category) LIKE ? OR EXISTS (SELECT 1 FROM json_each(p.tags_json) tag WHERE dvorik_normalize_search(tag.value) LIKE ?) OR EXISTS (SELECT 1 FROM product_identifiers pi WHERE pi.product_id = p.id AND dvorik_normalize_search(pi.value) LIKE ?))");
        parameters.push(like, like, like, like, like);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = this.database.query(`SELECT count(*) count FROM products p ${where}`, parameters)[0]?.count ?? 0;
    const rows = this.database.query(
      `SELECT p.* FROM products p ${where} ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC LIMIT ? OFFSET ?`,
      [...parameters, input.limit, (input.page - 1) * input.limit]
    );
    return { items: rows.map((row) => productFromRow(this.database, row)), total, page: input.page, limit: input.limit };
  }
  productById(id) {
    const row = this.database.query("SELECT * FROM products WHERE id = ?", [id])[0];
    return row ? productFromRow(this.database, row) : void 0;
  }
  groups() {
    return this.database.query("SELECT * FROM product_groups ORDER BY name COLLATE NOCASE, id").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      inventoryKind: row.inventory_kind,
      status: row.status,
      version: Number(row.version)
    }));
  }
  manufacturers() {
    return this.database.query("SELECT * FROM manufacturers ORDER BY name COLLATE NOCASE, id").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      status: row.status,
      version: Number(row.version)
    }));
  }
  packagings(productId) {
    return this.database.query("SELECT * FROM product_packagings WHERE product_id = ? ORDER BY is_primary DESC, name COLLATE NOCASE, id", [productId]).map((row) => ({
      id: String(row.id),
      productId: String(row.product_id),
      name: String(row.name),
      unitsPerPackage: Number(row.units_per_package),
      massGrams: row.mass_grams === null ? void 0 : Number(row.mass_grams),
      isPrimary: Number(row.is_primary) === 1,
      version: Number(row.version)
    }));
  }
  prices(input) {
    const field = input.groupId ? "group_id" : "product_id";
    const value = input.groupId ?? input.productId;
    if (!value) return [];
    return this.database.query(`SELECT * FROM product_price_history WHERE ${field} = ? ORDER BY effective_from DESC, id DESC`, [value]).map((row) => ({
      id: String(row.id),
      groupId: row.group_id === null ? void 0 : String(row.group_id),
      productId: row.product_id === null ? void 0 : String(row.product_id),
      priceKopecks: Number(row.price_kopecks),
      priceUnit: row.price_unit,
      effectiveFrom: String(row.effective_from),
      createdByUserId: row.created_by_user_id === null ? void 0 : String(row.created_by_user_id),
      createdAt: String(row.created_at)
    }));
  }
  totals() {
    return this.database.query("SELECT * FROM inventory_balances ORDER BY product_id").map((row) => ({
      productId: String(row.product_id),
      quantity: quantityFromMinor(Number(row.quantity_minor)),
      version: Number(row.version)
    }));
  }
  activeInventorySession() {
    const session2 = this.database.query("SELECT * FROM inventory_sessions WHERE status IN ('active','closing') ORDER BY started_at,id LIMIT 1")[0];
    if (!session2) return null;
    const rows = this.database.query("SELECT * FROM inventory_session_rows WHERE session_id=? ORDER BY product_id", [String(session2.id)]).map((row) => ({
      sessionId: String(row.session_id),
      productId: String(row.product_id),
      expected: quantityFromMinor(Number(row.expected_quantity_minor)),
      actual: row.actual_quantity_minor === null ? void 0 : quantityFromMinor(Number(row.actual_quantity_minor)),
      version: Number(row.version)
    }));
    return { session: { id: String(session2.id), status: String(session2.status), actorId: String(session2.actor_id), comment: String(session2.comment), startedAt: String(session2.started_at), completedAt: session2.completed_at === null ? void 0 : String(session2.completed_at), version: Number(session2.version) }, rows };
  }
  consumptions(limit = 100) {
    return this.database.query("SELECT * FROM consumption_records ORDER BY created_at DESC,id DESC LIMIT ?", [limit]).map((row) => ({
      id: String(row.id),
      productId: String(row.product_id),
      quantity: quantityFromMinor(Number(row.quantity_minor)),
      source: String(row.source),
      inventorySessionId: row.inventory_session_id === null ? void 0 : String(row.inventory_session_id),
      stockOperationId: String(row.stock_operation_id),
      actorId: String(row.actor_id),
      comment: String(row.comment),
      createdAt: String(row.created_at)
    }));
  }
  locations() {
    return this.database.query("SELECT * FROM locations WHERE status = 'active' ORDER BY name COLLATE NOCASE ASC, id ASC").map((row) => {
      const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...location } = locationMapper.fromRow(row);
      return location;
    });
  }
  locationById(id) {
    const row = this.database.query("SELECT * FROM locations WHERE id = ?", [id])[0];
    if (!row) return void 0;
    const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...location } = locationMapper.fromRow(row);
    return location;
  }
  balances() {
    return this.balanceRows();
  }
  balanceRows(locationId) {
    return this.database.query(
      `SELECT b.*, p.unit FROM stock_balances b JOIN products p ON p.id = b.product_id ${locationId ? "WHERE b.location_id = ?" : ""} ORDER BY b.product_id ASC, b.location_id ASC`,
      locationId ? [locationId] : []
    ).map((row) => {
      const unit = typeof row.unit === "string" ? row.unit : void 0;
      if (!unit) throw new Error("Balance product unit missing");
      const { updatedAt: _updatedAt, revision: _revision, ...balance } = stockBalanceMapper.fromRow(row, unit);
      return balance;
    });
  }
  inventorySnapshot(locationId) {
    return this.balanceRows(locationId).map((balance) => ({ productId: balance.productId, locationId, expected: balance.quantity, version: balance.version }));
  }
  operations(limit = 100) {
    return this.database.query(
      "SELECT o.*, p.unit FROM stock_operations o JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC, o.id DESC LIMIT ?",
      [limit]
    ).map((row) => {
      const unit = typeof row.unit === "string" ? row.unit : void 0;
      if (!unit) throw new Error("Operation product unit missing");
      const { metadata: _metadata, ...operation } = stockOperationMapper.fromRow(row, unit);
      return { ...operation, idempotencyKey: operation.idempotencyKey ?? "" };
    });
  }
  shifts(input) {
    const clauses = [];
    const parameters = [];
    if (input.from) {
      clauses.push("s.local_date >= ?");
      parameters.push(input.from);
    }
    if (input.to) {
      clauses.push("s.local_date <= ?");
      parameters.push(input.to);
    }
    if (input.userId) {
      clauses.push("EXISTS (SELECT 1 FROM shift_assignments sa WHERE sa.shift_id = s.id AND sa.user_id = ?)");
      parameters.push(input.userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query(
      `SELECT s.* FROM shifts s ${where} ORDER BY s.local_date ASC, s.start_time ASC, s.id ASC`,
      parameters
    ).map((row) => shiftFromRow(this.database, row).shift);
  }
  shiftForWrite(id) {
    const row = this.database.query("SELECT * FROM shifts WHERE id = ?", [id])[0];
    return row ? shiftFromRow(this.database, row) : void 0;
  }
  dayRevision(date2, locationId) {
    const row = this.database.query("SELECT * FROM schedule_days WHERE local_date = ? AND location_id = ?", [date2, locationId])[0];
    return row ? scheduleDayMapper.fromRow(row).version : null;
  }
  swaps(input) {
    const rows = input.userId ? this.database.query("SELECT * FROM shift_swap_requests WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC, id DESC", [input.userId, input.userId]) : this.database.query("SELECT * FROM shift_swap_requests ORDER BY created_at DESC, id DESC");
    return rows.map((row) => {
      const { sourceShiftRevision: _sourceShiftRevision, version: _version, updatedAt: _updatedAt, resolvedAt: _resolvedAt, resolvedByUserId: _resolvedByUserId, revision: _revision, ...swap } = shiftSwapRequestMapper.fromRow(row);
      return input.userId ? (({ fromShiftId: _fromShiftId, ...seller }) => seller)(swap) : swap;
    });
  }
  employeeProfiles() {
    return this.database.query("SELECT * FROM employee_profiles ORDER BY status,position COLLATE NOCASE,user_id").map((row) => ({
      userId: String(row.user_id),
      personnelNumber: row.personnel_number === null ? void 0 : String(row.personnel_number),
      position: String(row.position),
      hiredOn: String(row.hired_on),
      dismissedOn: row.dismissed_on === null ? void 0 : String(row.dismissed_on),
      status: row.status,
      version: Number(row.version)
    }));
  }
  hrEvents(input) {
    const clauses = [];
    const parameters = [];
    if (input.userId) {
      clauses.push("user_id=?");
      parameters.push(input.userId);
    }
    if (input.from) {
      clauses.push("end_date>=?");
      parameters.push(input.from);
    }
    if (input.to) {
      clauses.push("start_date<=?");
      parameters.push(input.to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query(`SELECT * FROM hr_events ${where} ORDER BY start_date DESC,created_at DESC,id DESC`, parameters).map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      type: row.type,
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      shiftId: row.shift_id === null ? void 0 : String(row.shift_id),
      minutesLate: row.minutes_late === null ? void 0 : Number(row.minutes_late),
      comment: String(row.comment),
      createdByUserId: String(row.created_by_user_id),
      createdAt: String(row.created_at)
    }));
  }
  exchanges(userId) {
    const rows = userId ? this.database.query("SELECT * FROM shift_exchange_requests WHERE from_user_id=? OR to_user_id=? ORDER BY created_at DESC,id DESC", [userId, userId]) : this.database.query("SELECT * FROM shift_exchange_requests ORDER BY created_at DESC,id DESC");
    return rows.map((row) => {
      const parsed = JSON.parse(String(row.warning_json));
      return { id: String(row.id), fromShiftId: String(row.from_shift_id), toShiftId: String(row.to_shift_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), status: row.status, warnings: parsed.value?.warnings ?? [], createdAt: String(row.created_at), resolvedAt: row.resolved_at === null ? void 0 : String(row.resolved_at) };
    });
  }
  days(input) {
    const clauses = [];
    const parameters = [];
    if (input.from) {
      clauses.push("d.local_date >= ?");
      parameters.push(input.from);
    }
    if (input.to) {
      clauses.push("d.local_date <= ?");
      parameters.push(input.to);
    }
    if (input.userId) {
      clauses.push("EXISTS (SELECT 1 FROM shifts s JOIN shift_assignments sa ON sa.shift_id = s.id WHERE s.local_date = d.local_date AND s.location_id = d.location_id AND sa.user_id = ?)");
      parameters.push(input.userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query(
      `SELECT d.* FROM schedule_days d ${where} ORDER BY d.local_date ASC, d.location_id ASC, d.id ASC`,
      parameters
    ).map((row) => {
      const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision: _revision, ...day } = scheduleDayMapper.fromRow(row);
      return day;
    });
  }
  audit(limit = 100) {
    return this.database.query("SELECT * FROM audit_entries ORDER BY created_at DESC, id DESC LIMIT ?", [limit]).map((row) => {
      const mapped = auditEntryFromRow(row).entity;
      return {
        id: mapped.id,
        actorId: mapped.actorId ?? "system",
        entity: mapped.entity,
        entityId: mapped.entityId,
        action: mapped.action,
        changes: mapped.changes.value,
        createdAt: mapped.createdAt
      };
    });
  }
  reportRows(type, query) {
    if (type === "movements") return this.movementRows(query);
    if (type === "discrepancies") return this.movementRows(query, true).filter((row) => row.inventoryExpected !== null);
    if (!query.locationId) {
      const clauses2 = [];
      const parameters2 = [];
      if (query.productId) {
        clauses2.push("b.product_id = ?");
        parameters2.push(query.productId);
      }
      if (type === "low") clauses2.push("b.quantity_minor > 0 AND b.quantity_minor <= p.low_stock_threshold_minor");
      if (type === "zero") clauses2.push("b.quantity_minor = 0");
      if (type === "archive") clauses2.push("p.status = 'archived'");
      const where2 = clauses2.length ? `WHERE ${clauses2.join(" AND ")}` : "";
      return this.database.query(
        `SELECT p.local_name, p.official_name, p.status AS product_status, '\u041E\u0431\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A' AS location_name,
                CAST(b.quantity_minor AS REAL) / 1000.0 AS quantity, p.low_stock_threshold
         FROM inventory_balances b JOIN products p ON p.id = b.product_id ${where2}
         ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC`,
        parameters2
      ).map((row) => ({ productName: typeof row.local_name === "string" && row.local_name || String(row.official_name), productStatus: String(row.product_status), locationName: String(row.location_name), quantity: Number(row.quantity), threshold: Number(row.low_stock_threshold) }));
    }
    const clauses = [];
    const parameters = [];
    if (query.productId) {
      clauses.push("b.product_id = ?");
      parameters.push(query.productId);
    }
    if (query.locationId) {
      clauses.push("b.location_id = ?");
      parameters.push(query.locationId);
    }
    if (type === "low") clauses.push("b.quantity > 0 AND b.quantity <= p.low_stock_threshold");
    if (type === "zero") clauses.push("b.quantity = 0");
    if (type === "archive") clauses.push("p.status = 'archived'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query(
      `SELECT p.local_name, p.official_name, p.status AS product_status, l.name AS location_name, b.quantity, p.low_stock_threshold
       FROM stock_balances b JOIN products p ON p.id = b.product_id JOIN locations l ON l.id = b.location_id
       ${where} ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC, l.name COLLATE NOCASE ASC, l.id ASC`,
      parameters
    ).map((row) => ({
      productName: typeof row.local_name === "string" && row.local_name || String(row.official_name),
      productStatus: String(row.product_status),
      locationName: String(row.location_name),
      quantity: Number(row.quantity),
      threshold: Number(row.low_stock_threshold)
    }));
  }
  summary(input) {
    const counts = this.database.query(
      `SELECT
         (SELECT count(*) FROM products WHERE status = 'active') AS activeProducts,
         (SELECT count(*) FROM inventory_balances b JOIN products p ON p.id = b.product_id WHERE b.quantity_minor <= p.low_stock_threshold_minor) AS lowStock,
         (SELECT count(*) FROM shifts s JOIN shift_assignments sa ON sa.shift_id = s.id WHERE s.local_date = ? AND s.status = 'in_progress') AS currentShiftEmployees`,
      [input.today]
    )[0] ?? { activeProducts: 0, lowStock: 0, currentShiftEmployees: 0 };
    const notificationRefs = this.database.query(
      `SELECT id, source FROM (
         SELECT id, created_at, 'webapp' AS source FROM webapp_notifications WHERE recipient_user_id = ? OR ? = 1
         UNION ALL
         SELECT id, created_at, 'telegram' AS source FROM outbox_messages WHERE channel = 'telegram' AND status = 'sent' AND (recipient_user_id = ? OR ? = 1)
       ) ORDER BY created_at DESC, id DESC LIMIT 5`,
      [input.userId, input.includeAllNotifications ? 1 : 0, input.userId, input.includeAllNotifications ? 1 : 0]
    );
    const notifications = notificationRefs.map((reference) => {
      if (reference.source === "webapp") {
        const row2 = this.database.query("SELECT * FROM webapp_notifications WHERE id = ?", [String(reference.id)])[0];
        if (!row2) throw new Error("Notification row disappeared");
        const notification = webappNotificationFromRow(row2).entity.notification;
        return { ...notification, payload: notification.payload.value };
      }
      const row = this.database.query("SELECT * FROM outbox_messages WHERE id = ?", [String(reference.id)])[0];
      if (!row) throw new Error("Outbox row disappeared");
      const message = outboxMessageFromRow(row).entity;
      return { id: message.id, channel: message.channel, userId: message.userId, type: message.type, payload: message.payload.value, read: true, createdAt: message.createdAt };
    });
    return { ...counts, latestOperations: this.operations(6), notifications };
  }
  movementRows(query, onlyInventoryAdjustments = false) {
    const clauses = [];
    const parameters = [];
    if (query.productId) {
      clauses.push("o.product_id = ?");
      parameters.push(query.productId);
    }
    if (query.locationId) {
      clauses.push("(o.from_location_id = ? OR o.to_location_id = ?)");
      parameters.push(query.locationId, query.locationId);
    }
    if (query.from) {
      clauses.push("substr(o.created_at, 1, 10) >= ?");
      parameters.push(query.from);
    }
    if (query.to) {
      clauses.push("substr(o.created_at, 1, 10) <= ?");
      parameters.push(query.to);
    }
    if (onlyInventoryAdjustments) clauses.push("o.type = 'inventory_adjustment'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query(
      `SELECT o.*, p.unit, p.local_name, p.official_name, fl.name AS from_location_name, tl.name AS to_location_name,
              u.first_name AS actor_first_name, u.last_name AS actor_last_name
       FROM stock_operations o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN locations fl ON fl.id = o.from_location_id
       LEFT JOIN locations tl ON tl.id = o.to_location_id
       LEFT JOIN users u ON u.id = o.actor_id
       ${where} ORDER BY o.created_at DESC, o.id DESC`,
      parameters
    ).map((row) => {
      const unit = row.unit;
      const operation = stockOperationMapper.fromRow(row, unit);
      const metadata = operation.metadata?.value ?? {};
      const number = (key) => typeof metadata[key] === "number" ? metadata[key] : null;
      const actorName = [row.actor_first_name, row.actor_last_name].filter((value) => typeof value === "string" && value.length > 0).join(" ") || operation.actorId;
      return {
        id: operation.id,
        occurredAt: operation.createdAt,
        type: operation.type,
        productId: operation.productId,
        productName: typeof row.local_name === "string" && row.local_name || typeof row.official_name === "string" && row.official_name || operation.productId,
        fromLocationId: operation.fromLocationId ?? null,
        fromLocationName: typeof row.from_location_name === "string" ? row.from_location_name : operation.fromLocationId ?? null,
        toLocationId: operation.toLocationId ?? null,
        toLocationName: typeof row.to_location_name === "string" ? row.to_location_name : operation.toLocationId ?? null,
        quantity: operation.quantity,
        actorId: operation.actorId,
        actorName,
        reason: operation.reason || "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E",
        reversedOperationId: operation.reversedOperationId ?? null,
        inventoryExpected: number("expected"),
        inventoryActual: number("actual"),
        inventoryDelta: number("delta")
      };
    });
  }
};

// src/server/telegram-production.ts
init_domain_core();
function handleProductionTelegramUpdate(update, hooks) {
  const updateId = Number(update.update_id);
  if (!Number.isInteger(updateId) || updateId < 0) return { ignored: true, reason: "invalid_update" };
  const from = update.message?.from || update.callback_query?.from;
  const text2 = String(update.message?.text || update.callback_query?.data || "").trim();
  if (!from) return { ignored: true, reason: "unsupported_update" };
  const user = hooks.resolveTelegramUser(String(from.id)) ?? hooks.registerTelegramApplicant({
    updateId,
    telegramUserId: String(from.id),
    firstName: String(from.first_name || ""),
    lastName: String(from.last_name || ""),
    username: String(from.username || "")
  });
  if (text2 === "/start") return { userId: user.id, status: user.status };
  if (!text2.startsWith("onboard:")) return { ignored: true, reason: "FEATURE_DISABLED" };
  const [, action, targetUserId, role] = text2.split(":");
  if (!targetUserId || action !== "approve" && action !== "reject") {
    throw new DomainError("BAD_ONBOARD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 onboarding");
  }
  if (action === "approve" && role !== "seller" && role !== "admin") {
    throw new DomainError("BAD_ONBOARD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 onboarding");
  }
  const resolved = hooks.resolveOnboarding({
    updateId,
    actorTelegramUserId: String(from.id),
    actorUserId: user.id,
    targetUserId,
    action,
    ...action === "approve" ? { role } : {}
  });
  return { userId: resolved.id, status: resolved.status };
}

// src/server/runtime-observability.ts
import { nanoid as nanoid12 } from "nanoid";
function requestCorrelationId(value) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(candidate) ? candidate : `http:${nanoid12()}`;
}
function safeLogPath(path7) {
  return path7.startsWith("/api/saby/webhook/") ? "/api/saby/webhook/[redacted]" : path7;
}
function securityHeaders(production) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...production ? {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
    } : {}
  };
}
function createHttpMetrics() {
  let requests = 0;
  let failures = 0;
  let inFlight = 0;
  const byStatus = /* @__PURE__ */ new Map();
  return {
    begin() {
      requests += 1;
      inFlight += 1;
    },
    complete(status) {
      inFlight = Math.max(0, inFlight - 1);
      byStatus.set(status, (byStatus.get(status) || 0) + 1);
      if (status >= 500) failures += 1;
    },
    prometheus() {
      const statuses2 = [...byStatus.entries()].sort(([left], [right]) => left - right).map(([status, count]) => `dvorik_http_responses_total{status="${status}"} ${count}`);
      return [
        "# TYPE dvorik_http_requests_total counter",
        `dvorik_http_requests_total ${requests}`,
        "# TYPE dvorik_http_failures_total counter",
        `dvorik_http_failures_total ${failures}`,
        "# TYPE dvorik_http_in_flight gauge",
        `dvorik_http_in_flight ${inFlight}`,
        ...statuses2,
        ""
      ].join("\n");
    }
  };
}
var unsafeMethods = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
var signedMutationPaths = /* @__PURE__ */ new Set(["/api/auth/telegram", "/api/telegram/webhook"]);
function crossOriginMutationRejected(input) {
  if (!unsafeMethods.has(input.method.toUpperCase()) || !input.path.startsWith("/api/") || signedMutationPaths.has(input.path) || input.path.startsWith("/api/saby/webhook/")) return false;
  if (input.secFetchSite?.toLowerCase() === "cross-site") return true;
  if (!input.origin) return false;
  try {
    return new URL(input.origin).origin !== `${input.protocol}://${input.host}`;
  } catch {
    return true;
  }
}
function isUnsafeApiMutation(method, path7) {
  return unsafeMethods.has(method.toUpperCase()) && path7.startsWith("/api/");
}
function createFixedWindowRateLimiter(input) {
  const now3 = input.now ?? Date.now;
  const entries = /* @__PURE__ */ new Map();
  return {
    allow(key) {
      const current = now3();
      const existing = entries.get(key);
      if (!existing || current - existing.startedAt >= input.windowMs) {
        entries.set(key, { startedAt: current, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      existing.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((input.windowMs - (current - existing.startedAt)) / 1e3));
      return { allowed: existing.count <= input.limit, retryAfterSeconds };
    }
  };
}
function invalidJsonPayload(value, depth = 0) {
  if (depth > 16) return true;
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return false;
  if (Array.isArray(value)) return value.length > 2e3 || value.some((item) => invalidJsonPayload(item, depth + 1));
  if (typeof value !== "object") return true;
  const entries = Object.entries(value);
  if (entries.length > 500) return true;
  return entries.some(([key, item]) => key === "__proto__" || key === "prototype" || key === "constructor" || invalidJsonPayload(item, depth + 1));
}

// src/server/route-policy.ts
var exactPolicies = /* @__PURE__ */ new Map([
  ["POST /api/products", { permission: "products:write" }],
  ["POST /api/product-groups", { permission: "products:write" }],
  ["POST /api/manufacturers", { permission: "products:write" }],
  ["POST /api/product-prices", { permission: "products:write" }],
  ["POST /api/locations", { permission: "products:write" }],
  ["POST /api/media/upload", { permission: "products:write" }],
  ["POST /api/stock/operations", { permission: "stock:move" }],
  ["POST /api/inventory/apply", { permission: "inventory:write" }],
  ["POST /api/inventory/sessions", { permission: "inventory:write" }],
  ["POST /api/consumption", { permission: "inventory:write" }],
  ["POST /api/stock/adjustments", { permission: "inventory:write" }],
  ["POST /api/schedule", { permission: "schedule:manage" }],
  ["POST /api/hr-events", { permission: "staff:manage" }],
  ["POST /api/labels/preview", { permission: "labels:print" }],
  ["POST /api/labels/pdf", { permission: "labels:print" }],
  ["POST /api/backups", { permission: "techlog:read" }],
  ["PUT /api/saby/mappings", { permission: "saby:manage" }]
]);
var patternPolicies = [
  { matches: (method, path7) => method === "PATCH" && /^\/api\/products\/[^/]+$/.test(path7), policy: { permission: "products:write" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/products\/[^/]+\/packagings$/.test(path7), policy: { permission: "products:write" } },
  { matches: (method, path7) => method === "PATCH" && /^\/api\/locations\/[^/]+$/.test(path7), policy: { permission: "products:write" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/stock\/operations\/[^/]+\/reverse$/.test(path7), policy: { permission: "techlog:read" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/inventory\/sessions\/[^/]+\/close$/.test(path7), policy: { permission: "inventory:write" } },
  { matches: (method, path7) => method === "PUT" && /^\/api\/schedule\/days\/[^/]+\/[^/]+$/.test(path7), policy: { permission: "schedule:manage" } },
  { matches: (method, path7) => method === "PATCH" && /^\/api\/schedule\/[^/]+$/.test(path7), policy: { permission: "schedule:manage" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/schedule\/[^/]+\/copy$/.test(path7), policy: { permission: "schedule:manage" } },
  { matches: (method, path7) => method === "PUT" && /^\/api\/staff\/[^/]+\/profile$/.test(path7), policy: { permission: "staff:manage" } },
  { matches: (method, path7) => method === "PATCH" && /^\/api\/users\/[^/]+$/.test(path7), policy: { permission: "users:manage" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/labels\/jobs\/[^/]+\/pdf$/.test(path7), policy: { permission: "labels:print" } },
  { matches: (method, path7) => method === "POST" && /^\/api\/backups\/[^/]+\/restore$/.test(path7), policy: { permission: "techlog:read" } }
];
function routePolicyFor(method, path7) {
  return exactPolicies.get(`${method.toUpperCase()} ${path7}`) ?? patternPolicies.find((entry) => entry.matches(method.toUpperCase(), path7))?.policy;
}

// src/server/sqlite-backup.ts
init_database();
import crypto3 from "node:crypto";
import fs4 from "node:fs";
import path4 from "node:path";
function sha256(filename) {
  return crypto3.createHash("sha256").update(fs4.readFileSync(filename)).digest("hex");
}
function filesUnder(root, prefix = "") {
  if (!fs4.existsSync(root)) return [];
  return fs4.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path4.posix.join(prefix, entry.name);
    const absolute2 = path4.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute2, relative) : entry.isFile() ? [relative] : [];
  });
}
function sqliteLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function manifestFor(bundlePath, createdAt) {
  const files = filesUnder(bundlePath).filter((relative) => relative !== "manifest.json").sort().map((relative) => {
    const filename = path4.join(bundlePath, relative);
    return { path: relative, bytes: fs4.statSync(filename).size, sha256: sha256(filename) };
  });
  return { schemaVersion: 1, createdAt, files };
}
function readManifest(bundlePath) {
  const parsed = JSON.parse(fs4.readFileSync(path4.join(bundlePath, "manifest.json"), "utf8"));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.files) || typeof parsed.createdAt !== "string") throw new Error("Invalid backup manifest");
  return parsed;
}
function verifySqliteBackupBundle(bundlePath) {
  const manifest = readManifest(bundlePath);
  if (!manifest.files.some((file) => file.path === "database.sqlite")) throw new Error("Backup database is missing");
  for (const file of manifest.files) {
    if (!/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(file.path)) throw new Error("Invalid backup manifest path");
    const filename = path4.join(bundlePath, file.path);
    if (!fs4.existsSync(filename) || fs4.statSync(filename).size !== file.bytes || sha256(filename) !== file.sha256) throw new Error(`Backup integrity mismatch: ${file.path}`);
  }
  const database2 = openDatabase(path4.join(bundlePath, "database.sqlite"));
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
function listSqliteBackupBundles(backupDirectory) {
  if (!fs4.existsSync(backupDirectory)) return [];
  return fs4.readdirSync(backupDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^dvorik-backup-[0-9TZ-]+$/.test(entry.name)).map((entry) => {
    const bundlePath = path4.join(backupDirectory, entry.name);
    const manifest = readManifest(bundlePath);
    return { name: entry.name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function createSqliteBackupBundle(input) {
  const now3 = input.now ?? /* @__PURE__ */ new Date();
  const name = `dvorik-backup-${now3.toISOString().replace(/[:.]/g, "-")}`;
  const bundlePath = path4.join(input.backupDirectory, name);
  fs4.mkdirSync(input.backupDirectory, { recursive: true });
  fs4.mkdirSync(bundlePath, { recursive: false });
  const databasePath = path4.join(bundlePath, "database.sqlite");
  try {
    input.database.execute(`VACUUM INTO ${sqliteLiteral(databasePath)}`);
    const snapshot = openDatabase(databasePath);
    snapshot.close();
    if (input.mediaDirectory && fs4.existsSync(input.mediaDirectory)) fs4.cpSync(input.mediaDirectory, path4.join(bundlePath, "media"), { recursive: true, errorOnExist: true });
    const manifest = manifestFor(bundlePath, now3.toISOString());
    fs4.writeFileSync(path4.join(bundlePath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}
`, { mode: 384 });
    verifySqliteBackupBundle(bundlePath);
    return { name, path: bundlePath, createdAt: manifest.createdAt, files: manifest.files.length };
  } catch (error) {
    fs4.rmSync(bundlePath, { recursive: true, force: true });
    throw error;
  }
}
function restoreSqliteBackupBundle(input) {
  const verified = verifySqliteBackupBundle(input.bundlePath);
  if (fs4.existsSync(input.databasePath)) throw new Error("Restore database path already exists");
  fs4.mkdirSync(path4.dirname(input.databasePath), { recursive: true });
  fs4.copyFileSync(path4.join(input.bundlePath, "database.sqlite"), input.databasePath, fs4.constants.COPYFILE_EXCL);
  if (input.mediaDirectory && fs4.existsSync(path4.join(input.bundlePath, "media"))) {
    if (fs4.existsSync(input.mediaDirectory)) throw new Error("Restore media path already exists");
    fs4.mkdirSync(path4.dirname(input.mediaDirectory), { recursive: true });
    fs4.cpSync(path4.join(input.bundlePath, "media"), input.mediaDirectory, { recursive: true, errorOnExist: true });
  }
  return { restoredAt: (/* @__PURE__ */ new Date()).toISOString(), migrations: verified.migrations };
}

// src/server/saby-client.ts
var SabyApiError = class extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
    this.name = "SabyApiError";
  }
  code;
  status;
};
var SabyClient = class {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  config;
  fetcher;
  token;
  async listOrders(input) {
    const orders = [];
    for (let page = 0; page < 1e4; page += 1) {
      const batch = await this.page({ ...input, page }, true);
      orders.push(...batch);
      if (batch.length < 100) return orders;
    }
    throw new SabyApiError("BAD_RESPONSE");
  }
  async page(input, retryAuth) {
    const token = this.token ?? await this.authenticate();
    const url = new URL("/retail/order/list", this.config.apiBaseUrl);
    url.searchParams.set("pointId", String(this.config.pointId));
    url.searchParams.set("fromDateTime", input.fromDateTime);
    url.searchParams.set("toDateTime", input.toDateTime);
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("needDiscountInfo", "true");
    const response8 = await this.fetcher(url, { headers: { "X-SBISAccessToken": token, accept: "application/json" } });
    if (response8.status === 401 && retryAuth) {
      this.token = void 0;
      return this.page(input, false);
    }
    if (!response8.ok) throw new SabyApiError("API_FAILED", response8.status);
    const payload = await response8.json();
    if (!isObject(payload) || !Array.isArray(payload.orders) || payload.orders.some((order) => !isObject(order))) throw new SabyApiError("BAD_RESPONSE");
    return payload.orders;
  }
  async authenticate() {
    const response8 = await this.fetcher(this.config.authUrl, {
      method: "POST",
      headers: { "content-type": "application/json;charset=utf-8", accept: "application/json" },
      body: JSON.stringify({ app_client_id: this.config.appClientId, app_secret: this.config.appSecret, secret_key: this.config.secretKey })
    });
    if (!response8.ok) throw new SabyApiError("AUTH_FAILED", response8.status);
    const payload = await response8.json();
    if (!isObject(payload) || typeof payload.token !== "string" || !payload.token.trim()) throw new SabyApiError("BAD_RESPONSE");
    this.token = payload.token;
    return payload.token;
  }
};
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/server/saby-sync-service.ts
init_database();
import crypto4 from "node:crypto";
import { nanoid as nanoid13 } from "nanoid";
var SabyContractError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "SabyContractError";
  }
  code;
};
var SabySyncService = class {
  constructor(database2, client, options) {
    this.database = database2;
    this.client = client;
    this.options = options;
  }
  database;
  client;
  options;
  recordWebhookSignal(payload) {
    const at = this.now().toISOString();
    const raw = canonicalJson2(payload);
    const id = nanoid13();
    this.database.transaction((db2) => {
      db2.execute("INSERT INTO saby_webhook_signals(id,payload_json,payload_sha256,status,attempt_count,received_at,updated_at) VALUES (?,?,?,'pending',0,?,?)", [id, raw, sha2562(raw), at, at]);
    }, { mode: "immediate" });
    return { id, accepted: true };
  }
  hasPendingSignal() {
    return (this.database.query("SELECT count(*) count FROM saby_webhook_signals WHERE status='pending'")[0]?.count ?? 0) > 0;
  }
  async synchronize(explicit) {
    const now3 = this.now();
    const state = this.database.query("SELECT cursor_updated_at FROM saby_sync_state WHERE scope='retail_sales'")[0];
    const cursor = state?.cursor_updated_at ? parseSabyDateTime(state.cursor_updated_at, this.options.timezone) : void 0;
    const from = explicit?.from ?? new Date((cursor?.getTime() ?? now3.getTime() - this.options.initialLookbackHours * 36e5) - this.options.overlapMinutes * 6e4);
    const to = explicit?.to ?? now3;
    const runId = nanoid13();
    const startedAt = now3.toISOString();
    this.database.execute("INSERT INTO saby_reconciliation_runs(id,from_time,to_time,status,started_at) VALUES (?,?,?,'running',?)", [runId, from.toISOString(), to.toISOString(), startedAt]);
    try {
      const orders = await this.client.listOrders({ fromDateTime: formatSabyDateTime(from, this.options.timezone), toDateTime: formatSabyDateTime(to, this.options.timezone) });
      let changed = 0;
      let maxUpdated = state?.cursor_updated_at ?? "";
      for (const order of orders) {
        const normalized = normalizeSabyOrder(order, this.options.pointId);
        if (normalized.externalUpdatedAt > maxUpdated) maxUpdated = normalized.externalUpdatedAt;
        if (this.apply(normalized)) changed += 1;
      }
      const finishedAt = this.now().toISOString();
      this.database.transaction((db2) => {
        db2.execute("UPDATE saby_reconciliation_runs SET orders_seen=?,orders_changed=?,status='completed',completed_at=? WHERE id=?", [orders.length, changed, finishedAt, runId]);
        db2.execute("UPDATE saby_sync_state SET cursor_updated_at=?,last_success_at=?,last_error_code=NULL,version=version+1,updated_at=? WHERE scope='retail_sales'", [maxUpdated || formatSabyDateTime(to, this.options.timezone), finishedAt, finishedAt]);
        db2.execute("UPDATE saby_webhook_signals SET status='processed',processed_at=?,last_error_code=NULL,updated_at=? WHERE status IN ('pending','processing','failed')", [finishedAt, finishedAt]);
      }, { mode: "immediate" });
      return { runId, ordersSeen: orders.length, ordersChanged: changed, from: from.toISOString(), to: to.toISOString() };
    } catch (error) {
      const code = error instanceof SabyContractError ? error.code : isObject(error) && typeof error.code === "string" ? error.code : "SABY_SYNC_FAILED";
      const failedAt = this.now().toISOString();
      this.database.transaction((db2) => {
        db2.execute("UPDATE saby_reconciliation_runs SET status='failed',error_code=?,completed_at=? WHERE id=?", [code, failedAt, runId]);
        db2.execute("UPDATE saby_sync_state SET last_error_code=?,version=version+1,updated_at=? WHERE scope='retail_sales'", [code, failedAt]);
        db2.execute("UPDATE saby_webhook_signals SET status='failed',attempt_count=attempt_count+1,last_error_code=?,updated_at=? WHERE status IN ('pending','processing')", [code, failedAt]);
      }, { mode: "immediate" });
      throw error;
    }
  }
  listMappings() {
    return this.database.query(`SELECT i.nomenclature_uuid AS nomenclatureUuid,i.name,i.barcode,i.article,m.product_id AS productId,
      (SELECT count(*) FROM saby_sale_lines l WHERE l.nomenclature_uuid=i.nomenclature_uuid) AS occurrences
      FROM saby_external_items i LEFT JOIN saby_product_mappings m ON m.nomenclature_uuid=i.nomenclature_uuid
      ORDER BY (m.product_id IS NULL) DESC,i.last_seen_at DESC,i.nomenclature_uuid`);
  }
  status() {
    const state = this.database.query("SELECT scope,cursor_updated_at AS cursorUpdatedAt,last_success_at AS lastSuccessAt,last_error_code AS lastErrorCode,version,updated_at AS updatedAt FROM saby_sync_state WHERE scope='retail_sales'")[0];
    const pendingSignals = this.database.query("SELECT count(*) count FROM saby_webhook_signals WHERE status IN ('pending','failed')")[0]?.count ?? 0;
    return { pendingSignals, state };
  }
  saveMapping(input) {
    const at = this.now().toISOString();
    try {
      return this.database.transaction((db2) => {
        const scope = "saby.mapping.save";
        const requestHash = sha2562(canonicalJson2({ uuid: input.uuid, productId: input.productId }));
        const existing = db2.query("SELECT request_hash,status,response_json FROM idempotency_keys WHERE scope=? AND key=?", [scope, input.idempotencyKey])[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new SabyContractError("IDEMPOTENCY_CONFLICT");
          if (existing.status !== "completed" || !existing.response_json) throw new SabyContractError("IDEMPOTENCY_IN_PROGRESS");
          const replay2 = JSON.parse(existing.response_json);
          return replay2.value;
        }
        db2.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,version,updated_at) VALUES (?,?,?,'processing',?,0,?)", [scope, input.idempotencyKey, requestHash, at, at]);
        if (!db2.query("SELECT id FROM products WHERE id=? AND status='active'", [input.productId]).length) throw new SabyContractError("PRODUCT_NOT_FOUND");
        if (!db2.query("SELECT nomenclature_uuid FROM saby_external_items WHERE nomenclature_uuid=?", [input.uuid]).length) throw new SabyContractError("SABY_ITEM_NOT_FOUND");
        db2.execute(`INSERT INTO saby_product_mappings(nomenclature_uuid,product_id,created_by_user_id,created_at,version,updated_at) VALUES (?,?,?,?,0,?)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET product_id=excluded.product_id,created_by_user_id=excluded.created_by_user_id,version=version+1,updated_at=excluded.updated_at`, [input.uuid, input.productId, input.actorId, at, at]);
        db2.execute("INSERT INTO product_aliases(id,product_id,alias,normalized_alias,source,created_at) SELECT ?,?,name,dvorik_normalize_search(name),'saby',? FROM saby_external_items WHERE nomenclature_uuid=? AND name<>'' ON CONFLICT DO NOTHING", [nanoid13(), input.productId, at, input.uuid]);
        this.audit(db2, input.actorId, "saby_mapping", input.uuid, "upsert", { productId: input.productId }, at);
        this.reapplyUuid(db2, input.uuid, at);
        const response8 = { nomenclatureUuid: input.uuid, productId: input.productId };
        db2.execute("UPDATE idempotency_keys SET status='completed',response_status=200,response_json=?,completed_at=?,expires_at=?,version=version+1,updated_at=? WHERE scope=? AND key=?", [JSON.stringify({ schemaVersion: 1, value: response8 }), at, new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString(), at, scope, input.idempotencyKey]);
        return response8;
      }, { mode: "immediate" });
    } catch (error) {
      if (error instanceof DatabaseError && error.causeCode) throw new SabyContractError(error.causeCode.startsWith("SQLITE_CONSTRAINT") ? "SABY_MAPPING_CONFLICT" : error.causeCode);
      throw error;
    }
  }
  retryQueuedStock() {
    const at = this.now().toISOString();
    return this.database.transaction((db2) => {
      const uuids = db2.query("SELECT DISTINCT nomenclature_uuid FROM saby_sale_lines WHERE stock_status IN ('queued_inventory','blocked_negative','unmapped')");
      for (const row of uuids) this.reapplyUuid(db2, row.nomenclature_uuid, at);
      return uuids.length;
    }, { mode: "immediate" });
  }
  apply(sale) {
    return this.database.transaction((db2) => {
      const existing = db2.query("SELECT revision_sha256,total_kopecks,state FROM saby_sales WHERE external_key=?", [sale.key])[0];
      if (existing?.revision_sha256 === sale.revision) return false;
      const at = this.now().toISOString();
      const oldLines = db2.query("SELECT external_line_key,nomenclature_uuid,applied_quantity_milli FROM saby_sale_lines WHERE external_sale_key=?", [sale.key]).map((row) => ({ key: row.external_line_key, uuid: row.nomenclature_uuid, appliedQuantityMilli: row.applied_quantity_milli }));
      for (const line of sale.lines) db2.execute(`INSERT INTO saby_external_items(nomenclature_uuid,name,barcode,article,first_seen_at,last_seen_at,version) VALUES (?,?,?,?,?,?,0)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,article=excluded.article,last_seen_at=excluded.last_seen_at,version=version+1`, [line.uuid, line.name, line.barcode, line.article, at, at]);
      db2.execute(
        `INSERT INTO saby_sales(external_key,external_sale_id,point_id,state,is_return,return_sale_key,business_time,external_updated_at,total_kopecks,revision_sha256,raw_json,received_at,version,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(external_key) DO UPDATE SET external_sale_id=excluded.external_sale_id,point_id=excluded.point_id,state=excluded.state,is_return=excluded.is_return,return_sale_key=excluded.return_sale_key,business_time=excluded.business_time,external_updated_at=excluded.external_updated_at,total_kopecks=excluded.total_kopecks,revision_sha256=excluded.revision_sha256,raw_json=excluded.raw_json,received_at=excluded.received_at,version=version+1,updated_at=excluded.updated_at`,
        [sale.key, sale.saleId ?? null, sale.pointId, sale.state, sale.isReturn ? 1 : 0, sale.returnSaleKey ?? null, sale.businessTime, sale.externalUpdatedAt, sale.totalKopecks, sale.revision, sale.raw, at, at]
      );
      const oldRevenue = existing?.state === "completed" ? existing.total_kopecks : 0;
      const revenueDelta = sale.totalKopecks - oldRevenue;
      db2.execute("INSERT INTO saby_sale_deltas(id,external_sale_key,revision_sha256,revenue_delta_kopecks,reason,created_at) VALUES (?,?,?,?,?,?)", [nanoid13(), sale.key, sale.revision, revenueDelta, !existing ? sale.isReturn ? "return" : "initial" : sale.state === "deleted" ? "deleted" : sale.state === "nonfiscal" ? "nonfiscal" : "revision", at]);
      const newByKey = new Map(sale.lines.map((line) => [line.key, line]));
      for (const old of oldLines) if (!newByKey.has(old.key)) this.applyLine(db2, sale, { key: old.key, uuid: old.uuid, name: "", barcode: "", article: "", quantityMilli: 1, totalKopecks: 0, discountKopecks: 0, refused: true }, old.appliedQuantityMilli, at, true);
      for (const line of sale.lines) this.applyLine(db2, sale, line, oldLines.find((old) => old.key === line.key)?.appliedQuantityMilli ?? 0, at, false);
      db2.execute("UPDATE saby_sales SET applied_at=? WHERE external_key=?", [at, sale.key]);
      this.audit(db2, void 0, "saby_sale", sale.key, existing ? "revise" : "ingest", { state: sale.state, revision: sale.revision, revenueDeltaKopecks: revenueDelta }, at);
      return true;
    }, { mode: "immediate" });
  }
  applyLine(db2, sale, line, alreadyApplied, at, removed) {
    const mapping = db2.query("SELECT m.product_id,p.inventory_kind FROM saby_product_mappings m JOIN products p ON p.id=m.product_id WHERE m.nomenclature_uuid=? AND p.status='active'", [line.uuid])[0];
    const inventoryOpen = db2.query("SELECT id FROM inventory_sessions WHERE status IN ('active','closing') LIMIT 1").length > 0;
    let status = removed || line.refused || sale.state !== "completed" ? "not_applicable" : !mapping ? "unmapped" : mapping.inventory_kind !== "piece" ? "not_applicable" : inventoryOpen ? "queued_inventory" : "applied";
    const desired = status === "applied" ? sale.isReturn ? line.quantityMilli : -line.quantityMilli : 0;
    const delta = desired - alreadyApplied;
    let applied = alreadyApplied;
    if (mapping && delta !== 0 && status !== "queued_inventory") {
      const balance = db2.query("SELECT quantity_minor,version FROM inventory_balances WHERE product_id=?", [mapping.product_id])[0];
      const current = balance?.quantity_minor ?? 0;
      if (current + delta < 0) status = "blocked_negative";
      else {
        if (balance) db2.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [current + delta, at, mapping.product_id, balance.version]);
        else db2.execute("INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES (?,?,0,?)", [mapping.product_id, delta, at]);
        applied = desired;
        db2.execute("INSERT INTO stock_operations(id,type,product_id,quantity,quantity_minor,actor_id,reason,idempotency_key,metadata_json,created_at) VALUES (?,?,?,?,?,'system-saby',?,?,?,?)", [nanoid13(), delta < 0 ? "write_off" : "correction", mapping.product_id, Math.abs(delta) / 1e3, Math.abs(delta), `Saby ${sale.isReturn ? "return" : "sale"} ${sale.key}`, `saby:${sale.key}:${line.key}:${sale.revision}`, JSON.stringify({ schemaVersion: 1, value: { source: "saby", externalSaleKey: sale.key, externalLineKey: line.key, deltaMilli: delta } }), at]);
      }
    }
    db2.execute(
      `INSERT INTO saby_sale_lines(external_sale_key,external_line_key,nomenclature_uuid,name,barcode,article,quantity_milli,total_kopecks,discount_kopecks,refused,stock_status,applied_quantity_milli,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_sale_key,external_line_key) DO UPDATE SET nomenclature_uuid=excluded.nomenclature_uuid,name=excluded.name,barcode=excluded.barcode,article=excluded.article,quantity_milli=excluded.quantity_milli,total_kopecks=excluded.total_kopecks,discount_kopecks=excluded.discount_kopecks,refused=excluded.refused,stock_status=excluded.stock_status,applied_quantity_milli=excluded.applied_quantity_milli,updated_at=excluded.updated_at`,
      [sale.key, line.key, line.uuid, line.name, line.barcode, line.article, line.quantityMilli, line.totalKopecks, line.discountKopecks, removed || line.refused ? 1 : 0, status, applied, at]
    );
    if (status === "unmapped" || status === "blocked_negative") this.notifyManagers(db2, status === "unmapped" ? "saby.mapping_required" : "saby.negative_stock", `${sale.key}:${line.key}:${status}`, { saleKey: sale.key, lineKey: line.key, nomenclatureUuid: line.uuid, productId: mapping?.product_id ?? null }, at);
  }
  reapplyUuid(db2, uuid, at) {
    const rows = db2.query("SELECT DISTINCT external_sale_key FROM saby_sale_lines WHERE nomenclature_uuid=? ORDER BY external_sale_key", [uuid]);
    for (const row of rows) {
      const saleRow = db2.query("SELECT * FROM saby_sales WHERE external_key=?", [row.external_sale_key])[0];
      const lines = db2.query("SELECT * FROM saby_sale_lines WHERE external_sale_key=? AND nomenclature_uuid=?", [row.external_sale_key, uuid]);
      if (!saleRow) continue;
      const sale = storedSale(saleRow);
      for (const raw of lines) {
        const line = storedNormalizedLine(raw);
        this.applyLine(db2, sale, line, Number(raw.applied_quantity_milli), at, Boolean(raw.refused));
      }
    }
  }
  notifyManagers(db2, type, key, value, at) {
    const users2 = db2.query("SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.status='active' AND ur.role_id IN ('admin','super_admin')");
    for (const user of users2) {
      const payload = JSON.stringify({ schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...value } });
      db2.execute("INSERT INTO webapp_notifications(id,recipient_user_id,type,payload_json,is_read,created_at,version,updated_at) VALUES (?,?,?,?,0,?,0,?)", [nanoid13(), user.id, type, payload, at, at]);
      db2.execute("INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,idempotency_key,attempt_count,max_attempts,available_at,created_at,version,updated_at) VALUES (?,'telegram',?,?,?,'pending',?,0,?,?,?,0,?) ON CONFLICT DO NOTHING", [nanoid13(), user.id, type, payload, `saby:${key}:${user.id}`, this.options.outboxMaxAttempts ?? 8, at, at, at]);
    }
  }
  audit(db2, actorId, entity, entityId, action, value, at) {
    db2.execute("INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,changes_json,request_id,created_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,0,?)", [nanoid13(), actorId ?? null, entity, entityId, action, JSON.stringify({ schemaVersion: 1, value }), `saby:${entityId}:${action}`, at, at]);
  }
  now() {
    return this.options.now?.() ?? /* @__PURE__ */ new Date();
  }
};
function normalizeSabyOrder(order, pointId) {
  const key = text(order.Key) || (integer2(order.Sale) !== void 0 ? String(integer2(order.Sale)) : "");
  if (!key) throw new SabyContractError("SABY_ORDER_KEY_MISSING");
  const deleted = order.Deleted === true;
  const payments = Array.isArray(order.Payments) ? order.Payments.filter(isObject) : [];
  const fiscal = payments.some((payment) => payment.Nonfiscal !== true && Boolean(text(payment.ClosedWTZ) || text(payment.CarriedWTZ) || text(payment.FiscalNumber)));
  const state = deleted ? "deleted" : fiscal ? "completed" : "nonfiscal";
  const isReturn = order.Return === true;
  const total = money(order.TotalPrice);
  const linesRaw = Array.isArray(order.SaleNomenclatures) ? order.SaleNomenclatures.filter(isObject) : [];
  const lines = linesRaw.flatMap((line, index) => {
    const uuid = text(line.NomenclatureUUID);
    if (!uuid) return [];
    const quantityMilli = quantity2(line.Quantity);
    if (quantityMilli <= 0) return [];
    return [{ key: text(line.Key) || `${uuid}:${integer2(line.Number) ?? index}`, uuid, name: text(line.Name) || text(line.ShortName), barcode: text(line.Barcode), article: text(line.NomenclatureNumber), quantityMilli, totalKopecks: money(line.TotalPrice), discountKopecks: money(line.TotalDiscount), refused: line.Refused === true }];
  });
  const businessTime = text(order.ClosedWTZ) || text(order.DateWTZ);
  const externalUpdatedAt = text(order.Updated) || businessTime;
  if (!businessTime || !externalUpdatedAt) throw new SabyContractError("SABY_ORDER_TIME_MISSING");
  const normalized = { key, saleId: integer2(order.Sale), pointId, state, isReturn, returnSaleKey: text(order.ReturnSaleKey) || void 0, businessTime, externalUpdatedAt, totalKopecks: state === "completed" ? isReturn ? -Math.abs(total) : Math.abs(total) : 0, lines };
  const raw = canonicalJson2(order);
  return { ...normalized, revision: sha2562(canonicalJson2(normalized)), raw };
}
function storedSale(row) {
  return { key: String(row.external_key), saleId: row.external_sale_id === null ? void 0 : Number(row.external_sale_id), pointId: Number(row.point_id), state: row.state, isReturn: Boolean(row.is_return), returnSaleKey: row.return_sale_key === null ? void 0 : String(row.return_sale_key), businessTime: String(row.business_time), externalUpdatedAt: String(row.external_updated_at), totalKopecks: Number(row.total_kopecks), revision: String(row.revision_sha256), raw: String(row.raw_json), lines: [] };
}
function storedNormalizedLine(row) {
  return { key: String(row.external_line_key), uuid: String(row.nomenclature_uuid), name: String(row.name), barcode: String(row.barcode), article: String(row.article), quantityMilli: Number(row.quantity_milli), totalKopecks: Number(row.total_kopecks), discountKopecks: Number(row.discount_kopecks), refused: Boolean(row.refused) };
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function integer2(value) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : void 0;
}
function money(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}
function quantity2(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  const result = Math.round((value + Number.EPSILON) * 1e3);
  if (Math.abs(result / 1e3 - value) > 1e-9) throw new SabyContractError("SABY_QUANTITY_PRECISION");
  return result;
}
function sha2562(value) {
  return crypto4.createHash("sha256").update(value).digest("hex");
}
function canonicalJson2(value) {
  return JSON.stringify(sortJson(value));
}
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  return value ?? null;
}
function formatSabyDateTime(date2, timezone2) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date2);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
function parseSabyDateTime(value, timezone2) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new SabyContractError("SABY_BAD_DATETIME");
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  let candidate = wall;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const formatted = formatSabyDateTime(new Date(candidate), timezone2);
    const seen = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(formatted);
    const seenWall = Date.UTC(Number(seen[1]), Number(seen[2]) - 1, Number(seen[3]), Number(seen[4]), Number(seen[5]), Number(seen[6]));
    candidate += wall - seenWall;
  }
  return new Date(candidate);
}

// src/server/index.ts
var __dirname = path6.dirname(fileURLToPath2(import.meta.url));
var runtimeConfig2 = loadRuntimeConfig();
if (runtimeConfig2.production) await assertImageProcessorCapability();
var unavailableLegacy = (..._args) => {
  throw new Error("Legacy AppState runtime is unavailable in production");
};
var unavailableState = new Proxy({}, { get: unavailableLegacy });
var unavailableDomain = new Proxy({}, { get: () => unavailableLegacy });
var unavailableReports = new Proxy({}, { get: () => unavailableLegacy });
var unavailableTelegram = new Proxy({}, { get: () => unavailableLegacy });
var legacyRuntime = runtimeConfig2.production ? void 0 : await Promise.resolve().then(() => (init_legacy_runtime(), legacy_runtime_exports));
var legacyStore = legacyRuntime?.store;
var legacyState = legacyStore?.db ?? unavailableState;
var audit2 = legacyStore?.audit ?? unavailableLegacy;
var closeDatabase2 = legacyStore?.closeDatabase ?? (() => {
});
var createBackup2 = legacyStore?.createBackup ?? unavailableLegacy;
var listBackups2 = legacyStore?.listBackups ?? unavailableLegacy;
var restoreBackup2 = legacyStore?.restoreBackup ?? unavailableLegacy;
var legacySaveState = legacyStore?.saveState ?? unavailableLegacy;
var legacyDomain = legacyRuntime?.domain ?? unavailableDomain;
var {
  acceptSwap: acceptSwap2,
  applyBufferedStockOperations: applyBufferedStockOperations2,
  applyInventory: applyInventory2,
  applyStockOperation: applyStockOperation2,
  commitCsvImport: commitCsvImport2,
  commitProductMerge: commitProductMerge2,
  cancelSwap: cancelSwap2,
  commitArchiveCandidates: commitArchiveCandidates2,
  copyShift: copyShift2,
  commitFutureReplacement: commitFutureReplacement2,
  commitRotation: commitRotation2,
  createShift: createShift2,
  createSwapRequest: createSwapRequest2,
  declineSwap: declineSwap2,
  inventorySnapshot: inventorySnapshot2,
  listInventoryDiscrepancies: listInventoryDiscrepancies2,
  listVisibleScheduleShifts: listVisibleScheduleShifts2,
  listVisibleScheduleSwaps: listVisibleScheduleSwaps2,
  previewCsvImport: previewCsvImport2,
  previewArchiveCandidates: previewArchiveCandidates2,
  previewFutureReplacement: previewFutureReplacement2,
  previewRotation: previewRotation2,
  previewProductMerge: previewProductMerge2,
  reverseOperation: reverseOperation2,
  setScheduleDay: setScheduleDay2,
  undoCsvImport: undoCsvImport2,
  undoProductMerge: undoProductMerge2,
  updateShift: updateShift2,
  refreshScheduleState: refreshScheduleState2
} = legacyDomain;
var { queueReportTelegram: queueReportTelegram2, renderReportPdf: renderReportPdf2, reportRows: reportRows2 } = legacyRuntime?.reports ?? unavailableReports;
var { approveTelegramOnboarding: approveTelegramOnboarding2, handleTelegramUpdate: handleTelegramUpdate2, setNotificationPreference: setNotificationPreference2 } = legacyRuntime?.telegram ?? unavailableTelegram;
var app = express();
var httpMetrics = createHttpMetrics();
var mutationRateLimiter = createFixedWindowRateLimiter({ limit: 120, windowMs: 6e4 });
app.disable("x-powered-by");
app.use((req, res, next) => {
  const requestId = requestCorrelationId(req.header("x-request-id"));
  res.setHeader("X-Request-Id", requestId);
  for (const [name, value] of Object.entries(securityHeaders(runtimeConfig2.production))) res.setHeader(name, value);
  const startedAt = Date.now();
  httpMetrics.begin();
  res.once("finish", () => {
    httpMetrics.complete(res.statusCode);
    if (runtimeConfig2.production) console.log(JSON.stringify({ event: "http_request", requestId, method: req.method, path: safeLogPath(req.path), status: res.statusCode, durationMs: Date.now() - startedAt }));
  });
  next();
});
app.use((req, res, next) => {
  if (runtimeConfig2.production && crossOriginMutationRejected({
    method: req.method,
    path: req.path,
    origin: req.header("origin"),
    host: req.header("host") || "",
    protocol: req.protocol,
    secFetchSite: req.header("sec-fetch-site")
  })) {
    res.status(403).json({ code: "ORIGIN_FORBIDDEN", message: "Cross-origin mutation is not allowed" });
    return;
  }
  next();
});
app.use((req, res, next) => {
  if (!runtimeConfig2.production || !isUnsafeApiMutation(req.method, req.path)) return next();
  const contentLength = Number(req.header("content-length") || 0);
  if (contentLength > 0 && !req.is("application/json")) {
    res.status(415).json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Mutating API requests require application/json" });
    return;
  }
  const limited = mutationRateLimiter.allow(req.ip || req.socket.remoteAddress || "unknown");
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfterSeconds));
    res.status(429).json({ code: "RATE_LIMITED", message: "Too many mutating requests" });
    return;
  }
  next();
});
app.use("/api/media/upload", express.json({ limit: MEDIA_UPLOAD_JSON_LIMIT_BYTES }));
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, res, next) => {
  if (isUnsafeApiMutation(req.method, req.path) && req.body !== void 0 && invalidJsonPayload(req.body)) {
    res.status(400).json({ code: "INVALID_JSON_PAYLOAD", message: "JSON payload violates safety limits" });
    return;
  }
  next();
});
app.use("/api", (req, _res, next) => {
  const policy = routePolicyFor(req.method, `/api${req.path}`);
  if (policy) requirePermission(actor2(req), policy.permission);
  next();
});
app.use("/api", (req, res, next) => {
  const feature = deferredLaunchFeatureForRoute(`/api${req.path}`);
  if (!feature) return next();
  res.status(404).json({ code: "FEATURE_DISABLED", feature });
});
var sessionCookie = runtimeConfig2.sessionCookie.name;
var expectedSchemaVersions2 = [1, ...listMigrations().map((migration) => migration.version)].sort((left, right) => left - right);
var fontPath2 = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
var mediaDir = runtimeConfig2.mediaDir;
var mediaStorage = createMediaStorage({
  localDirectory: mediaDir,
  endpoint: runtimeConfig2.objectStorage?.endpoint,
  bucket: runtimeConfig2.objectStorage?.bucket,
  publicBaseUrl: runtimeConfig2.objectStorage?.publicBaseUrl,
  token: runtimeConfig2.objectStorage?.token,
  allowLocalFallback: !runtimeConfig2.production
});
var devToolsEnabled = runtimeConfig2.devToolsEnabled;
var hardenedSessionsEnabled = runtimeConfig2.production || Boolean(process.env.DVORIK_SQLITE_FILE);
var sessionDatabase = hardenedSessionsEnabled ? openDatabase(runtimeConfig2.sqliteFile) : void 0;
if (runtimeConfig2.production && sessionDatabase) {
  sessionDatabase.executeScript(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));`);
  applyMigrations(sessionDatabase);
}
var sabyService = sessionDatabase && runtimeConfig2.saby ? new SabySyncService(
  sessionDatabase,
  new SabyClient(runtimeConfig2.saby),
  { pointId: runtimeConfig2.saby.pointId, timezone: runtimeConfig2.timezone, overlapMinutes: runtimeConfig2.saby.overlapMinutes, initialLookbackHours: runtimeConfig2.saby.initialLookbackHours }
) : void 0;
var catalogQueries = sessionDatabase ? new SqlCatalogQueryService(sessionDatabase) : void 0;
var identityUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteIdentityCommandRepositories) : void 0;
var identityQueryService = identityUnitOfWork ? new IdentityQueryService(identityUnitOfWork) : void 0;
var commandActorResolver = { resolve: (reference) => reference };
var identityService = identityUnitOfWork ? new IdentityService(
  new CommandExecutor(identityUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  { processingTimeoutMs: 3e4, idempotencyRetentionMs: 7 * 24 * 60 * 6e4, outboxMaxAttempts: 8 }
) : void 0;
var stockUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteStockCommandRepositories) : void 0;
var stockExecutor = stockUnitOfWork ? new CommandExecutor(stockUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver) : void 0;
var stockCommandOptions = { processingTimeoutMs: 3e4, idempotencyRetentionMs: 7 * 24 * 60 * 6e4, outboxMaxAttempts: 8 };
var stockService = stockExecutor ? new StockOperationService(stockExecutor, stockCommandOptions) : void 0;
var catalogUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteCatalogCommandRepositories) : void 0;
var catalogService = catalogUnitOfWork ? new CatalogService(
  new CommandExecutor(catalogUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  stockCommandOptions
) : void 0;
var notificationPreferenceUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteNotificationPreferenceCommandRepositories) : void 0;
var notificationPreferenceService = notificationPreferenceUnitOfWork ? new NotificationPreferenceService(
  new CommandExecutor(notificationPreferenceUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  stockCommandOptions
) : void 0;
var artifactUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteArtifactCommandRepositories) : void 0;
var artifactService = artifactUnitOfWork ? new ArtifactCommandService(
  new CommandExecutor(artifactUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  stockCommandOptions
) : void 0;
var inventorySessionUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteInventorySessionRepositories) : void 0;
var inventorySessionService = inventorySessionUnitOfWork ? new InventorySessionService(
  new CommandExecutor(inventorySessionUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  stockCommandOptions
) : void 0;
var inventoryService = stockExecutor ? new InventoryService(stockExecutor, stockCommandOptions) : void 0;
var reversalService = stockExecutor ? new ReversalService(stockExecutor, stockCommandOptions) : void 0;
var scheduleUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteScheduleCommandRepositories) : void 0;
var scheduleExecutor = scheduleUnitOfWork ? new CommandExecutor(scheduleUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver) : void 0;
var scheduleService = scheduleExecutor ? new ScheduleSwapService(scheduleExecutor, stockCommandOptions) : void 0;
var staffScheduleUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteStaffScheduleRepositories) : void 0;
var staffScheduleService = staffScheduleUnitOfWork ? new StaffScheduleService(
  new CommandExecutor(staffScheduleUnitOfWork, { now: () => (/* @__PURE__ */ new Date()).toISOString() }, commandActorResolver),
  stockCommandOptions
) : void 0;
var sessionService = sessionDatabase ? new SessionService(
  new UnitOfWork(sessionDatabase, createSqliteSessionCommandRepositories),
  { now: () => (/* @__PURE__ */ new Date()).toISOString() },
  {
    secret: runtimeConfig2.sessionCookie.secret,
    maxAgeMs: runtimeConfig2.sessionCookie.maxAgeMs
  }
) : void 0;
function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) continue;
    try {
      cookies[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("="));
    } catch {
    }
  }
  return cookies;
}
function requireLocalDevTools(req) {
  const address = req.socket.remoteAddress || "";
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") throw new DomainError("NOT_FOUND", "Dev tools disabled", 404);
}
function safeCommandIdentifier(value, fallback) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(candidate) ? candidate : fallback;
}
function identityMetadata(req, user) {
  const requestId = safeCommandIdentifier(req.header("x-request-id"), `http:${nanoid18()}`);
  const idempotencyKey = safeCommandIdentifier(req.header("idempotency-key") || req.body?.idempotencyKey, requestId);
  return {
    actorReference: { kind: "user", userId: user.id, authenticatedBy: "web_session" },
    requestId,
    channel: "web",
    idempotencyKey
  };
}
function identityResponse(res, result) {
  if (result.outcome === "rejected") return res.status(result.status).json(result.body);
  if ("code" in result) {
    return res.status(result.status).json({ code: result.code });
  }
  const user = result.body.user;
  return res.status(result.status).json(user && typeof user === "object" ? user : result.body);
}
function commandResponse(res, result) {
  if ("body" in result) return res.status(result.status).json(result.body);
  if ("code" in result) return res.status(result.status).json({ code: result.code });
  throw new Error("Unexpected stock command result");
}
function identityResultUser(result) {
  if (result.outcome === "executed" || result.outcome === "replayed") {
    const value = result.body.user;
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    throw new DomainError("IDENTITY_RESPONSE_INVALID", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 identity service", 500);
  }
  if (result.outcome === "rejected") {
    throw new DomainError(String(result.body.code || "FORBIDDEN"), String(result.body.message || "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432"), result.status);
  }
  if ("code" in result) throw new DomainError(result.code, "\u041A\u043E\u043D\u0444\u043B\u0438\u043A\u0442 \u0438\u0434\u0435\u043C\u043F\u043E\u0442\u0435\u043D\u0442\u043D\u043E\u0441\u0442\u0438", result.status);
  throw new DomainError("IDENTITY_RESPONSE_INVALID", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 identity service", 500);
}
function actor2(req) {
  const cookies = parseCookies(req.header("cookie"));
  const credential = cookies[sessionCookie];
  if (sessionService) {
    const authenticated = sessionService.authenticate(credential);
    if (!authenticated) throw new DomainError("AUTH_REQUIRED", "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 401);
    return authenticated.user;
  }
  const sessionId = credential;
  const session2 = legacyState.sessions.find((item) => item.id === sessionId && !item.revokedAt);
  if (!session2 || new Date(session2.expiresAt).getTime() <= Date.now()) {
    throw new DomainError("AUTH_REQUIRED", "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 401);
  }
  const user = legacyState.users.find((item) => item.id === session2.userId);
  if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 401);
  return user;
}
function issueSession(user, method) {
  if (sessionService) {
    try {
      return sessionService.create(user.id, method);
    } catch (error) {
      if (error instanceof SessionServiceError && error.code === "USER_NOT_ACTIVE") {
        throw new DomainError("AUTH_REQUIRED", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 401);
      }
      throw error;
    }
  }
  const session2 = {
    id: nanoid18(),
    userId: user.id,
    method,
    expiresAt: new Date(Date.now() + runtimeConfig2.sessionCookie.maxAgeMs).toISOString(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  for (const current of legacyState.sessions.filter((item) => item.userId === user.id && !item.revokedAt)) {
    current.revokedAt = session2.createdAt;
  }
  legacyState.sessions.push(session2);
  legacySaveState();
  return { token: session2.id, sessionId: session2.id, expiresAt: session2.expiresAt, user };
}
function productIdentifiers(productId, body) {
  const identifiers = [];
  const rawIdentifiers = Array.isArray(body.identifiers) ? body.identifiers : [];
  for (const raw of rawIdentifiers) {
    const item = raw;
    const type = String(item.type || "other");
    const value = String(item.value || "").trim();
    if (!["supplier_article", "barcode", "legacy_article", "other"].includes(type) || !value) continue;
    identifiers.push({ id: nanoid18(), productId, type, value, supplierId: item.supplierId });
  }
  const sku = String(body.sku || "").trim();
  const barcode = String(body.barcode || "").trim();
  if (sku) identifiers.push({ id: nanoid18(), productId, type: "supplier_article", value: sku });
  if (barcode) identifiers.push({ id: nanoid18(), productId, type: "barcode", value: barcode });
  return identifiers;
}
function jsonObjectValue(value) {
  return JSON.parse(JSON.stringify(value));
}
function requireArtifactRecorded(result) {
  if (result.outcome === "executed" || result.outcome === "replayed") return;
  if (result.outcome === "rejected") throw new DomainError(String(result.body.code || "FORBIDDEN"), String(result.body.message || "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432"), result.status);
  if ("code" in result) throw new DomainError(result.code, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435", result.status);
  throw new DomainError("ARTIFACT_AUDIT_FAILED", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435", 500);
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function normalizeSearch(value) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "\u0435").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function scheduleExportRows(user, from, to, locationId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new DomainError("BAD_EXPORT_RANGE", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0434\u0430\u0442");
  const canManage = hasPermission(user, "schedule:manage");
  return legacyState.shifts.filter((shift) => shift.date >= from && shift.date <= to && (!locationId || shift.locationId === locationId) && (canManage || shift.employeeIds.includes(user.id)));
}
function renderSchedulePdf(res, rows, from, to, labels) {
  const doc = new PDFDocument2({ size: "A4", margin: 36 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  doc.on("end", () => res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", `attachment; filename="schedule-${from}_${to}.pdf"`).send(Buffer.concat(chunks)));
  doc.font(fontPath2).fontSize(16).fillColor("#111111").text(`\u0413\u0440\u0430\u0444\u0438\u043A \u0441\u043C\u0435\u043D: ${from} - ${to}`);
  doc.moveDown(0.7).fontSize(9);
  if (!rows.length) doc.text("\u0412 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u043F\u0435\u0440\u0438\u043E\u0434\u0435 \u0441\u043C\u0435\u043D \u043D\u0435\u0442.");
  rows.forEach((shift, index) => {
    const location = labels?.locationName(shift.locationId) ?? (legacyState.locations.find((item) => item.id === shift.locationId)?.name || shift.locationId);
    const employees = shift.employeeIds.map((id) => {
      if (labels) return labels.employeeName(id);
      const employee = identityQueryService?.findById(id) ?? legacyState.users.find((item) => item.id === id);
      return employee ? `${employee.firstName} ${employee.lastName}` : id;
    }).join(", ");
    doc.fillColor("#111111").text(`${index + 1}. ${shift.date} | ${location} | ${employees} | ${shift.status}`);
  });
  doc.end();
}
function labelGeometry(body) {
  const width = Number(body.widthMm || 58);
  const height = Number(body.heightMm || 40);
  if (width < 20 || height < 15 || width > 210 || height > 297) throw new DomainError("BAD_LABEL_GEOMETRY", "\u0420\u0430\u0437\u043C\u0435\u0440 \u044D\u0442\u0438\u043A\u0435\u0442\u043A\u0438 \u0432\u043D\u0435 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430");
  const perRow = Math.max(1, Math.floor(190 / width));
  const rows = Math.max(1, Math.floor(277 / height));
  return { widthMm: width, heightMm: height, labelsPerPage: perRow * rows, perRow, rows };
}
function labelJobFromBody(user, body) {
  const rawItems = Array.isArray(body.items) ? body.items : (body.productIds || []).map((productId) => ({ productId, quantity: 1 }));
  const printedAt = (/* @__PURE__ */ new Date()).toLocaleDateString("ru-RU", { timeZone: "Asia/Vladivostok" });
  const labels = rawItems.map((raw) => {
    const item = raw;
    const product = catalogQueries?.productById(String(item.productId || "")) ?? legacyState.products.find((candidate) => candidate.id === String(item.productId || "") && candidate.status !== "deleted");
    if (!product) throw new DomainError("NO_LABEL_PRODUCTS", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0442\u043E\u0432\u0430\u0440");
    const quantity3 = Math.max(1, Math.min(99, Math.floor(Number(item.quantity || 1))));
    const sku = product.identifiers[0]?.value || product.id;
    const barcodeValue = product.identifiers.find((identifier2) => identifier2.type === "barcode")?.value || sku;
    return {
      productId: product.id,
      title: product.localName || product.officialName,
      sku,
      unit: product.unit,
      quantity: quantity3,
      printedAt,
      barcode: buildBarcode(barcodeValue, product.id)
    };
  });
  if (!labels.length) throw new DomainError("NO_LABEL_PRODUCTS", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0442\u043E\u0432\u0430\u0440");
  return {
    id: nanoid18(),
    actorId: user.id,
    templateId: String(body.templateId || "a4-basic"),
    geometry: labelGeometry(body),
    labels,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function expandLabels(labels) {
  return labels.flatMap((label) => Array.from({ length: label.quantity }, () => label));
}
function sqliteLabelJob(row) {
  const job = labelJobFromRow(row).entity;
  return { id: job.id, actorId: job.actorId || "system", templateId: job.templateId, geometry: job.geometry.value, labels: job.labels.value, createdAt: job.createdAt };
}
function renderLabelsPdf(res, job) {
  const expandedLabels = expandLabels(job.labels);
  if (expandedLabels.length > job.geometry.labelsPerPage) throw new DomainError("LABELS_OVERFLOW", "\u042D\u0442\u0438\u043A\u0435\u0442\u043A\u0438 \u043D\u0435 \u043F\u043E\u043C\u0435\u0449\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u043E\u0434\u043D\u0443 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443");
  const doc = new PDFDocument2({ size: "A4", margin: 28 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  doc.on("end", () => {
    res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", 'attachment; filename="dvorik-labels.pdf"').send(Buffer.concat(chunks));
  });
  doc.font(fontPath2);
  const mm = 72 / 25.4;
  const labelWidth = job.geometry.widthMm * mm;
  const labelHeight = job.geometry.heightMm * mm;
  const gap = 4;
  expandedLabels.forEach((label, index) => {
    const col = index % job.geometry.perRow;
    const row = Math.floor(index / job.geometry.perRow);
    const x = 28 + col * (labelWidth + gap);
    const y = 28 + row * (labelHeight + gap);
    const barcodeHeight = Math.max(8, Math.min(28, labelHeight - 56));
    const barcodeY = y + 34;
    doc.roundedRect(x, y, labelWidth, labelHeight, 4).stroke("#777777");
    doc.fontSize(11).fillColor("#111111").text(label.title, x + 8, y + 9, { width: labelWidth - 16, height: 28, ellipsis: true });
    drawBarcode(doc, label.barcode.pattern, x + 8, barcodeY, labelWidth - 16, barcodeHeight);
    doc.fontSize(7).fillColor("#111111").text(`${label.barcode.type.toUpperCase()}: ${label.barcode.value}`, x + 8, barcodeY + barcodeHeight + 2, { width: labelWidth - 16, align: "center" });
    doc.fontSize(8).fillColor("#555555").text(`SKU: ${label.sku}`, x + 8, barcodeY + barcodeHeight + 13, { width: labelWidth - 16 });
    doc.text(`\u0415\u0434.: ${label.unit}`, x + 8, barcodeY + barcodeHeight + 24, { width: labelWidth - 16 });
    doc.text(label.printedAt, x + 8, y + labelHeight - 18, { width: labelWidth - 16 });
  });
  doc.end();
}
function drawBarcode(doc, pattern, x, y, width, height) {
  const moduleWidth = width / pattern.length;
  let index = 0;
  while (index < pattern.length) {
    if (pattern[index] === "0") {
      index += 1;
      continue;
    }
    const start = index;
    while (index < pattern.length && pattern[index] === "1") index += 1;
    doc.rect(x + start * moduleWidth, y, (index - start) * moduleWidth, height).fill("#111111");
  }
}
var openApiContract = {
  openapi: "3.1.0",
  info: { title: "Dvorik GPT Version API", version: "1.0.0" },
  paths: {
    ...devToolsEnabled ? {
      "/api/auth/demo": { post: { summary: "Create demo session" } },
      "/api/dev/config": { get: { summary: "Dev/test mode config" } },
      "/api/dev/telegram/init-data": { post: { summary: "Create signed local Telegram init data" } }
    } : {},
    "/api/auth/telegram": { post: { summary: "Create session from Telegram init data" } },
    "/live": { get: { summary: "Process liveness" } },
    "/healthz": { get: { summary: "Process health/liveness alias" } },
    "/ready": { get: { summary: "Database/config readiness without internal details" } },
    "/api/telegram/webhook": { post: { summary: "Receive Telegram bot update" } },
    "/api/saby/webhook/{secret}": { post: { summary: "Receive Saby change signal; body is stored but not trusted as sales data" } },
    "/api/saby/status": { get: { summary: "Saby sync status" } },
    "/api/saby/mappings": { get: { summary: "List Saby nomenclature mappings" }, put: { summary: "Map Saby nomenclature UUID to a Dvorik product" } },
    "/api/telegram/onboarding/{id}/approve": { post: { summary: "Approve pending Telegram user" } },
    "/api/notification-preferences": { get: { summary: "List notification preferences" }, put: { summary: "Set notification preference" } },
    "/api/auth/logout": { post: { summary: "Revoke current session" } },
    "/api/session": { get: { summary: "Current session" } },
    "/api/staff": { get: { summary: "List active staff for scheduling" } },
    "/api/staff/profiles": { get: { summary: "List non-financial employee profiles" } },
    "/api/staff/{id}/profile": { put: { summary: "Create or update non-financial employee profile" } },
    "/api/hr-events": { get: { summary: "List non-financial HR events" }, post: { summary: "Record non-financial HR event" } },
    "/api/products": { get: { summary: "List products" }, post: { summary: "Create product" } },
    "/api/products/{id}": { patch: { summary: "Update product status/details" } },
    "/api/product-groups": { get: { summary: "List product groups" }, post: { summary: "Create product group" } },
    "/api/manufacturers": { get: { summary: "List manufacturers" }, post: { summary: "Create manufacturer" } },
    "/api/products/{id}/packagings": { get: { summary: "List product packagings" }, post: { summary: "Create product packaging" } },
    "/api/product-prices": { get: { summary: "List immutable price history" }, post: { summary: "Append price history" } },
    "/api/media/upload": { post: { summary: "Temporary JSON/base64 media upload, decoded limit 5 MiB; multipart target is MED-1101" } },
    "/api/stock/operations": { get: { summary: "List stock operations" }, post: { summary: "Create stock operation" } },
    "/api/stock/totals": { get: { summary: "List accounting totals separately from shelf placements" } },
    "/api/reports/{type}": { get: { summary: "Inventory, discrepancy and canonical movement report DTO" } },
    "/api/reports/{type}/export": { get: { summary: "Export report CSV" } },
    "/api/reports/{type}/pdf": { get: { summary: "Export report PDF" } },
    "/api/inventory/{locationId}/snapshot": { get: { summary: "Inventory snapshot" } },
    "/api/inventory/apply": { post: { summary: "Apply inventory adjustment" } },
    "/api/inventory/session/active": { get: { summary: "Get active whole-stock inventory session" } },
    "/api/inventory/sessions": { post: { summary: "Start whole-stock inventory session" } },
    "/api/inventory/sessions/{id}/close": { post: { summary: "Close inventory and recognize consumption" } },
    "/api/consumption": { get: { summary: "List consumption facts" }, post: { summary: "Record total-only consumption" } },
    "/api/stock/adjustments": { post: { summary: "Apply total-only stock adjustment" } },
    "/api/schedule": { get: { summary: "List shifts" }, post: { summary: "Create shift" } },
    "/api/schedule/days": { get: { summary: "List schedule day statuses" } },
    "/api/schedule/days/{date}/{locationId}": { put: { summary: "Set working or closed day" } },
    "/api/schedule/export": { get: { summary: "Export schedule as CSV or PDF" } },
    "/api/schedule/{id}": { patch: { summary: "Update shift" } },
    "/api/schedule/{id}/copy": { post: { summary: "Copy shift to date" } },
    "/api/schedule/swaps": { get: { summary: "List visible shift swaps without foreign shift metadata for sellers" }, post: { summary: "Create shift swap request" } },
    "/api/schedule/swaps/{id}/accept": { post: { summary: "Accept shift swap" } },
    "/api/schedule/swaps/{id}/decline": { post: { summary: "Decline shift swap" } },
    "/api/schedule/swaps/{id}/cancel": { post: { summary: "Cancel shift swap" } },
    "/api/schedule/exchanges": { get: { summary: "List reciprocal shift exchanges" }, post: { summary: "Offer reciprocal shift exchange" } },
    "/api/schedule/exchanges/{id}/{action}": { post: { summary: "Accept, decline or cancel reciprocal exchange" } },
    "/api/backups": { get: { summary: "List backups" }, post: { summary: "Create backup" } },
    "/api/backups/{name}/restore": { post: { summary: "Restore backup" } },
    "/api/labels/preview": { post: { summary: "Preview labels" } },
    "/api/labels/pdf": { post: { summary: "Export labels PDF and save job" } },
    "/api/labels/jobs": { get: { summary: "List label print jobs" } },
    "/api/labels/jobs/{id}/pdf": { post: { summary: "Reprint label job PDF" } }
  }
};
app.get("/api/session", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json({ user, permissions: user.permissions });
}));
app.get("/ready", (_req, res) => {
  const readiness = sessionDatabase ? (() => {
    try {
      const schema = sessionDatabase.query("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
      if (schema.length !== expectedSchemaVersions2.length || schema.some((version2, index) => version2 !== expectedSchemaVersions2[index])) {
        return { ready: false, code: "SCHEMA_VERSION_MISMATCH" };
      }
      sessionDatabase.execute("UPDATE schema_migrations SET applied_at = applied_at WHERE 1 = 0");
      const expiredLeases = sessionDatabase.query("SELECT count(*) count FROM outbox_messages WHERE status='processing' AND lease_expires_at <= ?", [(/* @__PURE__ */ new Date()).toISOString()])[0]?.count ?? 0;
      if (expiredLeases) return { ready: false, code: "OUTBOX_WORKER_STALLED" };
      return { ready: true };
    } catch {
      return { ready: false, code: "DATABASE_UNAVAILABLE" };
    }
  })() : (legacyStore?.databaseReadiness ?? unavailableLegacy)();
  if (!readiness.ready) {
    res.status(503).json({ ready: false, code: readiness.code });
    return;
  }
  res.json({ ready: true });
});
app.get("/live", (_req, res) => {
  res.json({ live: true });
});
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/metrics", (_req, res) => {
  res.type("text/plain; version=0.0.4").send(httpMetrics.prometheus());
});
if (devToolsEnabled) app.post("/api/auth/demo", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const userId = String(req.body.userId || "");
  const user = identityQueryService?.findById(userId) ?? legacyState.users.find((item) => item.id === userId);
  if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 401);
  const created3 = issueSession(user, "demo");
  res.cookie(sessionCookie, created3.token, sessionCookieOptions(runtimeConfig2.sessionCookie));
  res.status(201).json({ user: created3.user, permissions: created3.user.permissions });
}));
app.post("/api/auth/telegram", asyncRoute((req, res) => {
  const initData = String(req.body.initData || "");
  const botToken = runtimeConfig2.telegramBotToken;
  const telegramUser = verifyTelegramInitData(initData, botToken);
  const created3 = sessionService ? (() => {
    try {
      return sessionService.createForTelegram(String(telegramUser.id));
    } catch (error) {
      if (error instanceof SessionServiceError && error.code === "USER_NOT_ACTIVE") {
        throw new DomainError("AUTH_REQUIRED", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C Telegram \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 401);
      }
      throw error;
    }
  })() : (() => {
    const user = legacyState.users.find((item) => item.telegramUserId === String(telegramUser.id));
    if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C Telegram \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D", 401);
    return issueSession(user, "telegram");
  })();
  res.cookie(sessionCookie, created3.token, sessionCookieOptions(runtimeConfig2.sessionCookie));
  res.status(201).json({ user: created3.user, permissions: created3.user.permissions });
}));
app.post("/api/telegram/webhook", asyncRoute((req, res) => {
  const expectedSecret = runtimeConfig2.telegramWebhookSecret;
  if (!expectedSecret || req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    throw new DomainError("BAD_TELEGRAM_WEBHOOK_SECRET", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u0435\u043A\u0440\u0435\u0442 webhook", 401);
  }
  const resolveTelegramUser = identityQueryService ? (telegramUserId) => identityQueryService.findByTelegramUserId(telegramUserId) : void 0;
  const registerTelegramApplicant = identityService ? (input) => identityResultUser(identityService.registerTelegramApplicant({
    actorReference: { kind: "system", service: "telegram-webhook", authenticatedBy: "telegram_webhook" },
    requestId: `telegram:${input.updateId}:register`,
    channel: "telegram",
    idempotencyKey: `telegram:${input.updateId}:register`
  }, input)) : void 0;
  const resolveOnboarding = identityService ? (input) => identityResultUser(identityService.onboard({
    actorReference: { kind: "user", userId: input.actorUserId, authenticatedBy: "telegram_update" },
    requestId: `telegram:${input.updateId}:onboarding`,
    channel: "telegram",
    idempotencyKey: `telegram:${input.updateId}:onboarding`
  }, input.targetUserId, input.action, input.role)) : void 0;
  if (resolveTelegramUser && registerTelegramApplicant && resolveOnboarding) {
    res.status(200).json(handleProductionTelegramUpdate(req.body, { resolveTelegramUser, registerTelegramApplicant, resolveOnboarding }));
    return;
  }
  res.status(200).json(handleTelegramUpdate2(req.body, {
    resolveTelegramUser,
    registerTelegramApplicant,
    resolveOnboarding
  }));
}));
app.post("/api/saby/webhook/:secret", asyncRoute((req, res) => {
  if (!sabyService || !runtimeConfig2.saby) throw new DomainError("FEATURE_DISABLED", "\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F Saby \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430", 404);
  const actual = Buffer.from(req.params.secret || "", "utf8");
  const expected = Buffer.from(runtimeConfig2.saby.webhookSecret, "utf8");
  if (actual.length !== expected.length || !crypto6.timingSafeEqual(actual, expected)) throw new DomainError("BAD_SABY_WEBHOOK_SECRET", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u0435\u043A\u0440\u0435\u0442 Saby webhook", 401);
  const signal = sabyService.recordWebhookSignal(req.body ?? {});
  res.status(202).json(signal);
}));
app.get("/api/saby/status", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "saby:manage");
  if (!sabyService) {
    res.json({ enabled: false, pointId: 0, pendingSignals: 0 });
    return;
  }
  res.json({ enabled: true, pointId: runtimeConfig2.saby?.pointId, ...sabyService.status() });
}));
app.get("/api/saby/mappings", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "saby:manage");
  if (!sabyService) {
    res.json([]);
    return;
  }
  res.json(sabyService.listMappings());
}));
app.put("/api/saby/mappings", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "saby:manage");
  if (!sabyService) throw new DomainError("FEATURE_DISABLED", "\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F Saby \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430", 404);
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F Idempotency-Key", 400);
  try {
    res.json(sabyService.saveMapping({ uuid: String(req.body?.nomenclatureUuid ?? "").trim(), productId: String(req.body?.productId ?? "").trim(), actorId: user.id, idempotencyKey }));
  } catch (error) {
    if (error instanceof SabyContractError) {
      const status = error.code === "PRODUCT_NOT_FOUND" || error.code === "SABY_ITEM_NOT_FOUND" ? 404 : 409;
      throw new DomainError(error.code, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 Saby", status);
    }
    throw error;
  }
}));
app.post("/api/telegram/onboarding/:id/approve", asyncRoute((req, res) => {
  const user = actor2(req);
  if (identityService) {
    identityResponse(res, identityService.onboard(identityMetadata(req, user), req.params.id, "approve", req.body.role));
    return;
  }
  const approved = approveTelegramOnboarding2(user, req.params.id, req.body.role, () => {
    sessionService?.revokeUser(req.params.id, user.id, "onboarding_approval");
  });
  res.json(approved);
}));
app.get("/api/notification-preferences", asyncRoute((req, res) => {
  const user = actor2(req);
  if (notificationPreferenceService) {
    res.json(notificationPreferenceService.list(user.id));
    return;
  }
  res.json(legacyState.notificationPreferences.filter((item) => item.userId === user.id));
}));
app.put("/api/notification-preferences", asyncRoute((req, res) => {
  const user = actor2(req);
  if (notificationPreferenceService) {
    commandResponse(res, notificationPreferenceService.save(identityMetadata(req, user), {
      channel: req.body.channel,
      eventType: String(req.body.eventType || "all"),
      deliveryMode: req.body.deliveryMode
    }));
    return;
  }
  res.json(setNotificationPreference2(user, { channel: req.body.channel, eventType: String(req.body.eventType || "all"), deliveryMode: req.body.deliveryMode }));
}));
app.post("/api/auth/logout", asyncRoute((req, res) => {
  const cookies = parseCookies(req.header("cookie"));
  if (sessionService) {
    sessionService.logout(cookies[sessionCookie]);
  } else {
    const session2 = legacyState.sessions.find((item) => item.id === cookies[sessionCookie] && !item.revokedAt);
    if (session2) {
      session2.revokedAt = (/* @__PURE__ */ new Date()).toISOString();
      legacySaveState();
    }
  }
  res.clearCookie(sessionCookie, sessionCookieClearOptions(runtimeConfig2.sessionCookie));
  res.json({ ok: true });
}));
if (devToolsEnabled) app.get("/api/dev/config", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const users2 = identityQueryService?.listActive() ?? legacyState.users;
  res.json({
    telegramTestMode: true,
    users: users2.map((user) => ({
      id: user.id,
      telegramUserId: user.telegramUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      role: user.role,
      status: user.status
    }))
  });
}));
if (devToolsEnabled) app.post("/api/dev/telegram/init-data", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const requestedUserId = String(req.body.userId || "");
  const requestedTelegramId = String(req.body.telegramUserId || "");
  const user = identityQueryService ? identityQueryService.findById(requestedUserId) || identityQueryService.findByTelegramUserId(requestedTelegramId) : legacyState.users.find((item) => item.id === requestedUserId || item.telegramUserId === requestedTelegramId);
  if (!user) throw new DomainError("NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  const botToken = runtimeConfig2.telegramBotToken;
  const initData = signTelegramInitData(
    {
      query_id: `dev-${nanoid18()}`,
      auth_date: String(Math.floor(Date.now() / 1e3)),
      user: JSON.stringify({
        id: Number(user.telegramUserId),
        first_name: user.firstName,
        last_name: user.lastName,
        username: user.username
      })
    },
    botToken
  );
  res.json({ initData, userId: user.id, telegramUserId: user.telegramUserId });
}));
app.get("/api/summary", asyncRoute((req, res) => {
  const user = actor2(req);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vladivostok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
  if (catalogQueries) {
    res.json(catalogQueries.summary({ userId: user.id, includeAllNotifications: user.role !== "seller", today }));
    return;
  }
  refreshScheduleState2();
  const visibleProducts = legacyState.products.filter((product) => product.status === "active" || user.role !== "seller");
  const lowStock = legacyState.balances.filter((balance) => {
    const product = legacyState.products.find((item) => item.id === balance.productId);
    return product && balance.quantity <= product.lowStockThreshold;
  });
  res.json({
    activeProducts: visibleProducts.filter((item) => item.status === "active").length,
    lowStock: lowStock.length,
    currentShiftEmployees: legacyState.shifts.filter((shift) => shift.date === today && shift.status === "in_progress").flatMap((shift) => shift.employeeIds).length,
    latestOperations: legacyState.operations.slice(0, 6),
    notifications: legacyState.notifications.filter((item) => item.userId === user.id || user.role !== "seller").slice(0, 5)
  });
}));
app.get("/api/openapi.json", (_req, res) => {
  res.json(openApiContract);
});
app.get("/api/products", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:read");
  const q = normalizeSearch(String(req.query.q || ""));
  const status = String(req.query.status || "active");
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  if (catalogQueries) {
    res.json(catalogQueries.products({ status: user.role === "seller" ? "active" : status, search: q, page, limit }));
    return;
  }
  const filtered = legacyState.products.filter((product) => {
    if (user.role === "seller" && product.status !== "active") return false;
    if (status !== "all" && product.status !== status) return false;
    const haystack = normalizeSearch([
      product.officialName,
      product.localName,
      product.category,
      ...product.tags,
      ...product.identifiers.map((identifier2) => identifier2.value)
    ].join(" "));
    return !q || haystack.includes(q);
  });
  res.json({ items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit });
}));
app.post("/api/products", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:write");
  if (catalogService) {
    const identifiers = productIdentifiers("pending", req.body).map(({ id: _id, productId: _productId, ...identifier2 }) => identifier2);
    commandResponse(res, catalogService.create(identityMetadata(req, user), {
      officialName: String(req.body.officialName || ""),
      localName: String(req.body.localName || ""),
      unit: String(req.body.unit || "\u0448\u0442"),
      photoUrl: String(req.body.photoUrl || ""),
      category: String(req.body.category || "\u0411\u0435\u0437 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"),
      lowStockThreshold: Number(req.body.lowStockThreshold ?? 5),
      identifiers,
      groupId: req.body.groupId ? String(req.body.groupId) : void 0,
      manufacturerId: req.body.manufacturerId ? String(req.body.manufacturerId) : void 0,
      inventoryKind: String(req.body.inventoryKind || "piece"),
      packageMassGrams: req.body.packageMassGrams === void 0 || req.body.packageMassGrams === "" ? void 0 : Number(req.body.packageMassGrams),
      article: String(req.body.article || "")
    }));
    return;
  }
  const unit = String(req.body.unit || "\u0448\u0442");
  if (!["\u0448\u0442", "\u043A\u0433", "\u043B", "\u043C"].includes(unit)) throw new DomainError("VALIDATION_ERROR", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0435\u0434\u0438\u043D\u0438\u0446\u0430 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F");
  const lowStockThreshold = Number(req.body.lowStockThreshold ?? 5);
  const product = {
    id: nanoid18(),
    officialName: String(req.body.officialName || "").trim(),
    localName: String(req.body.localName || "").trim(),
    unit,
    photoUrl: String(req.body.photoUrl || "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80"),
    category: String(req.body.category || "\u0411\u0435\u0437 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"),
    tags: [],
    status: "active",
    identifiers: [],
    lowStockThreshold
  };
  if (!product.officialName) throw new DomainError("VALIDATION_ERROR", "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
  product.identifiers = productIdentifiers(product.id, req.body);
  legacyState.products.unshift(product);
  audit2(user.id, "product", product.id, "create", product);
  res.status(201).json(product);
}));
app.post("/api/media/upload", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:write");
  const mimeType = String(req.body.mimeType || "");
  const allowed = /* @__PURE__ */ new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
  const extension = allowed.get(mimeType);
  if (!extension) throw new DomainError("BAD_MEDIA_TYPE", "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F JPEG, PNG \u0438 WebP");
  const base64 = normalizeMediaBase64(String(req.body.base64 || ""));
  const decodedBytes = decodedBase64ByteLength(base64);
  if (decodedBytes === null) throw new DomainError("BAD_MEDIA_DATA", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F");
  if (decodedBytes > MEDIA_UPLOAD_MAX_BYTES) throw new DomainError("MEDIA_TOO_LARGE", `\u0420\u0430\u0437\u043C\u0435\u0440 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0442\u044C ${MEDIA_UPLOAD_MAX_LABEL}`, 413);
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length !== decodedBytes) throw new DomainError("BAD_MEDIA_DATA", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F");
  return compressImage(buffer, mimeType).then(async ({ body, mimeType: finalMimeType, compressed, width, height }) => {
    const stored = await mediaStorage.put({ key: mediaKey(finalMimeType), body, mimeType: finalMimeType });
    const changes = { mimeType: finalMimeType, bytes: stored.bytes, originalBytes: buffer.length, compressed, width, height, storage: stored.storage };
    if (artifactService) {
      const metadata = identityMetadata(req, user);
      requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`media:${stored.key}`, metadata.idempotencyKey) }, "products:write", {
        scope: "artifact.media.upload",
        entity: "media",
        entityId: stored.key,
        action: "upload",
        changes: jsonObjectValue(changes)
      }));
    } else audit2(user.id, "media", stored.key, "upload", changes);
    res.status(201).json({ url: stored.url, name: stored.key, mimeType: finalMimeType, bytes: stored.bytes, originalBytes: buffer.length, compressed, width, height, storage: stored.storage });
  });
}));
app.post("/api/media/validate-link", asyncRoute(async (req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:write");
  const value = String(req.body.url || "").trim();
  const result = await validateExternalMediaUrl(value);
  audit2(user.id, "media", value, "validate_link", { contentType: result.contentType, bytes: result.bytes });
  res.json({ valid: true, ...result });
}));
app.patch("/api/products/:id", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:write");
  if (catalogService) {
    commandResponse(res, catalogService.update(identityMetadata(req, user), {
      productId: req.params.id,
      ...req.body.status === void 0 ? {} : { status: String(req.body.status) },
      ...req.body.localName === void 0 ? {} : { localName: String(req.body.localName) },
      ...req.body.category === void 0 ? {} : { category: String(req.body.category) },
      ...req.body.groupId === void 0 ? {} : { groupId: String(req.body.groupId) },
      ...req.body.manufacturerId === void 0 ? {} : { manufacturerId: String(req.body.manufacturerId) },
      ...req.body.packageMassGrams === void 0 ? {} : { packageMassGrams: Number(req.body.packageMassGrams) },
      ...req.body.article === void 0 ? {} : { article: String(req.body.article) }
    }));
    return;
  }
  const product = legacyState.products.find((item) => item.id === req.params.id);
  if (!product) throw new DomainError("NOT_FOUND", "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  const status = req.body.status !== void 0 ? String(req.body.status) : product.status;
  if (!["active", "archived", "deleted"].includes(status)) throw new DomainError("VALIDATION_ERROR", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0442\u043E\u0432\u0430\u0440\u0430");
  Object.assign(product, {
    status,
    localName: req.body.localName !== void 0 ? String(req.body.localName).trim() : product.localName,
    category: req.body.category !== void 0 ? String(req.body.category).trim() : product.category
  });
  audit2(user.id, "product", product.id, "update", req.body);
  res.json(product);
}));
app.get("/api/product-groups", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:read");
  res.json(catalogQueries?.groups() ?? []);
}));
app.post("/api/product-groups", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, catalogService.createGroup(identityMetadata(req, user), { name: String(req.body.name || ""), inventoryKind: String(req.body.inventoryKind || "") }));
}));
app.get("/api/manufacturers", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "products:read");
  res.json(catalogQueries?.manufacturers() ?? []);
}));
app.post("/api/manufacturers", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, catalogService.createManufacturer(identityMetadata(req, user), { name: String(req.body.name || "") }));
}));
app.get("/api/products/:id/packagings", asyncRoute((req, res) => {
  actor2(req);
  res.json(catalogQueries?.packagings(req.params.id) ?? []);
}));
app.post("/api/products/:id/packagings", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, catalogService.addPackaging(identityMetadata(req, user), {
    productId: req.params.id,
    name: String(req.body.name || ""),
    unitsPerPackage: Number(req.body.unitsPerPackage || 1),
    massGrams: req.body.massGrams === void 0 || req.body.massGrams === "" ? void 0 : Number(req.body.massGrams),
    isPrimary: Boolean(req.body.isPrimary)
  }));
}));
app.get("/api/product-prices", asyncRoute((req, res) => {
  actor2(req);
  res.json(catalogQueries?.prices({ groupId: typeof req.query.groupId === "string" ? req.query.groupId : void 0, productId: typeof req.query.productId === "string" ? req.query.productId : void 0 }) ?? []);
}));
app.post("/api/product-prices", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, catalogService.addPrice(identityMetadata(req, user), {
    groupId: req.body.groupId ? String(req.body.groupId) : void 0,
    productId: req.body.productId ? String(req.body.productId) : void 0,
    priceKopecks: Number(req.body.priceKopecks),
    priceUnit: String(req.body.priceUnit || ""),
    effectiveFrom: String(req.body.effectiveFrom || "")
  }));
}));
app.post("/api/products/archive/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(previewArchiveCandidates2(user, Number(req.body.inactiveDays || 90)));
}));
app.post("/api/products/archive/commit", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(commitArchiveCandidates2(user, { inactiveDays: Number(req.body.inactiveDays || 90), productIds: req.body.productIds || [], idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") }));
}));
app.get("/api/locations", asyncRoute((req, res) => {
  actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.locations());
    return;
  }
  res.json(legacyState.locations.filter((location) => location.status === "active"));
}));
app.post("/api/locations", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, catalogService.saveLocation(identityMetadata(req, user), {
    code: String(req.body.code || ""),
    name: String(req.body.name || ""),
    type: String(req.body.type || "other"),
    parentId: req.body.parentId ? String(req.body.parentId) : void 0
  }));
}));
app.patch("/api/locations/:id", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!catalogService || !catalogQueries) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  const current = catalogQueries.locationById(req.params.id);
  if (!current) throw new DomainError("NOT_FOUND", "\u041F\u043E\u043B\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
  commandResponse(res, catalogService.saveLocation(identityMetadata(req, user), {
    id: current.id,
    code: req.body.code === void 0 ? current.code : String(req.body.code),
    name: req.body.name === void 0 ? current.name : String(req.body.name),
    type: req.body.type === void 0 ? current.type : String(req.body.type),
    parentId: req.body.parentId === void 0 ? current.parentId : String(req.body.parentId || "") || void 0,
    status: req.body.status === void 0 ? current.status : String(req.body.status)
  }));
}));
app.get("/api/balances", asyncRoute((req, res) => {
  actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.balances());
    return;
  }
  res.json(legacyState.balances);
}));
app.get("/api/stock/totals", asyncRoute((req, res) => {
  actor2(req);
  res.json(catalogQueries?.totals() ?? []);
}));
app.post("/api/stock/operations", asyncRoute((req, res) => {
  const user = actor2(req);
  if (stockService) {
    commandResponse(res, stockService.execute(identityMetadata(req, user), {
      type: String(req.body.type || ""),
      productId: String(req.body.productId || ""),
      ...req.body.fromLocationId ? { fromLocationId: String(req.body.fromLocationId) } : {},
      ...req.body.toLocationId ? { toLocationId: String(req.body.toLocationId) } : {},
      quantity: Number(req.body.quantity),
      reason: String(req.body.reason || "")
    }));
    return;
  }
  const operation = applyStockOperation2({
    user,
    type: req.body.type,
    productId: req.body.productId,
    fromLocationId: req.body.fromLocationId,
    toLocationId: req.body.toLocationId,
    quantity: Number(req.body.quantity),
    reason: String(req.body.reason || ""),
    idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "")
  });
  res.status(201).json(operation);
}));
app.post("/api/stock/operations/:id/reverse", asyncRoute((req, res) => {
  const user = actor2(req);
  if (reversalService) {
    commandResponse(res, reversalService.execute(identityMetadata(req, user), req.params.id));
    return;
  }
  const operation = reverseOperation2(user, req.params.id, String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(201).json(operation);
}));
app.get("/api/stock/operations", asyncRoute((req, res) => {
  actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.operations());
    return;
  }
  res.json(legacyState.operations.slice(0, 100));
}));
app.get("/api/reports/:type", asyncRoute((req, res) => {
  const user = actor2(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u043E\u0442\u0447\u0451\u0442\u0430");
  const query = {
    from: typeof req.query.from === "string" ? req.query.from : void 0,
    to: typeof req.query.to === "string" ? req.query.to : void 0,
    productId: typeof req.query.productId === "string" ? req.query.productId : void 0,
    locationId: typeof req.query.locationId === "string" ? req.query.locationId : void 0
  };
  if (catalogQueries) {
    requirePermission(user, "reports:read");
    res.json(catalogQueries.reportRows(type, query));
    return;
  }
  res.json(reportRows2(user, type, query));
}));
app.get("/api/reports/:type/export", asyncRoute((req, res) => {
  const user = actor2(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u043E\u0442\u0447\u0451\u0442\u0430");
  const query = { from: typeof req.query.from === "string" ? req.query.from : void 0, to: typeof req.query.to === "string" ? req.query.to : void 0 };
  const rows = catalogQueries ? (requirePermission(user, "reports:read"), catalogQueries.reportRows(type, query)) : reportRows2(user, type, query);
  const columns = type === "movements" ? movementReportColumns : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="report-${type}.csv"`).send(`\uFEFF${csv}`);
}));
app.get("/api/reports/:type/pdf", asyncRoute(async (req, res) => {
  const user = actor2(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u043E\u0442\u0447\u0451\u0442\u0430");
  const query = { from: typeof req.query.from === "string" ? req.query.from : void 0, to: typeof req.query.to === "string" ? req.query.to : void 0, productId: typeof req.query.productId === "string" ? req.query.productId : void 0, locationId: typeof req.query.locationId === "string" ? req.query.locationId : void 0 };
  const pdf = catalogQueries ? await (requirePermission(user, "reports:read"), renderReportPdfRows(type, catalogQueries.reportRows(type, query), query)) : await renderReportPdf2(user, type, query);
  res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", `attachment; filename="report-${type}.pdf"`).send(pdf);
}));
app.post("/api/reports/:type/telegram", asyncRoute(async (req, res) => {
  const user = actor2(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u043E\u0442\u0447\u0451\u0442\u0430");
  const message = await queueReportTelegram2(user, type, { from: typeof req.body?.from === "string" ? req.body.from : void 0, to: typeof req.body?.to === "string" ? req.body.to : void 0, productId: typeof req.body?.productId === "string" ? req.body.productId : void 0, locationId: typeof req.body?.locationId === "string" ? req.body.locationId : void 0 });
  res.status(202).json({ id: message.id, status: message.status });
}));
app.get("/api/inventory/:locationId/snapshot", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "inventory:write");
  if (catalogQueries) {
    if (!catalogQueries.locations().some((location) => location.id === req.params.locationId)) throw new DomainError("NOT_FOUND", "\u0422\u043E\u0447\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
    res.json(catalogQueries.inventorySnapshot(req.params.locationId));
    return;
  }
  res.json(inventorySnapshot2(req.params.locationId));
}));
app.get("/api/inventory/session/active", asyncRoute((req, res) => {
  actor2(req);
  res.json(catalogQueries?.activeInventorySession() ?? null);
}));
app.post("/api/inventory/sessions", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, inventorySessionService.start(identityMetadata(req, user)));
}));
app.post("/api/inventory/sessions/:id/close", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, inventorySessionService.close(identityMetadata(req, user), req.params.id, { rows: Array.isArray(req.body.rows) ? req.body.rows : [], comment: String(req.body.comment || "") }));
}));
app.get("/api/consumption", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "inventory:write");
  res.json(catalogQueries?.consumptions() ?? []);
}));
app.post("/api/consumption", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, inventorySessionService.consume(identityMetadata(req, user), { productId: String(req.body.productId || ""), quantity: Number(req.body.quantity), comment: String(req.body.comment || ""), source: req.body.source === "damage" ? "damage" : "manual" }));
}));
app.post("/api/stock/adjustments", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, inventorySessionService.adjust(identityMetadata(req, user), { productId: String(req.body.productId || ""), delta: Number(req.body.delta), comment: String(req.body.comment || "") }));
}));
app.post("/api/inventory/apply", asyncRoute((req, res) => {
  const user = actor2(req);
  if (inventoryService) {
    commandResponse(res, inventoryService.execute(identityMetadata(req, user), {
      rows: Array.isArray(req.body.rows) ? req.body.rows : [],
      comment: String(req.body.comment || "")
    }));
    return;
  }
  const operations = applyInventory2(user, req.body.rows || [], String(req.body.comment || ""), String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(201).json({ operations });
}));
app.post("/api/stock/buffer/apply", asyncRoute((req, res) => {
  const user = actor2(req);
  const results = applyBufferedStockOperations2(user, req.body.entries || [], String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(200).json({ results });
}));
app.get("/api/schedule", asyncRoute((req, res) => {
  const user = actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.shifts({
      ...typeof req.query.from === "string" ? { from: req.query.from } : {},
      ...typeof req.query.to === "string" ? { to: req.query.to } : {}
    }));
    return;
  }
  refreshScheduleState2();
  res.json(listVisibleScheduleShifts2(user));
}));
app.get("/api/schedule/days", asyncRoute((req, res) => {
  const user = actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.days({
      ...typeof req.query.from === "string" ? { from: req.query.from } : {},
      ...typeof req.query.to === "string" ? { to: req.query.to } : {}
    }));
    return;
  }
  res.json(legacyState.scheduleDays);
}));
app.put("/api/schedule/days/:date/:locationId", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService && catalogQueries) {
    commandResponse(res, scheduleService.saveDay(identityMetadata(req, user), {
      date: req.params.date,
      locationId: req.params.locationId,
      status: req.body.status,
      comment: String(req.body.comment || ""),
      expectedVersion: catalogQueries.dayRevision(req.params.date, req.params.locationId)
    }));
    return;
  }
  const day = setScheduleDay2(user, {
    date: req.params.date,
    locationId: req.params.locationId,
    status: req.body.status,
    comment: String(req.body.comment || "")
  });
  res.json(day);
}));
app.get("/api/schedule/export", asyncRoute((req, res) => {
  const user = actor2(req);
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const format = String(req.query.format || "csv");
  const locationId = req.query.locationId ? String(req.query.locationId) : void 0;
  const rows = catalogQueries ? (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new DomainError("BAD_EXPORT_RANGE", "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0434\u0430\u0442");
    return catalogQueries.shifts({ from, to }).filter((shift) => !locationId || shift.locationId === locationId);
  })() : scheduleExportRows(user, from, to, locationId);
  const sqlLocations = catalogQueries ? new Map(catalogQueries.locations().map((location) => [location.id, location.name])) : void 0;
  const employeeName = (id) => {
    const employee = identityQueryService?.findById(id) ?? (!catalogQueries ? legacyState.users.find((item) => item.id === id) : void 0);
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() || employee.id : id;
  };
  if (format === "csv") {
    const csv = [
      ["\u0414\u0430\u0442\u0430", "\u041B\u043E\u043A\u0430\u0446\u0438\u044F", "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438", "\u0421\u0442\u0430\u0442\u0443\u0441", "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439"].map(csvCell).join(","),
      ...rows.map((shift) => [shift.date, sqlLocations?.get(shift.locationId) ?? (legacyState.locations.find((item) => item.id === shift.locationId)?.name || shift.locationId), shift.employeeIds.map(employeeName).join("; "), shift.status, shift.comment].map(csvCell).join(","))
    ].join("\n");
    res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="schedule-${from}_${to}.csv"`).send(`\uFEFF${csv}`);
    return;
  }
  if (format === "pdf") return renderSchedulePdf(res, rows, from, to, catalogQueries ? { locationName: (id) => sqlLocations?.get(id) ?? id, employeeName } : void 0);
  throw new DomainError("BAD_EXPORT_FORMAT", "\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E CSV \u0438 PDF");
}));
app.post("/api/schedule/rotation/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(previewRotation2(user, req.body));
}));
app.post("/api/schedule/rotation/commit", asyncRoute((req, res) => {
  const user = actor2(req);
  res.status(201).json(commitRotation2(user, { ...req.body, idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") }));
}));
app.post("/api/schedule/future-replacement/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(previewFutureReplacement2(user, req.body));
}));
app.post("/api/schedule/future-replacement/commit", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(commitFutureReplacement2(user, { ...req.body, idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") }));
}));
app.post("/api/schedule", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService) {
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      date: String(req.body.date || ""),
      start: String(req.body.start || ""),
      end: String(req.body.end || ""),
      locationId: String(req.body.locationId || ""),
      employeeIds: Array.isArray(req.body.employeeIds) ? req.body.employeeIds : [],
      status: req.body.status,
      comment: String(req.body.comment || ""),
      expectedVersion: null
    }));
    return;
  }
  const shift = createShift2(user, {
    date: String(req.body.date || ""),
    start: String(req.body.start || ""),
    end: String(req.body.end || ""),
    locationId: String(req.body.locationId || ""),
    employeeIds: req.body.employeeIds || [],
    status: req.body.status,
    comment: String(req.body.comment || "")
  });
  refreshScheduleState2(/* @__PURE__ */ new Date(), user.id);
  res.status(201).json(shift);
}));
app.patch("/api/schedule/:id", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService && catalogQueries) {
    const current = catalogQueries.shiftForWrite(req.params.id);
    if (!current) throw new DomainError("NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      id: current.shift.id,
      date: req.body.date === void 0 ? current.shift.date : String(req.body.date),
      start: req.body.start === void 0 ? current.shift.start : String(req.body.start),
      end: req.body.end === void 0 ? current.shift.end : String(req.body.end),
      locationId: req.body.locationId === void 0 ? current.shift.locationId : String(req.body.locationId),
      employeeIds: Array.isArray(req.body.employeeIds) ? req.body.employeeIds : current.shift.employeeIds,
      status: req.body.status === void 0 ? current.shift.status : req.body.status,
      comment: req.body.comment === void 0 ? current.shift.comment : String(req.body.comment),
      expectedVersion: Number(current.revision)
    }));
    return;
  }
  const shift = updateShift2(user, req.params.id, req.body);
  refreshScheduleState2(/* @__PURE__ */ new Date(), user.id);
  res.json(shift);
}));
app.post("/api/schedule/:id/copy", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService && catalogQueries) {
    const source = catalogQueries.shiftForWrite(req.params.id);
    if (!source) throw new DomainError("NOT_FOUND", "\u0421\u043C\u0435\u043D\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      date: String(req.body.date || ""),
      start: source.shift.start,
      end: source.shift.end,
      locationId: source.shift.locationId,
      employeeIds: source.shift.employeeIds,
      status: source.shift.status === "scheduled" || source.shift.status === "draft" ? source.shift.status : "draft",
      comment: source.shift.comment,
      expectedVersion: null
    }));
    return;
  }
  const shift = copyShift2(user, req.params.id, String(req.body.date || ""));
  refreshScheduleState2(/* @__PURE__ */ new Date(), user.id);
  res.status(201).json(shift);
}));
app.get("/api/staff", asyncRoute((req, res) => {
  actor2(req);
  res.json(identityQueryService?.listActive() ?? legacyState.users.filter((user) => user.status === "active"));
}));
app.get("/api/staff/profiles", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "staff:manage");
  res.json(catalogQueries?.employeeProfiles() ?? []);
}));
app.put("/api/staff/:id/profile", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, staffScheduleService.saveProfile(identityMetadata(req, user), req.params.id, {
    personnelNumber: req.body.personnelNumber,
    position: String(req.body.position || ""),
    hiredOn: String(req.body.hiredOn || ""),
    dismissedOn: req.body.dismissedOn ? String(req.body.dismissedOn) : void 0,
    status: req.body.status,
    expectedVersion: req.body.expectedVersion === void 0 ? void 0 : Number(req.body.expectedVersion)
  }));
}));
app.get("/api/hr-events", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "staff:manage");
  res.json(catalogQueries?.hrEvents({
    ...typeof req.query.userId === "string" ? { userId: req.query.userId } : {},
    ...typeof req.query.from === "string" ? { from: req.query.from } : {},
    ...typeof req.query.to === "string" ? { to: req.query.to } : {}
  }) ?? []);
}));
app.post("/api/hr-events", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043A\u0430\u0434\u0440\u043E\u0432\u044B\u0445 \u0441\u043E\u0431\u044B\u0442\u0438\u0439 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, staffScheduleService.recordHrEvent(identityMetadata(req, user), {
    userId: String(req.body.userId || ""),
    type: req.body.type,
    startDate: String(req.body.startDate || ""),
    endDate: req.body.endDate ? String(req.body.endDate) : void 0,
    shiftId: req.body.shiftId ? String(req.body.shiftId) : void 0,
    minutesLate: req.body.minutesLate === void 0 ? void 0 : Number(req.body.minutesLate),
    comment: String(req.body.comment || "")
  }));
}));
app.get("/api/schedule/exchanges", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(catalogQueries?.exchanges(hasPermission(user, "schedule:manage") ? void 0 : user.id) ?? []);
}));
app.post("/api/schedule/exchanges", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043E\u0431\u043C\u0435\u043D\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  commandResponse(res, staffScheduleService.createExchange(identityMetadata(req, user), {
    fromShiftId: String(req.body.fromShiftId || ""),
    toShiftId: String(req.body.toShiftId || "")
  }));
}));
app.post("/api/schedule/exchanges/:id/:action", asyncRoute((req, res) => {
  const user = actor2(req);
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u043E\u0431\u043C\u0435\u043D\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
  const action = req.params.action;
  if (action !== "accept" && action !== "decline" && action !== "cancel") throw new DomainError("BAD_ACTION", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435", 400);
  commandResponse(res, staffScheduleService.resolveExchange(identityMetadata(req, user), req.params.id, action));
}));
app.get("/api/schedule/swaps", asyncRoute((req, res) => {
  const user = actor2(req);
  if (catalogQueries) {
    res.json(catalogQueries.swaps(hasPermission(user, "schedule:manage") ? {} : { userId: user.id }));
    return;
  }
  refreshScheduleState2();
  res.json(listVisibleScheduleSwaps2(user));
}));
app.post("/api/schedule/swaps", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService) {
    commandResponse(res, scheduleService.createSwap(identityMetadata(req, user), {
      shiftId: String(req.body.fromShiftId || ""),
      toUserId: String(req.body.toUserId || "")
    }));
    return;
  }
  refreshScheduleState2();
  const swap = createSwapRequest2(user, String(req.body.fromShiftId || ""), String(req.body.toUserId || ""));
  res.status(201).json(swap);
}));
app.post("/api/schedule/swaps/:id/accept", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "accept" }));
    return;
  }
  refreshScheduleState2();
  res.json(acceptSwap2(user, req.params.id));
}));
app.post("/api/schedule/swaps/:id/decline", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "decline" }));
    return;
  }
  refreshScheduleState2();
  res.json(declineSwap2(user, req.params.id));
}));
app.post("/api/schedule/swaps/:id/cancel", asyncRoute((req, res) => {
  const user = actor2(req);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "cancel" }));
    return;
  }
  refreshScheduleState2();
  res.json(cancelSwap2(user, req.params.id));
}));
app.get("/api/users", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "users:manage");
  res.json(identityQueryService?.listForActor(user.id) ?? legacyState.users);
}));
app.patch("/api/users/:id", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "users:manage");
  if (identityService) {
    identityResponse(res, identityService.update(identityMetadata(req, user), req.params.id, {
      ...req.body.status === void 0 ? {} : { status: req.body.status },
      ...req.body.role === void 0 ? {} : { role: req.body.role }
    }));
    return;
  }
  const target = legacyState.users.find((item) => item.id === req.params.id);
  if (!target) throw new DomainError("NOT_FOUND", "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
  if (req.body.role && !hasPermission(user, "roles:manage")) throw new DomainError("FORBIDDEN", "\u0420\u043E\u043B\u044C \u043C\u0435\u043D\u044F\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E super admin", 403);
  if (req.body.status || req.body.role) sessionService?.revokeUser(target.id, user.id, "user_status_or_role_change");
  Object.assign(target, {
    status: req.body.status ?? target.status,
    role: req.body.role ?? target.role
  });
  if (req.body.role) {
    target.permissions = rolePermissions[target.role];
  }
  if (req.body.status || req.body.role) {
    const revokedAt = (/* @__PURE__ */ new Date()).toISOString();
    for (const session2 of legacyState.sessions.filter((item) => item.userId === target.id && !item.revokedAt)) {
      session2.revokedAt = revokedAt;
    }
  }
  audit2(user.id, "user", target.id, "update", req.body);
  res.json(target);
}));
app.get("/api/audit", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "techlog:read");
  if (catalogQueries) {
    res.json(catalogQueries.audit());
    return;
  }
  res.json(legacyState.audit.slice(0, 100));
}));
app.post("/api/backups", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    const backup2 = createSqliteBackupBundle({ database: sessionDatabase, backupDirectory: runtimeConfig2.backupDir, mediaDirectory: mediaDir });
    if (!artifactService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0430\u0443\u0434\u0438\u0442\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
    const metadata = identityMetadata(req, user);
    requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`backup:${backup2.name}:create`, metadata.idempotencyKey) }, "techlog:read", {
      scope: "artifact.backup.create",
      entity: "backup",
      entityId: backup2.name,
      action: "create",
      changes: jsonObjectValue(backup2)
    }));
    res.status(201).json(backup2);
    return;
  }
  const backup = createBackup2();
  audit2(user.id, "backup", path6.basename(backup.path), "create", backup);
  res.status(201).json(backup);
}));
app.get("/api/backups", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    res.json(listSqliteBackupBundles(runtimeConfig2.backupDir));
    return;
  }
  res.json(listBackups2());
}));
app.post("/api/backups/:name/restore", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    const backup = listSqliteBackupBundles(runtimeConfig2.backupDir).find((item) => item.name === req.params.name);
    if (!backup) throw new DomainError("NOT_FOUND", "Backup not found", 404);
    const suffix = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const restored2 = restoreSqliteBackupBundle({
      bundlePath: backup.path,
      databasePath: `${runtimeConfig2.sqliteFile}.restore-${suffix}`,
      mediaDirectory: `${mediaDir}.restore-${suffix}`
    });
    if (!artifactService) throw new DomainError("SERVICE_UNAVAILABLE", "\u0421\u0435\u0440\u0432\u0438\u0441 \u0430\u0443\u0434\u0438\u0442\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D", 503);
    const metadata = identityMetadata(req, user);
    requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`backup:${backup.name}:restore`, metadata.idempotencyKey) }, "techlog:read", {
      scope: "artifact.backup.restore",
      entity: "backup",
      entityId: backup.name,
      action: "restore_preflight",
      changes: jsonObjectValue(restored2)
    }));
    res.json(restored2);
    return;
  }
  const restored = restoreBackup2(req.params.name);
  audit2(user.id, "backup", req.params.name, "restore", restored);
  res.json(restored);
}));
app.post("/api/imports/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  const content = String(req.body.content || req.body.base64 || req.body.csv || "");
  const draft = previewCsvImport2(user, String(req.body.fileName || "import.csv"), content, { supplierName: String(req.body.supplierName || ""), invoiceNumber: String(req.body.invoiceNumber || ""), columnMapping: req.body.columnMapping || void 0 });
  res.status(201).json(draft);
}));
app.post("/api/imports/:id/commit", asyncRoute((req, res) => {
  const user = actor2(req);
  const committed = commitCsvImport2(user, req.params.id, String(req.body.locationId || "loc-main"), String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.json(committed);
}));
app.post("/api/imports/:id/undo", asyncRoute((req, res) => {
  const user = actor2(req);
  const reverted = undoCsvImport2(user, req.params.id, String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.json(reverted);
}));
app.get("/api/imports", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "imports:write");
  res.json(legacyState.imports.slice(0, 50));
}));
app.post("/api/merges/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  const merge = previewProductMerge2(user, String(req.body.sourceProductId || ""), String(req.body.targetProductId || ""), req.body.resolution || {});
  res.status(201).json(merge);
}));
app.get("/api/merges/candidates", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "merge:write");
  const normalize2 = (value) => normalizeSearch(value).replace(/\b(товар|продукт|шт)\b/g, "").trim();
  const groups = /* @__PURE__ */ new Map();
  for (const product of legacyState.products.filter((item) => item.status === "active")) {
    const key = normalize2(product.localName || product.officialName);
    if (key) groups.set(key, [...groups.get(key) || [], product]);
  }
  res.json([...groups.entries()].filter(([, products2]) => products2.length > 1).map(([key, products2]) => ({ key, score: 1, explanation: "\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442", productIds: products2.map((product) => product.id) })));
}));
app.post("/api/merges/:id/commit", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(commitProductMerge2(user, req.params.id));
}));
app.post("/api/merges/:id/undo", asyncRoute((req, res) => {
  const user = actor2(req);
  res.json(undoProductMerge2(user, req.params.id));
}));
app.get("/api/merges", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "merge:write");
  res.json(legacyState.merges.slice(0, 50));
}));
app.post("/api/labels/preview", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "labels:print");
  const job = labelJobFromBody(user, req.body);
  const expandedLabels = expandLabels(job.labels);
  res.json({
    geometry: job.geometry,
    templateId: job.templateId,
    overflow: job.geometry.labelsPerPage < expandedLabels.length,
    items: job.labels,
    labels: expandedLabels
  });
}));
app.post("/api/labels/pdf", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "labels:print");
  const job = labelJobFromBody(user, req.body);
  if (expandLabels(job.labels).length > job.geometry.labelsPerPage) throw new DomainError("LABELS_OVERFLOW", "\u042D\u0442\u0438\u043A\u0435\u0442\u043A\u0438 \u043D\u0435 \u043F\u043E\u043C\u0435\u0449\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u043E\u0434\u043D\u0443 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443");
  if (artifactService) {
    const result = artifactService.createLabel(identityMetadata(req, user), job);
    if (result.outcome === "executed" || result.outcome === "replayed") {
      renderLabelsPdf(res, result.body);
      return;
    }
    commandResponse(res, result);
    return;
  }
  legacyState.labelJobs.unshift(job);
  audit2(user.id, "label_job", job.id, "create", { labels: expandLabels(job.labels).length, templateId: job.templateId, geometry: job.geometry });
  renderLabelsPdf(res, job);
}));
app.get("/api/labels/jobs", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "labels:print");
  if (sessionDatabase) {
    res.json(sessionDatabase.query("SELECT * FROM label_jobs ORDER BY created_at DESC, id DESC LIMIT 50").map(sqliteLabelJob));
    return;
  }
  res.json(legacyState.labelJobs.slice(0, 50));
}));
app.post("/api/labels/jobs/:id/pdf", asyncRoute((req, res) => {
  const user = actor2(req);
  requirePermission(user, "labels:print");
  if (artifactService) {
    const result = artifactService.recordLabelReprint(identityMetadata(req, user), req.params.id);
    if (result.outcome === "executed" || result.outcome === "replayed") {
      renderLabelsPdf(res, result.body);
      return;
    }
    commandResponse(res, result);
    return;
  }
  const job = legacyState.labelJobs.find((item) => item.id === req.params.id);
  if (!job) throw new DomainError("NOT_FOUND", "\u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u043F\u0435\u0447\u0430\u0442\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E", 404);
  audit2(user.id, "label_job", job.id, "reprint", { labels: expandLabels(job.labels).length });
  renderLabelsPdf(res, job);
}));
app.use("/media", express.static(mediaStorage.localDirectory || mediaDir, { fallthrough: false, maxAge: "7d" }));
app.use((error, _req, res, _next) => {
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
    res.status(400).json({ code: "MALFORMED_JSON", message: "Malformed JSON request body" });
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    const mediaUpload = _req.originalUrl.startsWith("/api/media/upload");
    res.status(413).json({
      code: mediaUpload ? "MEDIA_BODY_TOO_LARGE" : "PAYLOAD_TOO_LARGE",
      message: mediaUpload ? `\u0422\u0435\u043B\u043E \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043B\u0438\u043C\u0438\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F ${MEDIA_UPLOAD_MAX_LABEL}` : "\u0422\u0435\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435"
    });
    return;
  }
  if (error instanceof DomainError) {
    res.status(error.status).json({ code: error.code, message: error.message, details: error.details });
    return;
  }
  const requestId = String(res.getHeader("X-Request-Id") || "");
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
  console.error(JSON.stringify({ event: "http_error", requestId, method: _req.method, path: _req.path, name, message }));
  res.status(500).json({ code: "INTERNAL_ERROR", message: "\u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430", requestId });
});
if (!devToolsEnabled) {
  app.all(["/api/auth/demo", "/api/dev/config", "/api/dev/telegram/init-data"], (_req, res) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
  });
}
var port = Number(process.env.PORT || 5177);
var closeRuntime = async () => {
};
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path6.resolve(__dirname, "public")));
  app.get("*", (_req, res) => res.sendFile(path6.resolve(__dirname, "public/index.html")));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: path6.resolve(__dirname, "../client")
  });
  app.use(vite.middlewares);
  closeRuntime = () => vite.close();
}
var server = app.listen(port, "0.0.0.0", () => {
  console.log(`Dvorik WebApp: http://localhost:${port}`);
});
var shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: "shutdown", signal }));
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    try {
      sessionDatabase?.close();
    } catch {
    }
    try {
      closeDatabase2();
    } catch {
    }
    process.exitCode = 1;
  }, 1e4);
  timeout.unref();
  server.close(async (error) => {
    clearTimeout(timeout);
    try {
      await closeRuntime();
      sessionDatabase?.close();
      closeDatabase2();
    } catch {
      process.exitCode = 1;
      return;
    }
    process.exitCode = error ? 1 : 0;
  });
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
