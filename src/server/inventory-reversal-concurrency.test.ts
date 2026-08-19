import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "./database";
import type { InventoryCommand } from "./inventory-reversal-service";
import { applyMigrations } from "./migrations";

type Message = { event: "attempting" | "mutation_started" | "result" | "error"; result?: any; error?: unknown };
function waitFor(worker: Worker, event: Message["event"]): Promise<Message> {
  return new Promise((resolve, reject) => {
    const listener = (message: Message) => {
      if (message.event !== event && message.event !== "error") return;
      worker.off("message", listener);
      message.event === "error" ? reject(new Error(JSON.stringify(message.error))) : resolve(message);
    };
    worker.on("message", listener);
    worker.once("error", reject);
  });
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-inventory-reversal-parallel-"));
const databasePath = path.join(directory, "parallel.sqlite");
const setup = openDatabase(databasePath);
setup.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(setup);
setup.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin');
  INSERT INTO permissions(id,code) VALUES ('inventory:write','inventory:write'),('techlog:read','techlog:read');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','inventory:write'),('admin','techlog:read');
  INSERT INTO users(id,status) VALUES ('u-admin','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin');
  INSERT INTO locations(id,code,name,type,status) VALUES ('loc-a','A','A','warehouse','active');
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor) VALUES
    ('p-inventory','Inventory','шт','active',0,0),('p-same','Same','шт','active',0,0),
    ('p-reversal','Reversal','шт','active',0,0),('p-reversal-same','Reversal same','шт','active',0,0);
  INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES
    ('p-inventory','loc-a',5,5000,0),('p-same','loc-a',5,5000,0),
    ('p-reversal','loc-a',2,2000,0),('p-reversal-same','loc-a',2,2000,0);
  INSERT INTO stock_operations(id,type,product_id,to_location_id,quantity,quantity_minor,actor_id,reason,created_at)
    VALUES ('original-receipt','receipt','p-reversal','loc-a',2,2000,'u-admin','seed','2026-07-12T07:00:00.000Z');
  INSERT INTO stock_operations(id,type,product_id,to_location_id,quantity,quantity_minor,actor_id,reason,created_at)
    VALUES ('original-receipt-same','receipt','p-reversal-same','loc-a',2,2000,'u-admin','seed','2026-07-12T07:00:00.000Z');
`);
setup.close();

const workerUrl = new URL("./inventory-reversal-concurrency-worker.ts", import.meta.url);
const tsxApiUrl = import.meta.resolve("tsx/esm/api");
const bootstrap = new URL(`data:text/javascript,${encodeURIComponent(`import { tsImport } from ${JSON.stringify(tsxApiUrl)}; await tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)});`)}`);

async function pair(holderData: Record<string, unknown>, contenderData: Record<string, unknown>) {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const holder = new Worker(bootstrap, { workerData: { databasePath, role: "holder", barrier, ...holderData } });
  const holderExit = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  const mutation = waitFor(holder, "mutation_started");
  const holderResult = waitFor(holder, "result");
  await mutation;
  const contender = new Worker(bootstrap, { workerData: { databasePath, role: "contender", barrier, ...contenderData } });
  const contenderExit = new Promise<void>((resolve) => contender.once("exit", () => resolve()));
  const attempting = waitFor(contender, "attempting");
  const contenderResult = waitFor(contender, "result");
  await attempting;
  await new Promise((resolve) => setTimeout(resolve, 75));
  Atomics.store(new Int32Array(barrier), 0, 1);
  Atomics.notify(new Int32Array(barrier), 0);
  const results = await Promise.all([holderResult, contenderResult]);
  await Promise.all([holderExit, contenderExit]);
  return results.map((message) => message.result);
}

const inventory: InventoryCommand = { comment: "Count", rows: [{ productId: "p-inventory", locationId: "loc-a", expected: 5, version: 0, actual: 3 }] };
const [inventoryWinner, inventoryLoser] = await pair(
  { key: "inventory-a", mode: "inventory", inventory },
  { key: "inventory-b", mode: "inventory", inventory }
);
assert.equal(inventoryWinner.status, 201);
assert.equal(inventoryLoser.status, 409);
assert.equal(inventoryLoser.body.code, "INVENTORY_CONFLICT");

const sameInventory: InventoryCommand = { comment: "Same", rows: [{ productId: "p-same", locationId: "loc-a", expected: 5, version: 0, actual: 4 }] };
const [sameWinner, sameReplay] = await pair(
  { key: "inventory-same", mode: "inventory", inventory: sameInventory },
  { key: "inventory-same", mode: "inventory", inventory: sameInventory }
);
assert.equal(sameWinner.outcome, "executed");
assert.equal(sameReplay.outcome, "replayed");

const [reversalWinner, reversalLoser] = await pair(
  { key: "reversal-a", mode: "reversal", operationId: "original-receipt" },
  { key: "reversal-b", mode: "reversal", operationId: "original-receipt" }
);
assert.equal(reversalWinner.status, 201);
assert.equal(reversalLoser.status, 409);
assert.equal(reversalLoser.body.code, "ALREADY_REVERSED");

const [sameReversalWinner, sameReversalReplay] = await pair(
  { key: "reversal-same", mode: "reversal", operationId: "original-receipt-same" },
  { key: "reversal-same", mode: "reversal", operationId: "original-receipt-same" }
);
assert.equal(sameReversalWinner.outcome, "executed");
assert.equal(sameReversalReplay.outcome, "replayed");
assert.deepEqual(sameReversalReplay.body, sameReversalWinner.body);

const verification = openDatabase(databasePath);
assert.deepEqual(verification.query<{ product_id: string; quantity_minor: number; version: number }>("SELECT product_id,quantity_minor,version FROM stock_balances ORDER BY product_id"), [
  { product_id: "p-inventory", quantity_minor: 3000, version: 1 },
  { product_id: "p-reversal", quantity_minor: 0, version: 1 },
  { product_id: "p-reversal-same", quantity_minor: 0, version: 1 },
  { product_id: "p-same", quantity_minor: 4000, version: 1 }
]);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE product_id='p-inventory'")[0].count, 1);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE product_id='p-same'")[0].count, 1);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE reversed_operation_id='original-receipt'")[0].count, 1);
assert.equal(verification.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE reversed_operation_id='original-receipt-same'")[0].count, 1);
verification.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("inventory/reversal concurrency tests passed");
