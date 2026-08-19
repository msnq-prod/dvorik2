import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import type { StockOperationCommand } from "./stock-operation-service";

type WorkerMessage = Readonly<{ event: "attempting" | "mutation_started" | "result" | "error"; role: "holder" | "contender"; result?: any; error?: unknown }>;
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

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-stock-parallel-"));
const databasePath = path.join(directory, "stock.sqlite");
const setup = openDatabase(databasePath);
setup.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(setup);
setup.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin');
  INSERT INTO permissions(id,code) VALUES ('stock:move','stock:move');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','stock:move');
  INSERT INTO users(id,status) VALUES ('u-admin','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin');
  INSERT INTO locations(id,code,name,type,status) VALUES ('loc-a','A','A','warehouse','active');
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor) VALUES
    ('p-increment','Increment','шт','active',0,0),('p-decrement','Decrement','шт','active',0,0),('p-same','Same','шт','active',0,0);
  INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES
    ('p-increment','loc-a',0,0,0),('p-decrement','loc-a',5,5000,0),('p-same','loc-a',0,0,0);
`);
setup.close();

const workerUrl = new URL("./stock-operation-concurrency-worker.ts", import.meta.url);
const tsxApiUrl = import.meta.resolve("tsx/esm/api");
const bootstrap = new URL(`data:text/javascript,${encodeURIComponent(`
  import { tsImport } from ${JSON.stringify(tsxApiUrl)};
  await tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)});
`)}`);

async function runPair(key: string, holderCommand: StockOperationCommand, contenderCommand: StockOperationCommand) {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const holder = new Worker(bootstrap, { workerData: { databasePath, role: "holder", barrier, key, command: holderCommand } });
  const holderExit = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  const holderMutation = waitFor(holder, "mutation_started");
  const holderResult = waitFor(holder, "result");
  await holderMutation;
  const contender = new Worker(bootstrap, { workerData: { databasePath, role: "contender", barrier, key: contenderCommand === holderCommand ? key : `${key}-contender`, command: contenderCommand } });
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

const incrementCommand: StockOperationCommand = { type: "receipt", productId: "p-increment", toLocationId: "loc-a", quantity: 2 };
const [incrementHolder, incrementContender] = await runPair("increment", incrementCommand, { ...incrementCommand });
assert.equal(incrementHolder.result.status, 201);
assert.equal(incrementContender.result.status, 201);

const decrementCommand: StockOperationCommand = { type: "write_off", productId: "p-decrement", fromLocationId: "loc-a", quantity: 4 };
const [decrementHolder, decrementContender] = await runPair("decrement", decrementCommand, { ...decrementCommand });
assert.equal(decrementHolder.result.status, 201);
assert.equal(decrementContender.result.status, 409);
assert.equal(decrementContender.result.body.code, "NEGATIVE_STOCK_BLOCKED");

const sameCommand: StockOperationCommand = { type: "receipt", productId: "p-same", toLocationId: "loc-a", quantity: 2 };
const [sameHolder, sameContender] = await runPair("same-key", sameCommand, sameCommand);
assert.equal(sameHolder.result.outcome, "executed");
assert.equal(sameContender.result.outcome, "replayed");
assert.deepEqual(sameContender.result.body, sameHolder.result.body);

const verification = openDatabase(databasePath);
assert.deepEqual(verification.query<{ product_id: string; quantity_minor: number; version: number }>("SELECT product_id,quantity_minor,version FROM stock_balances ORDER BY product_id"), [
  { product_id: "p-decrement", quantity_minor: 1000, version: 1 },
  { product_id: "p-increment", quantity_minor: 4000, version: 2 },
  { product_id: "p-same", quantity_minor: 2000, version: 1 }
]);
assert.deepEqual(verification.query<{ product_id: string; count: number }>("SELECT product_id,count(*) AS count FROM stock_operations GROUP BY product_id ORDER BY product_id"), [
  { product_id: "p-decrement", count: 1 },
  { product_id: "p-increment", count: 2 },
  { product_id: "p-same", count: 1 }
]);
assert.equal(verification.query("SELECT * FROM stock_balances WHERE quantity_minor < 0").length, 0);
verification.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("stock operation concurrency tests passed");
