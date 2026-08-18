import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { signTelegramInitData } from "./auth";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { buildNormalizedStateSql } from "./state-migration";
import { createSeedState } from "./store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-session-http-"));
const databasePath = path.join(root, "shared.sqlite");
const staffDatabasePath = path.join(root, "staff.sqlite");
const warehouseDatabasePath = path.join(root, "warehouse.sqlite");
const mediaPath = path.join(root, "media");
const backupPath = path.join(root, "backups");
fs.mkdirSync(mediaPath);
fs.mkdirSync(backupPath);
const botToken = "production-bot-token-for-session-http";
const sessionSecret = "production-session-secret-at-least-32-bytes";
const ports = [5700 + Math.floor(Math.random() * 200), 5900 + Math.floor(Math.random() * 200)];
const staffPort = 6300 + Math.floor(Math.random() * 200);
const warehousePort = 6500 + Math.floor(Math.random() * 200);
const children: ChildProcess[] = [];
const legacyRawCredential = "legacy-raw-session-id";

const bootstrapDatabase = openDatabase(databasePath);
bootstrapDatabase.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); CREATE TABLE app_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,datetime('now')); ");
applyMigrations(bootstrapDatabase);
const legacyState = createSeedState();
legacyState.sessions.push({
  id: legacyRawCredential,
  userId: "u-admin",
  method: "telegram",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: new Date().toISOString()
});
bootstrapDatabase.executeScript(buildNormalizedStateSql(legacyState));
bootstrapDatabase.execute("INSERT INTO app_state(id,payload,updated_at) VALUES ('main',?,?)", [JSON.stringify(legacyState), new Date().toISOString()]);
bootstrapDatabase.close();
const warehouseBootstrap = spawnSync(process.execPath, [path.resolve("scripts/build-warehouse-initial-db.mjs")], {
  cwd: process.cwd(),
  env: { ...process.env, DVORIK_WAREHOUSE_SQLITE_FILE: warehouseDatabasePath },
  encoding: "utf8"
});
if (warehouseBootstrap.status !== 0) throw new Error(`Warehouse bootstrap failed: ${warehouseBootstrap.stderr || warehouseBootstrap.stdout}`);

const environment = {
  ...process.env,
  NODE_ENV: "production",
  DVORIK_SQLITE_FILE: databasePath,
  DVORIK_TIMEZONE: "Asia/Vladivostok",
  DVORIK_RELEASE_VERSION: "2026.07.12-session-test",
  TELEGRAM_BOT_TOKEN: botToken,
  TELEGRAM_WEBHOOK_SECRET: "production-webhook-secret-for-session-http",
  DVORIK_OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
  DVORIK_OBJECT_STORAGE_BUCKET: "dvorik-test",
  DVORIK_OBJECT_STORAGE_PUBLIC_URL: "https://cdn.example.test/dvorik-test",
  DVORIK_OBJECT_STORAGE_TOKEN: "production-storage-token-for-session-http",
  DVORIK_MEDIA_DIR: mediaPath,
  DVORIK_BACKUP_DIR: backupPath,
  DVORIK_COOKIE_SAME_SITE: "lax",
  DVORIK_SESSION_SECRET: sessionSecret,
  DVORIK_STAFF_MODE: "external",
  DVORIK_STAFF_BASE_URL: `http://127.0.0.1:${staffPort}`,
  DVORIK_WAREHOUSE_MODE: "external",
  DVORIK_WAREHOUSE_BASE_URL: `http://127.0.0.1:${warehousePort}`,
  DVORIK_INTERNAL_SECRET: "session-http-internal-secret-at-least-32-bytes",
  DVORIK_SABY_ENABLED: "1",
  DVORIK_SABY_POINT_ID: "77",
  DVORIK_SABY_APP_CLIENT_ID: "session-http-client",
  DVORIK_SABY_APP_SECRET: "session-http-app-secret",
  DVORIK_SABY_SECRET_KEY: "session-http-service-key",
  DVORIK_SABY_WEBHOOK_SECRET: "session-http-saby-webhook-secret-32-bytes"
};

