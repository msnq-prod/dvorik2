import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase } from "./database";
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

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-inventory-session-parallel-"));
const databasePath = path.join(directory, "parallel.sqlite");
const setup = openDatabase(databasePath);
setup.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(setup);
setup.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller');
  INSERT INTO permissions(id,code) VALUES ('inventory:write','inventory:write');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('seller','inventory:write');
  INSERT INTO users(id,status) VALUES ('u-seller','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-seller','seller');
  INSERT INTO products(id,official_name,unit,status,inventory_kind,package_mass_grams) VALUES
    ('p-weight','Весовой','кг','active','weight',500),('p-piece','Штучный','шт','active','piece',NULL);
  INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES
    ('p-weight',4000,0,'2026-07-20T00:00:00.000Z'),('p-piece',3000,0,'2026-07-20T00:00:00.000Z');
`);
setup.close();

const workerUrl = new URL("./inventory-session-concurrency-worker.ts", import.meta.url);
const tsxApiUrl = import.meta.resolve("tsx/esm/api");
const bootstrap = new URL(`data:text/javascript,${encodeURIComponent(`import { tsImport } from ${JSON.stringify(tsxApiUrl)}; await tsImport(${JSON.stringify(workerUrl.href)}, ${JSON.stringify(workerUrl.href)});`)}`);

async function pair(mode: "start" | "consume", holderKey: string, contenderKey: string) {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const holder = new Worker(bootstrap, { workerData: { databasePath, role: "holder", barrier, key: holderKey, mode } });
  const holderExit = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  const mutation = waitFor(holder, "mutation_started");
  const holderResult = waitFor(holder, "result");
  await mutation;
  const contender = new Worker(bootstrap, { workerData: { databasePath, role: "contender", barrier, key: contenderKey, mode } });
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

const [startWinner, startLoser] = await pair("start", "start-a", "start-b");
assert.equal(startWinner.status, 201);
assert.equal(startLoser.status, 409);
assert.equal(startLoser.body.code, "INVENTORY_ALREADY_ACTIVE");

const cleanup = openDatabase(databasePath);
cleanup.execute("UPDATE inventory_sessions SET status='completed' WHERE status='active'");
cleanup.close();

const [consumeWinner, consumeReplay] = await pair("consume", "consume-same", "consume-same");
assert.equal(consumeWinner.outcome, "executed");
assert.equal(consumeReplay.outcome, "replayed");
assert.deepEqual(consumeReplay.body, consumeWinner.body);

const verification = openDatabase(databasePath);
assert.equal(verification.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-piece'")[0].quantity_minor, 2000);
assert.equal(verification.query<{ count: number }>("SELECT count(*) count FROM consumption_records WHERE product_id='p-piece'")[0].count, 1);
assert.equal(verification.query<{ count: number }>("SELECT count(*) count FROM stock_operations WHERE product_id='p-piece'")[0].count, 1);
verification.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("inventory session concurrency tests passed");
