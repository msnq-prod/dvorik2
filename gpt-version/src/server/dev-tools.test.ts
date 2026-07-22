import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const port = 5400 + Math.floor(Math.random() * 400);
const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/server/index.ts")], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "test", DVORIK_DEV_TOOLS: "0", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 15_000);
    child.stdout.on("data", () => {
      if (output.includes("Dvorik WebApp:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before test: ${code}; ${output}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const demo = await fetch(`${base}/api/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "u-super" }) });
  const config = await fetch(`${base}/api/dev/config`);
  const initData = await fetch(`${base}/api/dev/telegram/init-data`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const openApi = await (await fetch(`${base}/api/openapi.json`)).json() as { paths: Record<string, unknown> };
  for (const response of [demo, config, initData]) assert.equal(response.status, 404);
  assert.equal(demo.headers.get("set-cookie"), null);
  assert.equal("/api/auth/demo" in openApi.paths, false);
  assert.equal("/api/dev/config" in openApi.paths, false);
  assert.equal("/api/dev/telegram/init-data" in openApi.paths, false);
  console.log("dev tools route tests passed");
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}