async function start(port: number) {
  const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/server/index.ts")], {
    cwd: process.cwd(),
    env: { ...environment, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (chunk) => { output += String(chunk); });
  child.stderr!.on("data", (chunk) => { output += String(chunk); });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 15_000);
    const onData = () => {
      if (!output.includes("Dvorik WebApp:")) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout!.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before test: ${code}; ${output}`));
    });
  });
  return `http://127.0.0.1:${port}`;
}

async function startStaff() {
  const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/staff/index.ts")], {
    cwd: process.cwd(), env: { ...environment, STAFF_PORT: String(staffPort), DVORIK_STAFF_SQLITE_FILE: staffDatabasePath, DVORIK_CORE_BASE_URL: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child); let output = "";
  child.stdout!.on("data", (chunk) => { output += String(chunk); }); child.stderr!.on("data", (chunk) => { output += String(chunk); });
  await new Promise<void>((resolve, reject) => { const timeout=setTimeout(()=>reject(new Error(`Staff did not start: ${output}`)),15_000); child.stdout!.on("data",()=>{if(output.includes("Dvorik Staff:")){clearTimeout(timeout);resolve();}}); child.once("exit",(code)=>{clearTimeout(timeout);reject(new Error(`Staff exited ${code}: ${output}`));}); });
}

async function startWarehouse() {
  const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/warehouse/index.ts")], {
    cwd: process.cwd(),
    env: {
      ...environment,
      WAREHOUSE_PORT: String(warehousePort),
      DVORIK_WAREHOUSE_SQLITE_FILE: warehouseDatabasePath,
      DVORIK_CORE_BASE_URL: `http://127.0.0.1:${ports[0]}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (chunk) => { output += String(chunk); });
  child.stderr!.on("data", (chunk) => { output += String(chunk); });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Warehouse did not start: ${output}`)), 15_000);
    child.stdout!.on("data", () => {
      if (!output.includes("Dvorik Warehouse:")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Warehouse exited ${code}: ${output}`));
    });
  });
}

function initData(telegramUserId = 1002) {
  return signTelegramInitData({
    query_id: `session-http-${Date.now()}`,
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramUserId, first_name: "Session", last_name: "Test", username: `user_${telegramUserId}` })
  }, botToken);
}

async function login(base: string, telegramUserId = 1002) {
  const response = await fetch(`${base}/api/auth/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: initData(telegramUserId) })
  });
  assert.equal(response.status, 201);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const credential = /^__Host-dvorik_session=([^;]+)/.exec(setCookie)?.[1];
  assert.ok(credential);
  return { setCookie, credential, cookie: `__Host-dvorik_session=${credential}` };
}

async function status(base: string, cookie: string) {
  return (await fetch(`${base}/api/session`, { headers: { cookie } })).status;
}

async function webhook(base: string, update: object) {
  return fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": environment.TELEGRAM_WEBHOOK_SECRET
    },
    body: JSON.stringify(update)
  });
}

async function assertFeatureDisabled(base: string, path: string, cookie: string, method = "POST", body = "{}") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json() as { code?: string }).code, "FEATURE_DISABLED");
}

