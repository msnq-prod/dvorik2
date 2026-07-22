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
  DVORIK_SESSION_SECRET: "artifact-production-session-secret-at-least-32-bytes"
};

assert.equal(fs.existsSync(path.resolve("dist/index.js")), true, "Build artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/backup-job.js")), true, "Backup job artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/saby-worker.js")), true, "Saby worker artifact is missing");
assert.equal(fs.existsSync(path.resolve("dist/public/index.html")), true, "Built UI is missing");
assert.equal(fs.existsSync(path.resolve("dist/migrations/008_identity_user_version.sql")), true, "Migrations are missing from artifact");

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
  if (!child.killed) child.kill("SIGTERM");
  const exit = await new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  assert.equal(exit, 0, output);
}

const backupJob = spawnSync(process.execPath, ["dist/backup-job.js"], { cwd: process.cwd(), env: environment, encoding: "utf8" });
assert.equal(backupJob.status, 0, `${backupJob.stdout}\n${backupJob.stderr}`);
assert.match(backupJob.stdout, /"event":"backup_job_succeeded"/);
assert.equal(fs.readdirSync(backups).some((name) => name.startsWith("dvorik-backup-")), true);

console.log("production artifact smoke passed");
