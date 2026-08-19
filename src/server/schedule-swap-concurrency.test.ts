import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";

type WorkerMessage = Readonly<{
  event: "attempting" | "mutation_started" | "result" | "error";
  role: "holder" | "contender";
  result?: any;
  error?: unknown;
}>;

function waitFor(worker: Worker, event: WorkerMessage["event"]): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const listener = (message: WorkerMessage) => {
      if (message.event !== event && message.event !== "error") return;
      worker.off("message", listener);
      if (message.event === "error") reject(new Error(JSON.stringify(message.error)));
      else resolve(message);
    };
    worker.on("message", listener);
    worker.once("error", reject);
  });
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-swap-parallel-"));
const databasePath = path.join(directory, "schedule.sqlite");
const setup = openDatabase(databasePath);
setup.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); ");
applyMigrations(setup);
setup.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller'),('admin','admin');
  INSERT INTO permissions(id,code) VALUES ('schedule:manage','schedule:manage');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','schedule:manage');
  INSERT INTO users(id,status) VALUES
    ('source-a','active'),('target-a','active'),('target-b','active'),
    ('source-b','active'),('target-c','active'),
    ('u-admin','active'),('source-d','active'),('target-d','active');
  INSERT INTO user_roles(user_id,role_id) VALUES
    ('source-a','seller'),('target-a','seller'),('target-b','seller'),
    ('source-b','seller'),('target-c','seller'),
    ('u-admin','admin'),('source-d','seller'),('target-d','seller');
  INSERT INTO locations(id,code,name,type,status) VALUES ('loc','LOC','Location','house','active');
  INSERT INTO schedule_days(id,local_date,location_id,status,version) VALUES
    ('day-a','2026-07-13','loc','working',0),
    ('day-b','2026-07-14','loc','working',0),
    ('day-d','2026-07-15','loc','working',0);
  INSERT INTO shifts(id,schedule_day_id,location_id,local_date,start_time,end_time,status,version) VALUES
    ('shift-a','day-a','loc','2026-07-13','08:00','12:00','scheduled',0),
    ('shift-b','day-b','loc','2026-07-14','08:00','12:00','scheduled',0),
    ('shift-d','day-d','loc','2026-07-15','08:00','12:00','scheduled',0);
  INSERT INTO shift_assignments(shift_id,user_id) VALUES ('shift-a','source-a'),('shift-b','source-b'),('shift-d','source-d');
  INSERT INTO shift_swap_requests(id,from_shift_id,from_user_id,to_user_id,status,created_at,version,updated_at) VALUES
    ('swap-a','shift-a','source-a','target-a','pending','2026-07-12T07:00:00.000Z',0,'2026-07-12T07:00:00.000Z'),
    ('swap-b','shift-a','source-a','target-b','pending','2026-07-12T07:00:00.000Z',0,'2026-07-12T07:00:00.000Z'),
    ('swap-c','shift-b','source-b','target-c','pending','2026-07-12T07:00:00.000Z',0,'2026-07-12T07:00:00.000Z'),
    ('swap-d','shift-d','source-d','target-d','pending','2026-07-12T07:00:00.000Z',0,'2026-07-12T07:00:00.000Z');
`);
setup.close();

const workerUrl = new URL("./schedule-swap-concurrency-worker.ts", import.meta.url);
const tsxApiUrl = import.meta.resolve("tsx/esm/api");
const bootstrap = new URL(`data:text/javascript,${encodeURIComponent(`
  import { tsImport } from ${JSON.stringify(tsxApiUrl)};
  await tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)});
`)}`);

async function runPair(input: Readonly<{
  holder: { key: string; actorId: string; swapId?: string; operation?: "accept" | "edit"; shiftId?: string };
  contender: { key: string; actorId: string; swapId?: string; operation?: "accept" | "edit"; shiftId?: string };
}>) {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const holder = new Worker(bootstrap, { workerData: { databasePath, role: "holder", barrier, ...input.holder } });
  const holderExit = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  const holderMutation = waitFor(holder, "mutation_started");
  const holderResult = waitFor(holder, "result");
  await holderMutation;
  const contender = new Worker(bootstrap, { workerData: { databasePath, role: "contender", barrier, ...input.contender } });
  const contenderExit = new Promise<void>((resolve) => contender.once("exit", () => resolve()));
  const contenderAttempt = waitFor(contender, "attempting");
  const contenderResult = waitFor(contender, "result");
  await contenderAttempt;
  await new Promise((resolve) => setTimeout(resolve, 75));
  Atomics.store(new Int32Array(barrier), 0, 1);
  Atomics.notify(new Int32Array(barrier), 0);
  const results = await Promise.all([holderResult, contenderResult]);
  await Promise.all([holderExit, contenderExit]);
  return results;
}

const [winner, staleSibling] = await runPair({
  holder: { key: "accept-a", actorId: "target-a", swapId: "swap-a" },
  contender: { key: "accept-b", actorId: "target-b", swapId: "swap-b" }
});
assert.equal(winner.result.outcome, "executed");
assert.equal(winner.result.status, 200);
assert.equal(staleSibling.result.outcome, "executed");
assert.equal(staleSibling.result.status, 409);
assert.equal(staleSibling.result.body.code, "STALE_SWAP");
assert.equal(staleSibling.result.body.details.currentStatus, "cancelled");

const [sameWinner, sameReplay] = await runPair({
  holder: { key: "same-accept", actorId: "target-c", swapId: "swap-c" },
  contender: { key: "same-accept", actorId: "target-c", swapId: "swap-c" }
});
assert.equal(sameWinner.result.outcome, "executed");
assert.equal(sameReplay.result.outcome, "replayed");
assert.deepEqual(sameReplay.result.body, sameWinner.result.body);

const [editWinner, stalePreview] = await runPair({
  holder: { key: "edit-d", actorId: "u-admin", swapId: "", operation: "edit", shiftId: "shift-d" },
  contender: { key: "accept-d", actorId: "target-d", swapId: "swap-d", operation: "accept" }
});
assert.equal(editWinner.result.status, 200);
assert.equal(stalePreview.result.status, 409);
assert.equal(stalePreview.result.body.code, "STALE_SWAP");
assert.deepEqual(stalePreview.result.body.details, {
  swapId: "swap-d", expectedShiftVersion: 0, currentShiftVersion: 1, currentStatus: "expired"
});

const verification = openDatabase(databasePath);
assert.deepEqual(verification.query<{ shift_id: string; user_id: string }>("SELECT shift_id,user_id FROM shift_assignments ORDER BY shift_id,user_id"), [
  { shift_id: "shift-a", user_id: "target-a" },
  { shift_id: "shift-b", user_id: "target-c" },
  { shift_id: "shift-d", user_id: "source-d" }
]);
assert.deepEqual(verification.query<{ id: string; status: string }>("SELECT id,status FROM shift_swap_requests ORDER BY id"), [
  { id: "swap-a", status: "accepted" },
  { id: "swap-b", status: "cancelled" },
  { id: "swap-c", status: "accepted" },
  { id: "swap-d", status: "expired" }
]);
assert.deepEqual(verification.query<{ id: string; version: number }>("SELECT id,version FROM shifts ORDER BY id"), [
  { id: "shift-a", version: 1 },
  { id: "shift-b", version: 1 },
  { id: "shift-d", version: 1 }
]);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM webapp_notifications WHERE type='swap.accepted'")[0].count, 2);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM outbox_messages WHERE type='swap.accepted'")[0].count, 2);
assert.equal(verification.query("PRAGMA foreign_key_check").length, 0);
verification.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("schedule swap concurrency tests passed");
