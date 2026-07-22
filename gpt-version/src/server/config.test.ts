import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRuntimeConfig } from "./config";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-config-"));
const backupDir = path.join(root, "backups");
fs.mkdirSync(backupDir);
const valid = {
  NODE_ENV: "production",
  DVORIK_SQLITE_FILE: path.join(root, "dvorik.sqlite"),
  DVORIK_TIMEZONE: "Asia/Vladivostok",
  DVORIK_RELEASE_VERSION: "2026.07.11",
  TELEGRAM_BOT_TOKEN: "real-token",
  TELEGRAM_WEBHOOK_SECRET: "real-webhook-secret",
  DVORIK_OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
  DVORIK_OBJECT_STORAGE_BUCKET: "dvorik",
  DVORIK_OBJECT_STORAGE_PUBLIC_URL: "https://cdn.example.test/dvorik",
  DVORIK_OBJECT_STORAGE_TOKEN: "storage-token",
  DVORIK_MEDIA_DIR: root,
  DVORIK_BACKUP_DIR: backupDir,
  DVORIK_COOKIE_SAME_SITE: "lax",
  DVORIK_SESSION_SECRET: "session-secret-at-least-32-bytes-long"
};

assert.equal(loadRuntimeConfig(valid).production, true);
const saby = loadRuntimeConfig({ ...valid, DVORIK_SABY_ENABLED: "1", DVORIK_SABY_POINT_ID: "77", DVORIK_SABY_APP_CLIENT_ID: "client", DVORIK_SABY_APP_SECRET: "secret", DVORIK_SABY_SECRET_KEY: "service-key", DVORIK_SABY_WEBHOOK_SECRET: "saby-webhook-secret-at-least-32-bytes" }).saby;
assert.equal(saby?.pointId, 77);
assert.equal(saby?.apiBaseUrl, "https://api.sbis.ru");
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_SABY_ENABLED: "1" }), /DVORIK_SABY/);
for (const [name, replacement, expected] of [["DVORIK_SQLITE_FILE", "", /DVORIK_SQLITE_FILE/], ["DVORIK_TIMEZONE", "Bad/Timezone", /timezone/], ["DVORIK_RELEASE_VERSION", "dev", /DVORIK_RELEASE_VERSION/], ["TELEGRAM_BOT_TOKEN", "dev-token", /Development Telegram/], ["DVORIK_OBJECT_STORAGE_ENDPOINT", "http://storage.example.test", /DVORIK_OBJECT_STORAGE_ENDPOINT/], ["DVORIK_MEDIA_DIR", path.join(root, "missing"), /DVORIK_MEDIA_DIR/], ["DVORIK_COOKIE_SAME_SITE", "invalid", /DVORIK_COOKIE_SAME_SITE/], ["DVORIK_SESSION_SECRET", "", /DVORIK_SESSION_SECRET/]] as const) {
  assert.throws(() => loadRuntimeConfig({ ...valid, [name]: replacement }), expected);
}
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_STATE_FILE: path.join(root, "state.json") }), /DVORIK_STATE_FILE/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_BACKUP_DIR: root }), /must be different directories/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_COOKIE_SAME_SITE: "none" }), /must be lax/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_SESSION_SECRET: "short" }), /at least 32 bytes/);
assert.equal(loadRuntimeConfig({ NODE_ENV: "test" }).telegramBotToken, "dev-token");
console.log("config tests passed");
