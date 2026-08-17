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

const productionStaff = { DVORIK_STAFF_MODE: "external", DVORIK_STAFF_BASE_URL: "http://127.0.0.1:3202", DVORIK_INTERNAL_SECRET: "internal-secret-at-least-32-bytes" };
const productionWarehouse = { DVORIK_WAREHOUSE_MODE: "external", DVORIK_WAREHOUSE_BASE_URL: "http://127.0.0.1:3303" };
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse }).production, true);
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse }).cash.mode, "disabled");
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse }).staff.mode, "external");
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse }).warehouse.mode, "external");
assert.throws(() => loadRuntimeConfig(valid), /DVORIK_STAFF_MODE must be external/);
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse, DVORIK_CASH_MODE: "external", DVORIK_CASH_BASE_URL: "http://127.0.0.1:3101" }).cash.mode, "external");
assert.throws(() => loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse, DVORIK_CASH_MODE: "external" }), /DVORIK_CASH_BASE_URL/);
assert.equal(loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse }).staff.mode, "external");
assert.throws(() => loadRuntimeConfig({ ...valid, ...productionStaff }), /DVORIK_WAREHOUSE_MODE must be external/);
for (const [name, replacement, expected] of [["DVORIK_SQLITE_FILE", "", /DVORIK_SQLITE_FILE/], ["DVORIK_TIMEZONE", "Bad/Timezone", /timezone/], ["DVORIK_RELEASE_VERSION", "dev", /DVORIK_RELEASE_VERSION/], ["TELEGRAM_BOT_TOKEN", "dev-token", /Development Telegram/], ["DVORIK_OBJECT_STORAGE_ENDPOINT", "http://storage.example.test", /DVORIK_OBJECT_STORAGE_ENDPOINT/], ["DVORIK_MEDIA_DIR", path.join(root, "missing"), /DVORIK_MEDIA_DIR/], ["DVORIK_COOKIE_SAME_SITE", "invalid", /DVORIK_COOKIE_SAME_SITE/], ["DVORIK_SESSION_SECRET", "", /DVORIK_SESSION_SECRET/]] as const) {
  assert.throws(() => loadRuntimeConfig({ ...valid, ...productionStaff, ...productionWarehouse, [name]: replacement }), expected);
}
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_STATE_FILE: path.join(root, "state.json") }), /DVORIK_STATE_FILE/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_BACKUP_DIR: root }), /must be different directories/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_COOKIE_SAME_SITE: "none" }), /must be lax/);
assert.throws(() => loadRuntimeConfig({ ...valid, DVORIK_SESSION_SECRET: "short" }), /at least 32 bytes/);
assert.equal(loadRuntimeConfig({ NODE_ENV: "test" }).telegramBotToken, "dev-token");
assert.equal(loadRuntimeConfig({ NODE_ENV: "test" }).warehouse.mode, "embedded");
const developmentWarehouse = loadRuntimeConfig({ NODE_ENV: "development" }).warehouse;
assert.equal(developmentWarehouse.mode, "embedded");
assert.equal(developmentWarehouse.mode === "embedded" && developmentWarehouse.databaseFile?.endsWith("data/warehouse.sqlite"), true);
console.log("config tests passed");
