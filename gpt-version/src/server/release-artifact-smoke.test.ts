import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-release-artifact-"));
const media = path.join(root, "media");
const backups = path.join(root, "backups");
fs.mkdirSync(media);
fs.mkdirSync(backups);
const port = 35000 + Math.floor(Math.random() * 1000);
const environment = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  DVORIK_SQLITE_FILE: path.join(root, "dvorik.sqlite"),
  DVORIK_TIMEZONE: "Asia/Vladivostok",
  DVORIK_RELEASE_VERSION: "2026.07.15-artifact-smoke",
  TELEGRAM_BOT_TOKEN: "artifact-production-token",
  TELEGRAM_WEBHOOK_SECRET: "artifact-production-webhook-secret",
  DVORIK_OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
  DVORIK_OBJECT_STORAGE_BUCKET: "dvorik-artifact",
  DVORIK_OBJECT_STORAGE_PUBLIC_URL: "https://cdn.example.test/dvorik-artifact",
  DVORIK_OBJECT_STORAGE_TOKEN: "artifact-production-storage-token",
  DVORIK_MEDIA_DIR: media,
  DVORIK_BACKUP_DIR: backups,
  DVORIK_COOKIE_SAME_SITE: "lax",
  DVORIK_SESSION_SECRET: "artifact-production-session-secret-at-least-32-bytes",
  DVORIK_STAFF_MODE: "external",
  DVORIK_STAFF_BASE_URL: "http://127.0.0.1:3202",
  DVORIK_WAREHOUSE_MODE: "external",
  DVORIK_WAREHOUSE_BASE_URL: "http://127.0.0.1:3303",
  DVORIK_INTERNAL_SECRET: "artifact-internal-secret-at-least-32-bytes"
};

assert.equal(fs.existsSync(path.resolve("dist/index.js")), true, "Build artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/backup-job.js")), true, "Backup job artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/warehouse-company-worker.js")), true, "Company worker artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/staff-identity-worker.js")), true, "Staff identity worker artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/cash/index.js")), true, "Cash service artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/cash/backup-job.js")), true, "Cash backup job artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/staff/index.js")), true, "Staff service artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/staff/backup-job.js")), true, "Staff backup job artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/staff/migrate-from-core.js")), true, "Staff migration artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/staff/finalize-core-cutover.js")), true, "Staff cutover artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/public/index.html")), true, "Built UI is missing");
assert.equal(fs.existsSync(path.resolve("dist/migrations/008_identity_user_version.sql")), true, "Migrations are missing from artifact");
assert.equal(fs.existsSync(path.resolve("dist/cash/migrations/001_cash_schema.sql")), true, "Cash migrations are missing from artifact");
assert.equal(fs.existsSync(path.resolve("dist/staff/migrations/003_staff_outbox.sql")), true, "Staff migrations are missing from artifact");
assert.equal(fs.existsSync(path.resolve("dist/warehouse/migrations/002_service_tables.sql")), true, "Warehouse migrations are missing from artifact");

const child = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

async function waitFor(url: string) {
  let lastError = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return response;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Artifact did not become ready: ${lastError}; ${output}`);
}

try {
  const ready = await waitFor(`http://127.0.0.1:${port}/ready`);
  assert.equal((await ready.json() as { ready: boolean }).ready, true);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json(), { status: "ok" });
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/live`)).json() as { live: boolean }).live, true);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/dev/config`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
    child.kill("SIGKILL");
    const exit = await exited;
    assert.equal(exit.signal, "SIGKILL", output);
  }
}

const backupJob = spawnSync(process.execPath, ["dist/backup-job.js"], { cwd: process.cwd(), env: environment, encoding: "utf8" });
assert.equal(backupJob.status, 0, `${backupJob.stdout}\n${backupJob.stderr}`);
assert.match(backupJob.stdout, /"event":"backup_job_succeeded"/);
assert.equal(fs.readdirSync(backups).some((name) => name.startsWith("dvorik-backup-")), true);

console.log("production artifact smoke passed");
