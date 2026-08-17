import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CashClient } from "../server/cash-client";
import { openDatabase } from "../server/database";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-cash-http-"));
const databaseFile = path.join(root, "cash.sqlite");
const port = 6300 + Math.floor(Math.random() * 300);
const secret = "cash-http-internal-secret-at-least-32-bytes";
const child = spawn(process.execPath, ["--import", "tsx", path.resolve("src/cash/index.ts")], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    CASH_PORT: String(port),
    DVORIK_CASH_SQLITE_FILE: databaseFile,
    DVORIK_CORE_BASE_URL: "http://127.0.0.1:1",
    DVORIK_INTERNAL_SECRET: secret,
    DVORIK_SABY_WEBHOOK_SECRET: "cash-http-webhook-secret-at-least-32",
    DVORIK_SABY_POINT_ID: "1",
    DVORIK_SABY_APP_CLIENT_ID: "test-client",
    DVORIK_SABY_APP_SECRET: "test-secret",
    DVORIK_SABY_SECRET_KEY: "test-key",
    DVORIK_CASH_SYNC_ENABLED: "0",
    DVORIK_CASH_CUTOVER_AT: "2026-07-27T00:00:00.000Z"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Cash did not start: ${output}`)), 15_000);
    const ready = () => {
      if (!output.includes("Dvorik Cash:")) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout.on("data", ready);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Cash exited: ${code}; ${output}`)); });
  });
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/ready`)).json(), { ready: true });
  assert.equal((await new CashClient(`http://127.0.0.1:${port}`, secret).status()).availability, "connected");
  const inspection = openDatabase(databaseFile, { readonly: true, fileMustExist: true });
  assert.equal(inspection.query<{ count: number }>("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name IN ('users','products','inventory_balances')")[0].count, 0);
  assert.equal(inspection.query<{ cursor_updated_at: string }>("SELECT cursor_updated_at FROM cash_sync_state")[0].cursor_updated_at, "2026-07-27T00:00:00.000Z");
  inspection.close();
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => { child.once("exit", () => resolve()); setTimeout(resolve, 5_000); });
}
console.log("cash HTTP process tests passed");
