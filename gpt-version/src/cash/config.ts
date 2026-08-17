import path from "node:path";
import type { SabyClientConfig } from "../server/saby-client";

export type CashRuntimeConfig = Readonly<{
  port: number;
  databaseFile: string;
  coreBaseUrl: string;
  internalSecret: string;
  webhookSecret: string;
  timezone: string;
  overlapMinutes: number;
  initialLookbackHours: number;
  cutoverAt: string;
  syncEnabled: boolean;
  saby: SabyClientConfig;
}>;

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing cash config: ${name}`);
  return value;
}

function positive(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Cash numeric config must be positive");
  return parsed;
}

export function loadCashRuntimeConfig(env: NodeJS.ProcessEnv = process.env): CashRuntimeConfig {
  const internalSecret = required(env, "DVORIK_INTERNAL_SECRET");
  if (Buffer.byteLength(internalSecret) < 32) throw new Error("DVORIK_INTERNAL_SECRET must be at least 32 bytes");
  const databaseFile = required(env, "DVORIK_CASH_SQLITE_FILE");
  if (!path.isAbsolute(databaseFile)) throw new Error("DVORIK_CASH_SQLITE_FILE must be absolute");
  const coreBaseUrl = new URL(required(env, "DVORIK_CORE_BASE_URL")).toString().replace(/\/$/, "");
  const webhookSecret = required(env, "DVORIK_SABY_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]+$/.test(webhookSecret)) throw new Error("DVORIK_SABY_WEBHOOK_SECRET must be URL-safe");
  return {
    port: positive(env.CASH_PORT ?? env.PORT, 3101),
    databaseFile,
    coreBaseUrl,
    internalSecret,
    webhookSecret,
    timezone: env.DVORIK_TIMEZONE || "Asia/Vladivostok",
    overlapMinutes: positive(env.DVORIK_SABY_OVERLAP_MINUTES, 30),
    initialLookbackHours: positive(env.DVORIK_SABY_INITIAL_LOOKBACK_HOURS, 24),
    cutoverAt: env.DVORIK_CASH_CUTOVER_AT || new Date().toISOString(),
    syncEnabled: env.DVORIK_CASH_SYNC_ENABLED === "1",
    saby: {
      pointId: positive(env.DVORIK_SABY_POINT_ID, 1),
      appClientId: required(env, "DVORIK_SABY_APP_CLIENT_ID"),
      appSecret: required(env, "DVORIK_SABY_APP_SECRET"),
      secretKey: required(env, "DVORIK_SABY_SECRET_KEY"),
      authUrl: env.DVORIK_SABY_AUTH_URL || "https://online.sbis.ru/oauth/service/",
      apiBaseUrl: env.DVORIK_SABY_API_BASE_URL || "https://api.sbis.ru"
    }
  };
}
