import { loadRuntimeConfig } from "./config";
import { CommandExecutor } from "./command-context";
import { openDatabase } from "./database";
import { InventoryReminderService } from "./inventory-reminder-service";
import { createSqliteInventoryReminderRepositories } from "./sqlite-inventory-reminder-repositories";
import { UnitOfWork } from "./unit-of-work";

const config = loadRuntimeConfig();
const database = openDatabase(config.sqliteFile);
try {
  const service = new InventoryReminderService(new CommandExecutor(new UnitOfWork(database, createSqliteInventoryReminderRepositories), { now: () => new Date().toISOString() }, { resolve: () => ({ kind: "system", service: "inventory-reminder", authenticatedBy: "worker_registry" }) }), { processingTimeoutMs: 30_000, idempotencyRetentionMs: 14 * 24 * 60 * 60_000, outboxMaxAttempts: 8 });
  const date = new Date().toISOString().slice(0, 10);
  const result = service.run({ actorReference: "worker", requestId: `inventory-reminder:${date}`, channel: "worker", idempotencyKey: `inventory-reminder:${date}` });
  console.log(JSON.stringify(result));
} finally { database.close(); }
