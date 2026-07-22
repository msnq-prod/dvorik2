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
  result?: unknown;
  error?: unknown;
}>;

function waitFor(worker: Worker, event: WorkerMessage["event"]): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: WorkerMessage) => {
      if (message.event !== event && message.event !== "error") return;
      worker.off("message", onMessage);
      if (message.event === "error") reject(new Error(JSON.stringify(message.error)));
      else resolve(message);
    };
    worker.on("message", onMessage);
    worker.once("error", reject);
  });
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-idempotency-parallel-"));
const databasePath = path.join(directory, "parallel.sqlite");
const setup = openDatabase(databasePath);
setup.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); CREATE TABLE concurrent_operations(id TEXT PRIMARY KEY);");
applyMigrations(setup);
setup.close();

const workerUrl = new URL("./idempotency-concurrency-worker.ts", import.meta.url);
const tsxApiUrl = import.meta.resolve("tsx/esm/api");
const bootstrap = new URL(`data:text/javascript,${encodeURIComponent(`
  import { tsImport } from ${JSON.stringify(tsxApiUrl)};
  await tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)});
`)}`);

async function runPair(key: string, holderQuantity: number, contenderQuantity: number, operationId: string) {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const holder = new Worker(bootstrap, { workerData: { databasePath, role: "holder", barrier, key, quantity: holderQuantity, operationId } });
  const holderExit = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  const holderMutation = waitFor(holder, "mutation_started");
  const holderResult = waitFor(holder, "result");
  await holderMutation;

  const contender = new Worker(bootstrap, { workerData: { databasePath, role: "contender", barrier, key, quantity: contenderQuantity, operationId } });
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

const [sameHolder, sameContender] = await runPair("parallel-same-key", 10, 10, "same-operation");
assert.deepEqual(sameHolder.result, { outcome: "executed", status: 201, body: { operationId: "same-operation" } });
assert.deepEqual(sameContender.result, { outcome: "replayed", status: 201, body: { operationId: "same-operation" } });

const [differentHolder, differentContender] = await runPair("parallel-different-key", 20, 21, "different-operation");
assert.deepEqual(differentHolder.result, { outcome: "executed", status: 201, body: { operationId: "different-operation" } });
assert.deepEqual(differentContender.result, { outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" });

const verification = openDatabase(databasePath);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM concurrent_operations")[0].count, 2);
assert.deepEqual(verification.query<{ status: string; response_status: number; version: number }>("SELECT status, response_status, version FROM idempotency_keys WHERE scope='stock' AND key='parallel-same-key'"), [{ status: "completed", response_status: 201, version: 1 }]);
assert.deepEqual(verification.query<{ status: string; response_status: number; version: number }>("SELECT status, response_status, version FROM idempotency_keys WHERE scope='stock' AND key='parallel-different-key'"), [{ status: "completed", response_status: 201, version: 1 }]);
verification.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("idempotency concurrency tests passed");
