import path from "node:path";

export type StaffRuntimeConfig = Readonly<{ port: number; databaseFile: string; coreBaseUrl: string; internalSecret: string }>;

export function loadStaffRuntimeConfig(env: NodeJS.ProcessEnv = process.env): StaffRuntimeConfig {
  const databaseFile = env.DVORIK_STAFF_SQLITE_FILE?.trim();
  const internalSecret = env.DVORIK_INTERNAL_SECRET?.trim();
  if (!databaseFile || !path.isAbsolute(databaseFile)) throw new Error("DVORIK_STAFF_SQLITE_FILE must be an absolute path");
  if (!internalSecret || Buffer.byteLength(internalSecret, "utf8") < 32) throw new Error("DVORIK_INTERNAL_SECRET must be at least 32 bytes");
  const coreBaseUrl = new URL(env.DVORIK_CORE_BASE_URL?.trim() || "http://127.0.0.1:3001").toString().replace(/\/$/, "");
  const port = Number(env.STAFF_PORT || 3202);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error("STAFF_PORT must be a valid port");
  return { port, databaseFile, coreBaseUrl, internalSecret };
}
