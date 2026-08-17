import fs from "node:fs";
import path from "node:path";

type Env = NodeJS.ProcessEnv;

export type RuntimeConfig = {
  production: boolean;
  devToolsEnabled: boolean;
  sqliteFile: string;
  stateFile?: string;
  mediaDir: string;
  backupDir: string;
  timezone: string;
  telegramBotToken: string;
  telegramWebhookSecret: string;
  cash: {
    mode: "disabled" | "external";
    baseUrl?: string;
    internalSecret?: string;
  };
  staff: {
    mode: "disabled" | "external";
    baseUrl?: string;
    internalSecret?: string;
  };
  warehouse:
    | { mode: "embedded"; databaseFile?: string }
    | { mode: "external"; baseUrl: string; internalSecret: string };
  objectStorage?: { endpoint: string; bucket: string; publicBaseUrl: string; token: string };
  sessionCookie: { name: string; secret: string; secure: boolean; sameSite: "lax"; maxAgeMs: number };
};

function cashConfig(env: Env): RuntimeConfig["cash"] {
  const mode = env.DVORIK_CASH_MODE === "external" ? "external" : "disabled";
  if (mode === "disabled") return { mode };
  const baseUrl = required(env, "DVORIK_CASH_BASE_URL");
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("DVORIK_CASH_BASE_URL must be an HTTP(S) URL");
  }
  const internalSecret = required(env, "DVORIK_INTERNAL_SECRET");
  if (Buffer.byteLength(internalSecret, "utf8") < 32) throw new Error("DVORIK_INTERNAL_SECRET must be at least 32 bytes");
  return { mode, baseUrl: baseUrl.replace(/\/$/, ""), internalSecret };
}

function staffConfig(env: Env): RuntimeConfig["staff"] {
  const mode = env.DVORIK_STAFF_MODE === "external" ? "external" : "disabled";
  if (mode === "disabled") return { mode };
  const baseUrl = required(env, "DVORIK_STAFF_BASE_URL");
  try { const parsed = new URL(baseUrl); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); } catch { throw new Error("DVORIK_STAFF_BASE_URL must be an HTTP(S) URL"); }
  const internalSecret = required(env, "DVORIK_INTERNAL_SECRET");
  if (Buffer.byteLength(internalSecret, "utf8") < 32) throw new Error("DVORIK_INTERNAL_SECRET must be at least 32 bytes");
  return { mode, baseUrl: baseUrl.replace(/\/$/, ""), internalSecret };
}

function warehouseConfig(env: Env): RuntimeConfig["warehouse"] {
  const mode = env.DVORIK_WAREHOUSE_MODE === "external" ? "external" : "embedded";
  if (mode === "embedded") {
    const configuredFile = env.DVORIK_WAREHOUSE_SQLITE_FILE?.trim();
    if (configuredFile && !path.isAbsolute(configuredFile)) throw new Error("DVORIK_WAREHOUSE_SQLITE_FILE must be an absolute path");
    return {
      mode,
      databaseFile: configuredFile || (env.NODE_ENV === "test" ? undefined : path.resolve(process.cwd(), "data/warehouse.sqlite"))
    };
  }
  const baseUrl = required(env, "DVORIK_WAREHOUSE_BASE_URL");
  try { const parsed = new URL(baseUrl); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); } catch { throw new Error("DVORIK_WAREHOUSE_BASE_URL must be an HTTP(S) URL"); }
  const internalSecret = required(env, "DVORIK_INTERNAL_SECRET");
  if (Buffer.byteLength(internalSecret, "utf8") < 32) throw new Error("DVORIK_INTERNAL_SECRET must be at least 32 bytes");
  return { mode, baseUrl: baseUrl.replace(/\/$/, ""), internalSecret };
}

