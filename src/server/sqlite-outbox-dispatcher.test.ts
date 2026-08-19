import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { dispatchSqliteOutbox } from "./sqlite-outbox-dispatcher";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-outbox-dispatcher-"));
const filename = path.join(directory, "outbox.sqlite");
const first = openDatabase(filename);
first.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(first);
first.execute("INSERT INTO users(id,status,version,updated_at) VALUES ('user-1','active',0,?)", ["2026-07-15T00:00:00.000Z"]);

function enqueue(id: string, input: Readonly<{ attempts?: number; maxAttempts?: number; status?: string; availableAt?: string }> = {}) {
  const at = "2026-07-15T00:00:00.000Z";
  first.execute(
    `INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,attempt_count,max_attempts,available_at,created_at,updated_at,version)
     VALUES (?,'telegram','user-1','stock.threshold',?,'pending',?,?,?,?,?,0)`,
    [id, JSON.stringify({ schemaVersion: 1, value: { text: id } }), input.attempts ?? 0, input.maxAttempts ?? 8, input.availableAt ?? at, at, at]
  );
}

enqueue("race");
const second = openDatabase(filename);
let releaseFirst!: () => void;
let startedFirst!: () => void;
const firstStarted = new Promise<void>((resolve) => { startedFirst = resolve; });
const firstRelease = new Promise<void>((resolve) => { releaseFirst = resolve; });
const dispatchA = dispatchSqliteOutbox(first, async () => { startedFirst(); await firstRelease; }, {
  workerId: "worker-a", now: new Date("2026-07-15T00:00:00.000Z"), createLeaseToken: () => "lease-a"
});
await firstStarted;
const dispatchB = await dispatchSqliteOutbox(second, async () => assert.fail("second worker must not send a leased message"), {
  workerId: "worker-b", now: new Date("2026-07-15T00:00:00.000Z"), createLeaseToken: () => "lease-b"
});
assert.deepEqual(dispatchB, { claimed: 0, sent: 0, failed: 0 });
releaseFirst();
assert.deepEqual(await dispatchA, { claimed: 1, sent: 1, failed: 0 });
assert.deepEqual(first.query<{ status: string; attempt_count: number }>("SELECT status,attempt_count FROM outbox_messages WHERE id='race'"), [{ status: "sent", attempt_count: 0 }]);

enqueue("retry");
const retryAt = new Date("2026-07-15T00:01:00.000Z");
assert.deepEqual(await dispatchSqliteOutbox(first, async () => { throw new Error("Telegram 429"); }, { workerId: "retry", now: retryAt, createLeaseToken: () => "lease-retry" }), { claimed: 1, sent: 0, failed: 1 });
assert.deepEqual(first.query<{ status: string; attempt_count: number; last_error_code: string }>("SELECT status,attempt_count,last_error_code FROM outbox_messages WHERE id='retry'"), [{ status: "pending", attempt_count: 1, last_error_code: "DELIVERY_FAILED" }]);
const retryAvailableAt = first.query<{ available_at: string }>("SELECT available_at FROM outbox_messages WHERE id='retry'")[0].available_at;
assert.deepEqual(await dispatchSqliteOutbox(first, async () => undefined, { workerId: "retry-success", now: new Date(retryAvailableAt), createLeaseToken: () => "lease-retry-success" }), { claimed: 1, sent: 1, failed: 0 });

enqueue("expired");
first.execute("UPDATE outbox_messages SET status='processing',lease_owner='dead',lease_token='dead-lease',lease_expires_at=?,updated_at=?,version=version+1 WHERE id='expired'", ["2026-07-15T00:02:00.000Z", "2026-07-15T00:01:00.000Z"]);
assert.deepEqual(await dispatchSqliteOutbox(first, async () => undefined, { workerId: "recovery", now: new Date("2026-07-15T00:03:00.000Z"), createLeaseToken: () => "lease-recovery" }), { claimed: 1, sent: 1, failed: 0 });

enqueue("terminal", { attempts: 7, maxAttempts: 8 });
assert.deepEqual(await dispatchSqliteOutbox(first, async () => { throw new Error("permanent"); }, { workerId: "terminal", now: new Date("2026-07-15T00:04:00.000Z"), createLeaseToken: () => "lease-terminal" }), { claimed: 1, sent: 0, failed: 1 });
assert.deepEqual(first.query<{ status: string; attempt_count: number; last_error_code: string }>("SELECT status,attempt_count,last_error_code FROM outbox_messages WHERE id='terminal'"), [{ status: "failed", attempt_count: 8, last_error_code: "DELIVERY_FAILED" }]);

enqueue("disabled");
first.execute("UPDATE outbox_messages SET type='report_pdf' WHERE id='disabled'");
assert.deepEqual(await dispatchSqliteOutbox(first, async () => assert.fail("deferred delivery must not be claimed"), {
  workerId: "production", now: new Date("2026-07-15T00:05:00.000Z"), excludedTypes: ["report_pdf"]
}), { claimed: 0, sent: 0, failed: 0 });
assert.deepEqual(first.query<{ status: string }>("SELECT status FROM outbox_messages WHERE id='disabled'"), [{ status: "pending" }]);

second.close();
first.close();