try {
  await startStaff();
  await startWarehouse();
  const first = await start(ports[0]);
  const second = await start(ports[1]);
  const ready = await fetch(`${first}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ready: true });
  assert.match(String(ready.headers.get("x-request-id")), /^http:/);
  assert.equal(ready.headers.get("x-frame-options"), "DENY");
  assert.deepEqual(await (await fetch(`${first}/live`)).json(), { live: true });
  assert.deepEqual(await (await fetch(`${first}/healthz`)).json(), { status: "ok" });
  assert.equal((await fetch(`${first}/api/saby/webhook/wrong`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 503);
  const sabySignal = await fetch(`${first}/api/saby/webhook/${environment.DVORIK_SABY_WEBHOOK_SECRET}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "sale_changed" }) });
  assert.equal(sabySignal.status, 503);
  assert.equal((await sabySignal.json() as { code: string }).code, "CASH_UNAVAILABLE");

  assert.equal(await status(first, `__Host-dvorik_session=${legacyRawCredential}`), 401);
  const compatibilityInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(compatibilityInspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id='main'")[0].payload.includes(legacyRawCredential), true);
  compatibilityInspection.close();

  const initial = await login(first);
  assert.match(initial.setCookie, /Max-Age=28800/i);
  assert.match(initial.setCookie, /Path=\//i);
  assert.match(initial.setCookie, /HttpOnly/i);
  assert.match(initial.setCookie, /Secure/i);
  assert.match(initial.setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(initial.setCookie, /Domain=/i);
  assert.match(initial.credential, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await status(first, initial.cookie), 200);
  assert.equal(await status(second, initial.cookie), 200);

  const inspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  const row = inspection.query<{ id: string; token_hash: string; revoked_at: string | null }>(
    "SELECT id,token_hash,revoked_at FROM sessions WHERE revoked_at IS NULL"
  )[0];
  assert.ok(row);
  assert.notEqual(row.id, initial.credential);
  assert.match(row.token_hash, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(inspection.query("SELECT * FROM sessions")).includes(initial.credential), false);
  const payload = inspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id='main'")[0]?.payload ?? "";
  assert.equal(payload.includes(initial.credential), false);
  inspection.close();

  assert.equal(await status(second, `__Host-dvorik_session=${row.id}`), 401);
  assert.equal(await status(second, "__Host-dvorik_session=%"), 401);

  const rotated = await login(second);
  assert.notEqual(rotated.credential, initial.credential);
  assert.equal(await status(first, initial.cookie), 401);
  assert.equal(await status(first, rotated.cookie), 200);

  const logout = await fetch(`${second}/api/auth/logout`, { method: "POST", headers: { cookie: rotated.cookie } });
  assert.equal(logout.status, 200);
  const clearCookie = logout.headers.get("set-cookie") ?? "";
  assert.match(clearCookie, /^__Host-dvorik_session=;/);
  assert.match(clearCookie, /Path=\//i);
  assert.match(clearCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  assert.match(clearCookie, /HttpOnly/i);
  assert.match(clearCookie, /Secure/i);
  assert.match(clearCookie, /SameSite=Lax/i);
  assert.doesNotMatch(clearCookie, /Domain=/i);
  assert.equal(await status(first, rotated.cookie), 401);

  const concurrent = await Promise.all([login(first), login(second)]);
  const concurrentStatuses = await Promise.all([
    status(first, concurrent[0].cookie),
    status(second, concurrent[1].cookie)
  ]);
  assert.deepEqual([...concurrentStatuses].sort((left, right) => left - right), [200, 401]);
  const finalInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(finalInspection.query<{ count: number }>(
    "SELECT count(*) count FROM sessions WHERE user_id='u-admin' AND revoked_at IS NULL AND expires_at > ?",
    [new Date().toISOString()]
  )[0].count, 1);
  finalInspection.close();

  const seller = await login(first, 1003);
  const sellerProductWrite = await fetch(`${first}/api/products`, {
    method: "POST",
    headers: { cookie: seller.cookie, "content-type": "application/json" },
    body: JSON.stringify({ officialName: "forbidden", localName: "forbidden", unit: "шт" })
  });
  assert.equal(sellerProductWrite.status, 403);
  assert.equal((await sellerProductWrite.json() as { code?: string }).code, "FORBIDDEN");
  const superAdmin = await login(first, 1001);
  assert.deepEqual(await (await fetch(`${first}/api/runtime/capabilities`, { headers: { cookie: superAdmin.cookie } })).json(), { warehouseWriteMode: "fifo" });
  assert.equal((await fetch(`${first}/api/saby/status`, { headers: { cookie: superAdmin.cookie } })).status, 200);
  const cashStatus = await (await fetch(`${first}/api/cash/status`, { headers: { cookie: superAdmin.cookie } })).json() as { availability: string };
  assert.equal(cashStatus.availability, "disabled");
  const profitability = await (await fetch(`${first}/api/warehouse/products/p-1/profitability`, { headers: { cookie: superAdmin.cookie } })).json() as { actual: { availability: string } };
  assert.equal(profitability.actual.availability, "unavailable");
  const backupResponse = await fetch(`${first}/api/backups`, { method: "POST", headers: { cookie: superAdmin.cookie } });
  const backupText = await backupResponse.text();
  assert.equal(backupResponse.status, 201, backupText);
  const backup = JSON.parse(backupText) as { name: string; files: number };
  assert.match(backup.name, /^dvorik-backup-/);
  assert.equal(backup.files >= 1, true);
  const backupList = await (await fetch(`${first}/api/backups`, { headers: { cookie: superAdmin.cookie } })).json() as Array<{ name: string }>;
  assert.equal(backupList.some((item) => item.name === backup.name), true);
  const backupRestore = await fetch(`${first}/api/backups/${backup.name}/restore`, { method: "POST", headers: { cookie: superAdmin.cookie } });
  assert.equal(backupRestore.status, 200);
  assert.equal((await backupRestore.json() as { migrations: number[] }).migrations.length > 1, true);
  const malformedMutation = await fetch(`${first}/api/stock/operations`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "malformed-json" },
    body: "{"
  });
  assert.equal(malformedMutation.status, 400);
  assert.deepEqual(await malformedMutation.json(), { code: "MALFORMED_JSON", message: "Malformed JSON request body" });
  const unsupportedMutation = await fetch(`${first}/api/stock/operations`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "text/plain", "idempotency-key": "bad-content-type" },
    body: "not-json"
  });
  assert.equal(unsupportedMutation.status, 415);
  assert.deepEqual(await unsupportedMutation.json(), { code: "UNSUPPORTED_MEDIA_TYPE", message: "Mutating API requests require application/json" });
  const crossOriginMutation = await fetch(`${first}/api/stock/operations`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, origin: "https://evil.example", "content-type": "application/json", "idempotency-key": "cross-origin" },
    body: JSON.stringify({ type: "receipt", productId: "p-1", toLocationId: "loc-main", quantity: 1, reason: "must not execute" })
  });
  assert.equal(crossOriginMutation.status, 403);
  assert.deepEqual(await crossOriginMutation.json(), { code: "ORIGIN_FORBIDDEN", message: "Cross-origin mutation is not allowed" });
  const appStateBeforeStockCommands = openDatabase(databasePath, { readonly: true, fileMustExist: true })
    .query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload;
  const stockCreatedResponse = await fetch(`${first}/api/stock/operations`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-stock-sql-receipt" },
    body: JSON.stringify({ type: "receipt", productId: "p-1", toLocationId: "loc-main", quantity: 1, reason: "SQL production test" })
  });
  assert.equal(stockCreatedResponse.status, 410);
  assert.equal((await stockCreatedResponse.json() as { code: string }).code, "WAREHOUSE_LEGACY_WRITE_DISABLED");
  const stockReplayResponse = await fetch(`${second}/api/stock/operations`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-stock-sql-receipt" },
    body: JSON.stringify({ type: "receipt", productId: "p-1", toLocationId: "loc-main", quantity: 1, reason: "SQL production test" })
  });
  assert.equal(stockReplayResponse.status, 410);
  const reversalResponse = await fetch(`${second}/api/stock/operations/missing/reverse`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-stock-sql-reversal" },
    body: "{}"
  });
  assert.equal(reversalResponse.status, 410);
  const snapshotBeforeInventory = await (await fetch(`${first}/api/inventory/loc-main/snapshot`, { headers: { cookie: superAdmin.cookie } })).json() as Array<{ productId: string; locationId: string; expected: number; version: number }>;
  const inventoryRow = snapshotBeforeInventory.find((row) => row.productId === "p-1");
  assert.ok(inventoryRow);
  const inventoryResponse = await fetch(`${first}/api/inventory/apply`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-stock-sql-inventory" },
    body: JSON.stringify({ comment: "SQL production inventory", rows: [{ ...inventoryRow, actual: inventoryRow.expected + 0.1 }] })
  });
  assert.equal(inventoryResponse.status, 410);
  const stockInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(stockInspection.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key IN ('http-stock-sql-receipt', 'http-stock-sql-reversal', 'http-stock-sql-inventory')")[0].count, 0);
  assert.equal(stockInspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload, appStateBeforeStockCommands);
  stockInspection.close();
  const appStateBeforeScheduleCommands = openDatabase(databasePath, { readonly: true, fileMustExist: true })
    .query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload;
  const scheduleCreatedResponse = await fetch(`${first}/api/schedule`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-schedule-sql-create" },
    body: JSON.stringify({ date: "2033-01-02", start: "09:00", end: "10:00", locationId: "loc-main", employeeIds: ["u-admin"], status: "scheduled", comment: "SQL production schedule" })
  });
  assert.equal(scheduleCreatedResponse.status, 201);
  const scheduleCreated = await scheduleCreatedResponse.json() as { id: string };
  const schedulePatchedResponse = await fetch(`${second}/api/schedule/${scheduleCreated.id}`, {
    method: "PATCH",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-schedule-sql-patch" },
    body: JSON.stringify({ comment: "SQL production schedule updated" })
  });
  assert.equal(schedulePatchedResponse.status, 200);
  const scheduleFromSecond = await (await fetch(`${second}/api/schedule?from=2033-01-02&to=2033-01-02`, { headers: { cookie: superAdmin.cookie } })).json() as Array<{ id: string; comment: string }>;
  assert.deepEqual(scheduleFromSecond.filter((shift) => shift.id === scheduleCreated.id).map((shift) => shift.comment), ["SQL production schedule updated"]);
  const dayResponse = await fetch(`${first}/api/schedule/days/2033-01-03/loc-main`, {
    method: "PUT",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json", "idempotency-key": "http-schedule-sql-day" },
    body: JSON.stringify({ status: "closed", comment: "SQL production day" })
  });
  assert.equal(dayResponse.status, 200);
  const scheduleInspection = openDatabase(staffDatabasePath, { readonly: true, fileMustExist: true });
  assert.equal(scheduleInspection.query<{ count: number }>("SELECT count(*) count FROM staff_shifts WHERE id = ?", [scheduleCreated.id])[0].count, 1);
  scheduleInspection.close();
  const coreScheduleInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(coreScheduleInspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload, appStateBeforeScheduleCommands);
  coreScheduleInspection.close();
  const appStateBeforeProductCommands = openDatabase(databasePath, { readonly: true, fileMustExist: true })
    .query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload;
  const productCreatedResponse = await fetch(`${first}/api/products`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ officialName: "SQL production product", localName: "SQL product", unit: "шт", category: "Tests", lowStockThreshold: 1, sku: "SQL-TEST-1" })
  });
  assert.equal(productCreatedResponse.status, 410);
  const productInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(productInspection.query<{ count: number }>("SELECT count(*) count FROM products WHERE official_name = 'SQL production product'")[0].count, 0);
  assert.equal(productInspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload, appStateBeforeProductCommands);
  productInspection.close();
  const appStateBeforeLabels = openDatabase(databasePath, { readonly: true, fileMustExist: true })
    .query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload;
  const labelsPdfResponse = await fetch(`${first}/api/labels/pdf`, {
    method: "POST",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [{ productId: "p-1", quantity: 1 }] })
  });
  assert.equal(labelsPdfResponse.status, 200);
  assert.equal(Buffer.from(await labelsPdfResponse.arrayBuffer()).subarray(0, 4).toString("ascii"), "%PDF");
  const labelJobs = await (await fetch(`${second}/api/labels/jobs`, { headers: { cookie: superAdmin.cookie } })).json() as Array<{ id: string }>;
  assert.equal(labelJobs.length > 0, true);
  const labelsInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.equal(labelsInspection.query<{ count: number }>("SELECT count(*) count FROM label_jobs")[0].count > 0, true);
  assert.equal(labelsInspection.query<{ payload: string }>("SELECT payload FROM app_state WHERE id = 'main'")[0].payload, appStateBeforeLabels);
  labelsInspection.close();
  const externalCatalogWrite = openDatabase(databasePath);
  const externallyChangedProductId = externalCatalogWrite.query<{ id: string }>("SELECT id FROM products ORDER BY id LIMIT 1")[0].id;
  externalCatalogWrite.execute("UPDATE products SET local_name = ? WHERE id = ?", ["SQL runtime product", externallyChangedProductId]);
  externalCatalogWrite.close();
  const summary = await (await fetch(`${first}/api/summary`, { headers: { cookie: superAdmin.cookie } })).json() as { activeProducts: number; latestOperations: Array<{ id: string }> };
  assert.ok(summary.activeProducts > 0);
  assert.ok(summary.latestOperations.length > 0);
  const catalog = await (await fetch(`${first}/api/products?status=all&limit=100`, { headers: { cookie: superAdmin.cookie } })).json() as { items: Array<{ id: string; localName: string }> };
  assert.ok(catalog.items.length > 0);
  assert.equal(catalog.items.find((item) => item.id === externallyChangedProductId)?.localName, "SQL runtime product");
  const secondCatalog = await (await fetch(`${second}/api/products?status=all&limit=100`, { headers: { cookie: superAdmin.cookie } })).json() as { items: Array<{ id: string; localName: string }> };
  assert.equal(secondCatalog.items.find((item) => item.id === externallyChangedProductId)?.localName, "SQL runtime product");
  assert.ok((await (await fetch(`${first}/api/locations`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/balances`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/stock/operations`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/schedule`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/schedule/days`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/inventory/loc-main/snapshot`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/audit`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/reports/all`, { headers: { cookie: superAdmin.cookie } })).json() as unknown[]).length > 0);
  assert.ok((await (await fetch(`${first}/api/reports/movements/export`, { headers: { cookie: superAdmin.cookie } })).text()).includes('"id","occurredAt"'));
  const reportPdf = Buffer.from(await (await fetch(`${first}/api/reports/all/pdf`, { headers: { cookie: superAdmin.cookie } })).arrayBuffer());
  assert.equal(reportPdf.subarray(0, 4).toString("ascii"), "%PDF");
  const scheduleCsv = await (await fetch(`${first}/api/schedule/export?format=csv&from=2020-01-01&to=2035-12-31`, { headers: { cookie: superAdmin.cookie } })).text();
  assert.ok(scheduleCsv.includes("Дата"));
  const schedulePdf = Buffer.from(await (await fetch(`${first}/api/schedule/export?format=pdf&from=2020-01-01&to=2035-12-31`, { headers: { cookie: superAdmin.cookie } })).arrayBuffer());
  assert.equal(schedulePdf.subarray(0, 4).toString("ascii"), "%PDF");
  const sellerSession = await login(first, 1003);
  const sellerCatalog = await (await fetch(`${first}/api/products?status=all&limit=100`, { headers: { cookie: sellerSession.cookie } })).json() as { items: Array<{ status: string }> };
  assert.equal(sellerCatalog.items.every((item) => item.status === "active"), true);
  const sellerSchedule = await (await fetch(`${first}/api/schedule`, { headers: { cookie: sellerSession.cookie } })).json() as Array<{ employeeIds: string[] }>;
  assert.equal(sellerSchedule.some((shift) => !shift.employeeIds.includes("u-seller")), false);
  assert.equal((await fetch(`${first}/api/audit`, { headers: { cookie: sellerSession.cookie } })).status, 403);
  assert.equal((await fetch(`${first}/api/saby/status`, { headers: { cookie: sellerSession.cookie } })).status, 403);
  const adminSession = await login(first, 1002);
  for (const path of ["/api/payroll", "/api/finance", "/api/revenue", "/api/profit"]) {
    assert.equal((await fetch(`${first}${path}`, { headers: { cookie: sellerSession.cookie } })).status, 404);
    assert.equal((await fetch(`${first}${path}`, { headers: { cookie: adminSession.cookie } })).status, 404);
  }
  for (const path of [
    "/api/stock/buffer/apply",
    "/api/imports/preview",
    "/api/merges/preview",
    "/api/products/archive/preview",
    "/api/schedule/rotation/preview",
    "/api/schedule/future-replacement/preview",
    "/api/media/validate-link",
    "/api/reports/low/telegram"
  ]) await assertFeatureDisabled(first, path, superAdmin.cookie);
  await assertFeatureDisabled(first, "/api/notification-preferences", superAdmin.cookie, "PUT", JSON.stringify({ channel: "telegram", eventType: "all", deliveryMode: "daily" }));
  const openApi = await (await fetch(`${first}/api/openapi.json`)).json() as { paths: Record<string, unknown> };
  for (const path of ["/api/imports/preview", "/api/merges/preview", "/api/media/validate-link", "/api/reports/{type}/telegram"]) {
    assert.equal(path in openApi.paths, false);
  }
  for (const path of ["/api/payroll", "/api/finance", "/api/revenue", "/api/profit"]) assert.equal(path in openApi.paths, false);
  const block = await fetch(`${second}/api/users/u-admin`, {
    method: "PATCH",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "blocked" })
  });
  assert.equal(block.status, 200);
  assert.equal(await status(first, concurrent[0].cookie), 401);
  assert.equal(await status(second, concurrent[1].cookie), 401);
  assert.equal(await status(first, adminSession.cookie), 401);
  assert.equal((await login(first).catch((error) => error)) instanceof Error, true);
  const restore = await fetch(`${first}/api/users/u-admin`, {
    method: "PATCH",
    headers: { cookie: superAdmin.cookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "active" })
  });
  assert.equal(restore.status, 200);

  const beforeWebhookInspection = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  const beforeWebhookPayload = beforeWebhookInspection
    .query<{ payload: string }>("SELECT payload FROM app_state WHERE id='main'")[0].payload;
  beforeWebhookInspection.close();
  const applicantId = "tg-778899";
  const request = {
    update_id: 991001,
    message: { text: "/start", from: { id: 778899, first_name: "Applicant", last_name: "Test", username: "applicant" } }
  };
  const requestResponse = await webhook(first, request);
  assert.equal(requestResponse.status, 200);
  assert.deepEqual(await requestResponse.json(), { userId: applicantId, status: "pending" });
  const afterRequest = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.deepEqual(afterRequest.query<{ status: string }>("SELECT status FROM users WHERE id=?", [applicantId]), [{ status: "pending" }]);
  assert.equal(afterRequest.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE entity_id=? AND action='request'", [applicantId])[0].count, 1);
  assert.equal(afterRequest.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE recipient_user_id='u-super' AND type='telegram_onboarding_request'")[0].count, 1);
  assert.equal(afterRequest.query<{ payload: string }>("SELECT payload FROM app_state WHERE id='main'")[0].payload, beforeWebhookPayload);
  afterRequest.close();

  const approval = {
    update_id: 991002,
    callback_query: { data: `onboard:approve:${applicantId}:seller`, from: { id: 1001, first_name: "Super", username: "super" } }
  };
  const approvalResponse = await webhook(second, approval);
  assert.equal(approvalResponse.status, 200);
  assert.deepEqual(await approvalResponse.json(), { userId: applicantId, status: "active" });
  const approvalReplay = await webhook(first, approval);
  assert.equal(approvalReplay.status, 200);
  assert.deepEqual(await approvalReplay.json(), { userId: applicantId, status: "active" });
  const afterApproval = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  assert.deepEqual(afterApproval.query<{ status: string }>("SELECT status FROM users WHERE id=?", [applicantId]), [{ status: "active" }]);
  assert.equal(afterApproval.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE entity_id=? AND action='approve'", [applicantId])[0].count, 1);
  assert.equal(afterApproval.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE recipient_user_id=? AND type='telegram_onboarding_approve'", [applicantId])[0].count, 1);
  assert.equal(afterApproval.query<{ payload: string }>("SELECT payload FROM app_state WHERE id='main'")[0].payload, beforeWebhookPayload);
  afterApproval.close();

  console.log("session HTTP cross-process tests passed");
} finally {
  for (const child of children.reverse()) child.kill("SIGTERM");
  await Promise.all(children.map((child) => new Promise<void>((resolve) => child.exitCode !== null ? resolve() : child.once("exit", () => resolve()))));
  fs.rmSync(root, { recursive: true, force: true });
}
