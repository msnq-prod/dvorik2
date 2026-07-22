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
  saby?: {
    pointId: number;
    appClientId: string;
    appSecret: string;
    secretKey: string;
    webhookSecret: string;
    authUrl: string;
    apiBaseUrl: string;
    overlapMinutes: number;
    initialLookbackHours: number;
  };
  objectStorage?: { endpoint: string; bucket: string; publicBaseUrl: string; token: string };
  sessionCookie: { name: string; secret: string; secure: boolean; sameSite: "lax"; maxAgeMs: number };
};

function positiveInteger(env: Env, name: string, fallback?: number) {
  const raw = env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function httpsUrl(env: Env, name: string, fallback: string) {
  const value = env[name]?.trim() || fallback;
  try { if (new URL(value).protocol !== "https:") throw new Error(); } catch { throw new Error(`${name} must be an HTTPS URL`); }
  return value.replace(/\/$/, "");
}

function sabyConfig(env: Env) {
  if (env.DVORIK_SABY_ENABLED !== "1") return undefined;
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
  } as const;
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
  return {
    production: true,
    devToolsEnabled: false,
    sqliteFile: absolute(env, "DVORIK_SQLITE_FILE"),
    mediaDir,
    backupDir,
    timezone: configuredTimezone,
    telegramBotToken: token,
    telegramWebhookSecret: webhookSecret,
    ...(sabyConfig(env) ? { saby: sabyConfig(env) } : {}),
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
    ...(sabyConfig(env) ? { saby: sabyConfig(env) } : {}),
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
