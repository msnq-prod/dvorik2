import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WarehouseClient } from "../server/warehouse-client";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-warehouse-http-"));
const databaseFile = path.join(root, "warehouse.sqlite");
fs.copyFileSync(path.resolve("data/warehouse.sqlite"), databaseFile);
const port = 6800 + Math.floor(Math.random() * 200);
const secret = "warehouse-http-internal-secret-at-least-32";
const child = spawn(process.execPath, ["--import", "tsx", path.resolve("src/warehouse/index.ts")], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "test", WAREHOUSE_PORT: String(port), DVORIK_WAREHOUSE_SQLITE_FILE: databaseFile, DVORIK_CORE_BASE_URL: "http://127.0.0.1:1", DVORIK_INTERNAL_SECRET: secret },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Warehouse did not start: ${output}`)), 15_000);
    const ready = () => { if (output.includes("Dvorik Warehouse:")) { clearTimeout(timeout); resolve(); } };
    child.stdout.on("data", ready);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Warehouse exited: ${code}; ${output}`)); });
  });
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/ready`)).json(), { ready: true, discrepancies: [] });
  assert.equal((await fetch(`http://127.0.0.1:${port}/internal/status`)).status, 401);
  const client = new WarehouseClient(`http://127.0.0.1:${port}`, secret);
  assert.deepEqual(await client.cutoverReadiness(), { ready: true, discrepancies: [] });
  const balances = await client.balances() as Array<{ productId: string; remainingPackageMilli: number }>;
  assert.equal(balances.filter((item) => item.remainingPackageMilli > 0).length, 32);
  assert.equal(balances.reduce((sum, item) => sum + item.remainingPackageMilli, 0), 59_000);
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => { child.once("exit", () => resolve()); setTimeout(resolve, 5_000); });
}
console.log("warehouse HTTP process tests passed");
