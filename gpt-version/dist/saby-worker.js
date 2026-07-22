// src/server/config.ts
import fs from "node:fs";
import path from "node:path";
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
var devTokens = /* @__PURE__ */ new Set(["dev-token", "test-token", "dev-webhook-secret", "test-webhook-secret"]);
function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required production config: ${name}`);
  return value;
}
function absolute(env, name) {
  const value = required(env, name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}
function directory(env, name) {
  const value = absolute(env, name);
  try {
    const stat = fs.statSync(value);
    fs.accessSync(value, fs.constants.R_OK | fs.constants.W_OK);
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
  const mediaDir = directory(env, "DVORIK_MEDIA_DIR");
  const backupDir = directory(env, "DVORIK_BACKUP_DIR");
  if (path.resolve(mediaDir) === path.resolve(backupDir)) throw new Error("DVORIK_MEDIA_DIR and DVORIK_BACKUP_DIR must be different directories");
  return {
    production: true,
    devToolsEnabled: false,
    sqliteFile: absolute(env, "DVORIK_SQLITE_FILE"),
    mediaDir,
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
    sqliteFile: env.DVORIK_SQLITE_FILE || path.resolve(process.cwd(), "data/dvorik.sqlite"),
    stateFile: env.DVORIK_STATE_FILE || path.resolve(process.cwd(), "data/dvorik-state.json"),
    mediaDir: env.DVORIK_MEDIA_DIR || path.resolve(process.cwd(), "data/media"),
    backupDir: env.DVORIK_BACKUP_DIR || path.resolve(process.cwd(), "backups"),
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

// src/server/migrations.ts
import fs2 from "node:fs";
import path2 from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
var migrationsDirectory = path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "migrations");
function listMigrations(directory2 = migrationsDirectory) {
  if (!fs2.existsSync(directory2)) return [];
  return fs2.readdirSync(directory2).map((name) => {
    const match = /^(\d+)_([\w-]+)\.sql$/.exec(name);
    return match ? { version: Number(match[1]), name } : null;
  }).filter((item) => Boolean(item)).sort((left, right) => left.version - right.version);
}
function checksum(directory2, migration) {
  return crypto.createHash("sha256").update(fs2.readFileSync(path2.join(directory2, migration.name))).digest("hex");
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
  if ([...applied].some((version) => version !== 1 && !knownVersions.has(version))) throw new Error("Applied migration file is missing");
  return { applied: migrations.filter((migration) => applied.has(migration.version)), pending: migrations.filter((migration) => !applied.has(migration.version)), unrecordedApplied };
}
function applyMigrations(database2, directory2 = migrationsDirectory) {
  const plan = inspectMigrations(database2, directory2);
  const pending = plan.pending;
  for (const migration of pending) {
    const sql = fs2.readFileSync(path2.join(directory2, migration.name), "utf8");
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
  constructor(config2, fetcher = fetch) {
    this.config = config2;
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
    const response = await this.fetcher(url, { headers: { "X-SBISAccessToken": token, accept: "application/json" } });
    if (response.status === 401 && retryAuth) {
      this.token = void 0;
      return this.page(input, false);
    }
    if (!response.ok) throw new SabyApiError("API_FAILED", response.status);
    const payload = await response.json();
    if (!isObject(payload) || !Array.isArray(payload.orders) || payload.orders.some((order) => !isObject(order))) throw new SabyApiError("BAD_RESPONSE");
    return payload.orders;
  }
  async authenticate() {
    const response = await this.fetcher(this.config.authUrl, {
      method: "POST",
      headers: { "content-type": "application/json;charset=utf-8", accept: "application/json" },
      body: JSON.stringify({ app_client_id: this.config.appClientId, app_secret: this.config.appSecret, secret_key: this.config.secretKey })
    });
    if (!response.ok) throw new SabyApiError("AUTH_FAILED", response.status);
    const payload = await response.json();
    if (!isObject(payload) || typeof payload.token !== "string" || !payload.token.trim()) throw new SabyApiError("BAD_RESPONSE");
    this.token = payload.token;
    return payload.token;
  }
};
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/server/saby-sync-service.ts
import crypto2 from "node:crypto";
import { nanoid } from "nanoid";
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
    const raw = canonicalJson(payload);
    const id = nanoid();
    this.database.transaction((db) => {
      db.execute("INSERT INTO saby_webhook_signals(id,payload_json,payload_sha256,status,attempt_count,received_at,updated_at) VALUES (?,?,?,'pending',0,?,?)", [id, raw, sha256(raw), at, at]);
    }, { mode: "immediate" });
    return { id, accepted: true };
  }
  hasPendingSignal() {
    return (this.database.query("SELECT count(*) count FROM saby_webhook_signals WHERE status='pending'")[0]?.count ?? 0) > 0;
  }
  async synchronize(explicit) {
    const now = this.now();
    const state = this.database.query("SELECT cursor_updated_at FROM saby_sync_state WHERE scope='retail_sales'")[0];
    const cursor = state?.cursor_updated_at ? parseSabyDateTime(state.cursor_updated_at, this.options.timezone) : void 0;
    const from = explicit?.from ?? new Date((cursor?.getTime() ?? now.getTime() - this.options.initialLookbackHours * 36e5) - this.options.overlapMinutes * 6e4);
    const to = explicit?.to ?? now;
    const runId = nanoid();
    const startedAt = now.toISOString();
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
      this.database.transaction((db) => {
        db.execute("UPDATE saby_reconciliation_runs SET orders_seen=?,orders_changed=?,status='completed',completed_at=? WHERE id=?", [orders.length, changed, finishedAt, runId]);
        db.execute("UPDATE saby_sync_state SET cursor_updated_at=?,last_success_at=?,last_error_code=NULL,version=version+1,updated_at=? WHERE scope='retail_sales'", [maxUpdated || formatSabyDateTime(to, this.options.timezone), finishedAt, finishedAt]);
        db.execute("UPDATE saby_webhook_signals SET status='processed',processed_at=?,last_error_code=NULL,updated_at=? WHERE status IN ('pending','processing','failed')", [finishedAt, finishedAt]);
      }, { mode: "immediate" });
      return { runId, ordersSeen: orders.length, ordersChanged: changed, from: from.toISOString(), to: to.toISOString() };
    } catch (error) {
      const code = error instanceof SabyContractError ? error.code : isObject(error) && typeof error.code === "string" ? error.code : "SABY_SYNC_FAILED";
      const failedAt = this.now().toISOString();
      this.database.transaction((db) => {
        db.execute("UPDATE saby_reconciliation_runs SET status='failed',error_code=?,completed_at=? WHERE id=?", [code, failedAt, runId]);
        db.execute("UPDATE saby_sync_state SET last_error_code=?,version=version+1,updated_at=? WHERE scope='retail_sales'", [code, failedAt]);
        db.execute("UPDATE saby_webhook_signals SET status='failed',attempt_count=attempt_count+1,last_error_code=?,updated_at=? WHERE status IN ('pending','processing')", [code, failedAt]);
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
      return this.database.transaction((db) => {
        const scope = "saby.mapping.save";
        const requestHash = sha256(canonicalJson({ uuid: input.uuid, productId: input.productId }));
        const existing = db.query("SELECT request_hash,status,response_json FROM idempotency_keys WHERE scope=? AND key=?", [scope, input.idempotencyKey])[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new SabyContractError("IDEMPOTENCY_CONFLICT");
          if (existing.status !== "completed" || !existing.response_json) throw new SabyContractError("IDEMPOTENCY_IN_PROGRESS");
          const replay = JSON.parse(existing.response_json);
          return replay.value;
        }
        db.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,version,updated_at) VALUES (?,?,?,'processing',?,0,?)", [scope, input.idempotencyKey, requestHash, at, at]);
        if (!db.query("SELECT id FROM products WHERE id=? AND status='active'", [input.productId]).length) throw new SabyContractError("PRODUCT_NOT_FOUND");
        if (!db.query("SELECT nomenclature_uuid FROM saby_external_items WHERE nomenclature_uuid=?", [input.uuid]).length) throw new SabyContractError("SABY_ITEM_NOT_FOUND");
        db.execute(`INSERT INTO saby_product_mappings(nomenclature_uuid,product_id,created_by_user_id,created_at,version,updated_at) VALUES (?,?,?,?,0,?)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET product_id=excluded.product_id,created_by_user_id=excluded.created_by_user_id,version=version+1,updated_at=excluded.updated_at`, [input.uuid, input.productId, input.actorId, at, at]);
        db.execute("INSERT INTO product_aliases(id,product_id,alias,normalized_alias,source,created_at) SELECT ?,?,name,dvorik_normalize_search(name),'saby',? FROM saby_external_items WHERE nomenclature_uuid=? AND name<>'' ON CONFLICT DO NOTHING", [nanoid(), input.productId, at, input.uuid]);
        this.audit(db, input.actorId, "saby_mapping", input.uuid, "upsert", { productId: input.productId }, at);
        this.reapplyUuid(db, input.uuid, at);
        const response = { nomenclatureUuid: input.uuid, productId: input.productId };
        db.execute("UPDATE idempotency_keys SET status='completed',response_status=200,response_json=?,completed_at=?,expires_at=?,version=version+1,updated_at=? WHERE scope=? AND key=?", [JSON.stringify({ schemaVersion: 1, value: response }), at, new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString(), at, scope, input.idempotencyKey]);
        return response;
      }, { mode: "immediate" });
    } catch (error) {
      if (error instanceof DatabaseError && error.causeCode) throw new SabyContractError(error.causeCode.startsWith("SQLITE_CONSTRAINT") ? "SABY_MAPPING_CONFLICT" : error.causeCode);
      throw error;
    }
  }
  retryQueuedStock() {
    const at = this.now().toISOString();
    return this.database.transaction((db) => {
      const uuids = db.query("SELECT DISTINCT nomenclature_uuid FROM saby_sale_lines WHERE stock_status IN ('queued_inventory','blocked_negative','unmapped')");
      for (const row of uuids) this.reapplyUuid(db, row.nomenclature_uuid, at);
      return uuids.length;
    }, { mode: "immediate" });
  }
  apply(sale) {
    return this.database.transaction((db) => {
      const existing = db.query("SELECT revision_sha256,total_kopecks,state FROM saby_sales WHERE external_key=?", [sale.key])[0];
      if (existing?.revision_sha256 === sale.revision) return false;
      const at = this.now().toISOString();
      const oldLines = db.query("SELECT external_line_key,nomenclature_uuid,applied_quantity_milli FROM saby_sale_lines WHERE external_sale_key=?", [sale.key]).map((row) => ({ key: row.external_line_key, uuid: row.nomenclature_uuid, appliedQuantityMilli: row.applied_quantity_milli }));
      for (const line of sale.lines) db.execute(`INSERT INTO saby_external_items(nomenclature_uuid,name,barcode,article,first_seen_at,last_seen_at,version) VALUES (?,?,?,?,?,?,0)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,article=excluded.article,last_seen_at=excluded.last_seen_at,version=version+1`, [line.uuid, line.name, line.barcode, line.article, at, at]);
      db.execute(
        `INSERT INTO saby_sales(external_key,external_sale_id,point_id,state,is_return,return_sale_key,business_time,external_updated_at,total_kopecks,revision_sha256,raw_json,received_at,version,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(external_key) DO UPDATE SET external_sale_id=excluded.external_sale_id,point_id=excluded.point_id,state=excluded.state,is_return=excluded.is_return,return_sale_key=excluded.return_sale_key,business_time=excluded.business_time,external_updated_at=excluded.external_updated_at,total_kopecks=excluded.total_kopecks,revision_sha256=excluded.revision_sha256,raw_json=excluded.raw_json,received_at=excluded.received_at,version=version+1,updated_at=excluded.updated_at`,
        [sale.key, sale.saleId ?? null, sale.pointId, sale.state, sale.isReturn ? 1 : 0, sale.returnSaleKey ?? null, sale.businessTime, sale.externalUpdatedAt, sale.totalKopecks, sale.revision, sale.raw, at, at]
      );
      const oldRevenue = existing?.state === "completed" ? existing.total_kopecks : 0;
      const revenueDelta = sale.totalKopecks - oldRevenue;
      db.execute("INSERT INTO saby_sale_deltas(id,external_sale_key,revision_sha256,revenue_delta_kopecks,reason,created_at) VALUES (?,?,?,?,?,?)", [nanoid(), sale.key, sale.revision, revenueDelta, !existing ? sale.isReturn ? "return" : "initial" : sale.state === "deleted" ? "deleted" : sale.state === "nonfiscal" ? "nonfiscal" : "revision", at]);
      const newByKey = new Map(sale.lines.map((line) => [line.key, line]));
      for (const old of oldLines) if (!newByKey.has(old.key)) this.applyLine(db, sale, { key: old.key, uuid: old.uuid, name: "", barcode: "", article: "", quantityMilli: 1, totalKopecks: 0, discountKopecks: 0, refused: true }, old.appliedQuantityMilli, at, true);
      for (const line of sale.lines) this.applyLine(db, sale, line, oldLines.find((old) => old.key === line.key)?.appliedQuantityMilli ?? 0, at, false);
      db.execute("UPDATE saby_sales SET applied_at=? WHERE external_key=?", [at, sale.key]);
      this.audit(db, void 0, "saby_sale", sale.key, existing ? "revise" : "ingest", { state: sale.state, revision: sale.revision, revenueDeltaKopecks: revenueDelta }, at);
      return true;
    }, { mode: "immediate" });
  }
  applyLine(db, sale, line, alreadyApplied, at, removed) {
    const mapping = db.query("SELECT m.product_id,p.inventory_kind FROM saby_product_mappings m JOIN products p ON p.id=m.product_id WHERE m.nomenclature_uuid=? AND p.status='active'", [line.uuid])[0];
    const inventoryOpen = db.query("SELECT id FROM inventory_sessions WHERE status IN ('active','closing') LIMIT 1").length > 0;
    let status = removed || line.refused || sale.state !== "completed" ? "not_applicable" : !mapping ? "unmapped" : mapping.inventory_kind !== "piece" ? "not_applicable" : inventoryOpen ? "queued_inventory" : "applied";
    const desired = status === "applied" ? sale.isReturn ? line.quantityMilli : -line.quantityMilli : 0;
    const delta = desired - alreadyApplied;
    let applied = alreadyApplied;
    if (mapping && delta !== 0 && status !== "queued_inventory") {
      const balance = db.query("SELECT quantity_minor,version FROM inventory_balances WHERE product_id=?", [mapping.product_id])[0];
      const current = balance?.quantity_minor ?? 0;
      if (current + delta < 0) status = "blocked_negative";
      else {
        if (balance) db.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [current + delta, at, mapping.product_id, balance.version]);
        else db.execute("INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES (?,?,0,?)", [mapping.product_id, delta, at]);
        applied = desired;
        db.execute("INSERT INTO stock_operations(id,type,product_id,quantity,quantity_minor,actor_id,reason,idempotency_key,metadata_json,created_at) VALUES (?,?,?,?,?,'system-saby',?,?,?,?)", [nanoid(), delta < 0 ? "write_off" : "correction", mapping.product_id, Math.abs(delta) / 1e3, Math.abs(delta), `Saby ${sale.isReturn ? "return" : "sale"} ${sale.key}`, `saby:${sale.key}:${line.key}:${sale.revision}`, JSON.stringify({ schemaVersion: 1, value: { source: "saby", externalSaleKey: sale.key, externalLineKey: line.key, deltaMilli: delta } }), at]);
      }
    }
    db.execute(
      `INSERT INTO saby_sale_lines(external_sale_key,external_line_key,nomenclature_uuid,name,barcode,article,quantity_milli,total_kopecks,discount_kopecks,refused,stock_status,applied_quantity_milli,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_sale_key,external_line_key) DO UPDATE SET nomenclature_uuid=excluded.nomenclature_uuid,name=excluded.name,barcode=excluded.barcode,article=excluded.article,quantity_milli=excluded.quantity_milli,total_kopecks=excluded.total_kopecks,discount_kopecks=excluded.discount_kopecks,refused=excluded.refused,stock_status=excluded.stock_status,applied_quantity_milli=excluded.applied_quantity_milli,updated_at=excluded.updated_at`,
      [sale.key, line.key, line.uuid, line.name, line.barcode, line.article, line.quantityMilli, line.totalKopecks, line.discountKopecks, removed || line.refused ? 1 : 0, status, applied, at]
    );
    if (status === "unmapped" || status === "blocked_negative") this.notifyManagers(db, status === "unmapped" ? "saby.mapping_required" : "saby.negative_stock", `${sale.key}:${line.key}:${status}`, { saleKey: sale.key, lineKey: line.key, nomenclatureUuid: line.uuid, productId: mapping?.product_id ?? null }, at);
  }
  reapplyUuid(db, uuid, at) {
    const rows = db.query("SELECT DISTINCT external_sale_key FROM saby_sale_lines WHERE nomenclature_uuid=? ORDER BY external_sale_key", [uuid]);
    for (const row of rows) {
      const saleRow = db.query("SELECT * FROM saby_sales WHERE external_key=?", [row.external_sale_key])[0];
      const lines = db.query("SELECT * FROM saby_sale_lines WHERE external_sale_key=? AND nomenclature_uuid=?", [row.external_sale_key, uuid]);
      if (!saleRow) continue;
      const sale = storedSale(saleRow);
      for (const raw of lines) {
        const line = storedNormalizedLine(raw);
        this.applyLine(db, sale, line, Number(raw.applied_quantity_milli), at, Boolean(raw.refused));
      }
    }
  }
  notifyManagers(db, type, key, value, at) {
    const users = db.query("SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.status='active' AND ur.role_id IN ('admin','super_admin')");
    for (const user of users) {
      const payload = JSON.stringify({ schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...value } });
      db.execute("INSERT INTO webapp_notifications(id,recipient_user_id,type,payload_json,is_read,created_at,version,updated_at) VALUES (?,?,?,?,0,?,0,?)", [nanoid(), user.id, type, payload, at, at]);
      db.execute("INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,idempotency_key,attempt_count,max_attempts,available_at,created_at,version,updated_at) VALUES (?,'telegram',?,?,?,'pending',?,0,?,?,?,0,?) ON CONFLICT DO NOTHING", [nanoid(), user.id, type, payload, `saby:${key}:${user.id}`, this.options.outboxMaxAttempts ?? 8, at, at, at]);
    }
  }
  audit(db, actorId, entity, entityId, action, value, at) {
    db.execute("INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,changes_json,request_id,created_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,0,?)", [nanoid(), actorId ?? null, entity, entityId, action, JSON.stringify({ schemaVersion: 1, value }), `saby:${entityId}:${action}`, at, at]);
  }
  now() {
    return this.options.now?.() ?? /* @__PURE__ */ new Date();
  }
};
function normalizeSabyOrder(order, pointId) {
  const key = text(order.Key) || (integer(order.Sale) !== void 0 ? String(integer(order.Sale)) : "");
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
    const quantityMilli = quantity(line.Quantity);
    if (quantityMilli <= 0) return [];
    return [{ key: text(line.Key) || `${uuid}:${integer(line.Number) ?? index}`, uuid, name: text(line.Name) || text(line.ShortName), barcode: text(line.Barcode), article: text(line.NomenclatureNumber), quantityMilli, totalKopecks: money(line.TotalPrice), discountKopecks: money(line.TotalDiscount), refused: line.Refused === true }];
  });
  const businessTime = text(order.ClosedWTZ) || text(order.DateWTZ);
  const externalUpdatedAt = text(order.Updated) || businessTime;
  if (!businessTime || !externalUpdatedAt) throw new SabyContractError("SABY_ORDER_TIME_MISSING");
  const normalized = { key, saleId: integer(order.Sale), pointId, state, isReturn, returnSaleKey: text(order.ReturnSaleKey) || void 0, businessTime, externalUpdatedAt, totalKopecks: state === "completed" ? isReturn ? -Math.abs(total) : Math.abs(total) : 0, lines };
  const raw = canonicalJson(order);
  return { ...normalized, revision: sha256(canonicalJson(normalized)), raw };
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
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : void 0;
}
function money(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100);
}
function quantity(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  const result = Math.round((value + Number.EPSILON) * 1e3);
  if (Math.abs(result / 1e3 - value) > 1e-9) throw new SabyContractError("SABY_QUANTITY_PRECISION");
  return result;
}
function sha256(value) {
  return crypto2.createHash("sha256").update(value).digest("hex");
}
function canonicalJson(value) {
  return JSON.stringify(sortJson(value));
}
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  return value ?? null;
}
function formatSabyDateTime(date, timezone2) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
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

// src/server/saby-worker.ts
var config = loadRuntimeConfig();
if (!config.saby) throw new Error("DVORIK_SABY_ENABLED=1 and Saby credentials are required");
var database = openDatabase(config.sqliteFile);
applyMigrations(database);
var service = new SabySyncService(database, new SabyClient(config.saby), {
  pointId: config.saby.pointId,
  timezone: config.timezone,
  overlapMinutes: config.saby.overlapMinutes,
  initialLookbackHours: config.saby.initialLookbackHours
});
var stopping = false;
var nextScheduledAt = 0;
var stop = (signal) => {
  stopping = true;
  console.log(JSON.stringify({ event: "saby_worker_stopping", signal }));
};
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));
try {
  while (!stopping) {
    const now = Date.now();
    if (now >= nextScheduledAt || service.hasPendingSignal()) {
      try {
        const result = await service.synchronize();
        const retried = service.retryQueuedStock();
        console.log(JSON.stringify({ event: "saby_sync_succeeded", ...result, queuedStockRetried: retried }));
        nextScheduledAt = Date.now() + 15 * 6e4;
      } catch (error) {
        console.error(JSON.stringify({ event: "saby_sync_failed", code: error instanceof Error ? error.message : "UNKNOWN" }));
        nextScheduledAt = Date.now() + 6e4;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5e3));
  }
} finally {
  database.close();
}
