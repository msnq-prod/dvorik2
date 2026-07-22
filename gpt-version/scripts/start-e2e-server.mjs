import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const databaseFile = "/tmp/dvorik-gpt-version-e2e.sqlite";
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databaseFile}${suffix}`, { force: true });

const tsx = path.resolve("node_modules/.bin/tsx");
const child = spawn(tsx, ["src/server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DVORIK_DEV_TOOLS: "1",
    TELEGRAM_BOT_TOKEN: "dev-token",
    DVORIK_SQLITE_FILE: databaseFile
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
