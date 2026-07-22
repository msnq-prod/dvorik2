import { loadRuntimeConfig } from "./config";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { SabyClient } from "./saby-client";
import { SabySyncService } from "./saby-sync-service";

const config = loadRuntimeConfig();
if (!config.saby) throw new Error("DVORIK_SABY_ENABLED=1 and Saby credentials are required");
const database = openDatabase(config.sqliteFile);
applyMigrations(database);
const service = new SabySyncService(database, new SabyClient(config.saby), {
  pointId: config.saby.pointId,
  timezone: config.timezone,
  overlapMinutes: config.saby.overlapMinutes,
  initialLookbackHours: config.saby.initialLookbackHours
});

let stopping = false;
let nextScheduledAt = 0;
const stop = (signal: string) => { stopping = true; console.log(JSON.stringify({ event: "saby_worker_stopping", signal })); };
process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));

try {
  while (!stopping) {
    const now = Date.now();
    if (now >= nextScheduledAt || service.hasPendingSignal()) {
      try {
        const result = await service.synchronize();
        const retried = service.retryQueuedStock();
        console.log(JSON.stringify({ event: "saby_sync_succeeded", ...result, queuedStockRetried: retried }));
        nextScheduledAt = Date.now() + 15 * 60_000;
      } catch (error) {
        console.error(JSON.stringify({ event: "saby_sync_failed", code: error instanceof Error ? error.message : "UNKNOWN" }));
        nextScheduledAt = Date.now() + 60_000;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
} finally {
  database.close();
}
