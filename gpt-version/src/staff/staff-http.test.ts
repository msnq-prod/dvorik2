import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-staff-http-"));
const port = 6600 + Math.floor(Math.random() * 200);
const child = spawn(process.execPath, ["--import", "tsx", path.resolve("src/staff/index.ts")], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", STAFF_PORT: String(port), DVORIK_STAFF_SQLITE_FILE: path.join(root, "staff.sqlite"), DVORIK_INTERNAL_SECRET: "staff-http-internal-secret-at-least-32" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
try {
  await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(output)), 15_000); const ready = () => { if (output.includes("Dvorik Staff:")) { clearTimeout(timeout); resolve(); } }; child.stdout.on("data", ready); child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Staff exited ${code}: ${output}`)); }); });
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/ready`)).json(), { ready: true });
  assert.equal((await fetch(`http://127.0.0.1:${port}/internal/profiles`)).status, 401);
} finally {
  child.kill("SIGTERM"); await new Promise<void>((resolve) => { child.once("exit", () => resolve()); setTimeout(resolve, 5_000); });
}
console.log("staff HTTP process tests passed");
