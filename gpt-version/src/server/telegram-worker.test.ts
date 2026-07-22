import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { dispatchTelegramOutbox, runTelegramOutboxWorker } from "./telegram-worker";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-telegram-worker-"));
const filename = path.join(directory, "worker.sqlite");
process.env.DVORIK_SQLITE_FILE = filename;
process.env.TELEGRAM_BOT_TOKEN = "worker-test-token";
const database = openDatabase(filename);
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.execute("INSERT INTO users(id,telegram_user_id,status,version,updated_at) VALUES ('recipient','100500','active',0,?)", ["2026-07-15T00:00:00.000Z"]);
database.execute("INSERT INTO roles(id,name) VALUES ('seller','seller')");
database.execute("INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES ('recipient','seller',?)", ["2026-07-15T00:00:00.000Z"]);

function enqueue(id: string) {
  const at = "2026-07-15T00:00:00.000Z";
  database.execute(
    `INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,attempt_count,max_attempts,available_at,created_at,updated_at,version)
     VALUES (?,'telegram','recipient','stock.threshold',?,'pending',0,8,?,?,?,0)`,
    [id, JSON.stringify({ schemaVersion: 1, value: { text: id } }), at, at, at]
  );
}

enqueue("rate-limit");
assert.deepEqual(await dispatchTelegramOutbox(async () => new Response(JSON.stringify({ error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 } }), { status: 429 })), { claimed: 1, sent: 0, failed: 1 });
assert.deepEqual(database.query<{ status: string; attempt_count: number; last_error_code: string }>("SELECT status,attempt_count,last_error_code FROM outbox_messages WHERE id='rate-limit'"), [{ status: "pending", attempt_count: 1, last_error_code: "TELEGRAM_429" }]);

enqueue("bad-request");
assert.deepEqual(await dispatchTelegramOutbox(async () => new Response(JSON.stringify({ error_code: 400, description: "Bad Request" }), { status: 400 })), { claimed: 1, sent: 0, failed: 1 });
assert.deepEqual(database.query<{ status: string; attempt_count: number; last_error_code: string }>("SELECT status,attempt_count,last_error_code FROM outbox_messages WHERE id='bad-request'"), [{ status: "failed", attempt_count: 1, last_error_code: "TELEGRAM_400" }]);

enqueue("gateway");
assert.deepEqual(await dispatchTelegramOutbox(async () => new Response("gateway", { status: 503 })), { claimed: 1, sent: 0, failed: 1 });
assert.deepEqual(database.query<{ status: string; attempt_count: number; last_error_code: string }>("SELECT status,attempt_count,last_error_code FROM outbox_messages WHERE id='gateway'"), [{ status: "pending", attempt_count: 1, last_error_code: "TELEGRAM_503" }]);

enqueue("backlog-a");
enqueue("backlog-b");
const controller = new AbortController();
let sent = 0;
const drained = await runTelegramOutboxWorker({
  signal: controller.signal,
  pollMs: 50,
  fetchImpl: async () => {
    sent += 1;
    if (sent === 2) controller.abort();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
});
assert.deepEqual(drained, { sent: 2, failed: 0, cycles: 1, workerErrors: 0, stopped: true });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE id IN ('backlog-a','backlog-b') AND status='sent'")[0].count, 2);
database.close();