function positiveInteger(env: Env, name: string, fallback?: number) {
  const raw = env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const devTokens = new Set(["dev-token", "test-token", "dev-webhook-secret", "test-webhook-secret"]);

function required(env: Env, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required production config: ${name}`);
  return value;
}

function absolute(env: Env, name: string) {
  const value = required(env, name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function directory(env: Env, name: string) {
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

function timezone(value: string) {
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); } catch { throw new Error("DVORIK_TIMEZONE must be a valid IANA timezone"); }
  return value;
}

function productionConfig(env: Env): RuntimeConfig {
  if (env.DVORIK_STATE_FILE?.trim()) throw new Error("DVORIK_STATE_FILE is forbidden in production");
  const configuredTimezone = timezone(required(env, "DVORIK_TIMEZONE"));
  const release = required(env, "DVORIK_RELEASE_VERSION");
  if (/^(dev|test|local|unknown)$/i.test(release)) throw new Error("DVORIK_RELEASE_VERSION must not be a development value");
  const token = required(env, "TELEGRAM_BOT_TOKEN");
  const webhookSecret = required(env, "TELEGRAM_WEBHOOK_SECRET");
  if (devTokens.has(token) || devTokens.has(webhookSecret)) throw new Error("Development Telegram secrets are forbidden in production");
  const endpoint = required(env, "DVORIK_OBJECT_STORAGE_ENDPOINT");
  const publicBaseUrl = required(env, "DVORIK_OBJECT_STORAGE_PUBLIC_URL");
  for (const [name, value] of [["DVORIK_OBJECT_STORAGE_ENDPOINT", endpoint], ["DVORIK_OBJECT_STORAGE_PUBLIC_URL", publicBaseUrl]] as const) {
    try { if (new URL(value).protocol !== "https:") throw new Error(); } catch { throw new Error(`${name} must be an HTTPS URL`); }
  }
  const cookieSameSite = required(env, "DVORIK_COOKIE_SAME_SITE").toLowerCase();
  if (cookieSameSite !== "lax") throw new Error("DVORIK_COOKIE_SAME_SITE must be lax");
  const sessionSecret = required(env, "DVORIK_SESSION_SECRET");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32) throw new Error("DVORIK_SESSION_SECRET must be at least 32 bytes");
  const mediaDir = directory(env, "DVORIK_MEDIA_DIR");
  const backupDir = directory(env, "DVORIK_BACKUP_DIR");
  if (path.resolve(mediaDir) === path.resolve(backupDir)) throw new Error("DVORIK_MEDIA_DIR and DVORIK_BACKUP_DIR must be different directories");
  const staff = staffConfig(env);
  if (staff.mode !== "external") throw new Error("DVORIK_STAFF_MODE must be external in production");
  const warehouse = warehouseConfig(env);
  if (warehouse.mode !== "external") throw new Error("DVORIK_WAREHOUSE_MODE must be external in production");
  return {
    production: true,
    devToolsEnabled: false,
    sqliteFile: absolute(env, "DVORIK_SQLITE_FILE"),
    mediaDir,
    backupDir,
    timezone: configuredTimezone,
    telegramBotToken: token,
    telegramWebhookSecret: webhookSecret,
    cash: cashConfig(env),
    staff,
    warehouse,
    objectStorage: {
      endpoint,
      bucket: required(env, "DVORIK_OBJECT_STORAGE_BUCKET"),
      publicBaseUrl,
      token: required(env, "DVORIK_OBJECT_STORAGE_TOKEN")
    },
    sessionCookie: { name: "__Host-dvorik_session", secret: sessionSecret, secure: true, sameSite: cookieSameSite, maxAgeMs: 8 * 60 * 60 * 1000 }
  };
}

export function loadRuntimeConfig(env: Env = process.env): RuntimeConfig {
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
    cash: cashConfig(env),
    staff: staffConfig(env),
    warehouse: warehouseConfig(env),
    sessionCookie: {
      name: "dvorik_session",
      secret: env.DVORIK_SESSION_SECRET || "development-session-secret-32-bytes-minimum",
      secure: false,
      sameSite: "lax",
      maxAgeMs: 8 * 60 * 60 * 1000
    }
  };
}

/** Throws before any stateful runtime module is allowed to start in production. */
export function assertRuntimeConfig(env: Env = process.env) {
  return loadRuntimeConfig(env);
}
