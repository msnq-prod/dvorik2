import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { InventoryService, ReversalService, type InventoryCommand } from "./inventory-reversal-service";
import { createSqliteStockCommandRepositories } from "./sqlite-stock-command-repositories";
import type { StockCommandRepositories } from "./stock-operation-service";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{
  databasePath: string; role: "holder" | "contender"; barrier: SharedArrayBuffer;
  key: string; mode: "inventory" | "reversal"; inventory?: InventoryCommand; operationId?: string;
}>;
const database = openDatabase(input.databasePath);
const barrier = new Int32Array(input.barrier);

function repositories(connection: DatabaseContext): StockCommandRepositories {
  const real = createSqliteStockCommandRepositories(connection);
  let paused = false;
  return {
    ...real,
    stock: {
      ...real.stock,
      saveBalance(balance, options) {
        const result = real.stock.saveBalance(balance, options);
        if (input.role === "holder" && !paused) {
          paused = true;
          parentPort!.postMessage({ event: "mutation_started" });
          Atomics.wait(barrier, 0, 0, 4_000);
        }
        return result;
      }
    }
  };
}

try {
  const executor = new CommandExecutor(
    new UnitOfWork(database, repositories),
    { now: () => "2026-07-12T08:00:00.000Z" },
    { resolve: () => ({ kind: "user", userId: "u-admin", authenticatedBy: "web_session" }) }
  );
  const options = {
    processingTimeoutMs: 60_000, idempotencyRetentionMs: 86_400_000, outboxMaxAttempts: 8,
    createId: (kind: "operation" | "audit" | "notification" | "outbox") => `${input.key}-${input.role}-${kind}`
  };
  parentPort!.postMessage({ event: "attempting" });
  const metadata = { actorReference: "verified", requestId: `http:${input.key}:${input.role}`, channel: "web" as const, idempotencyKey: input.key };
  const result = input.mode === "inventory"
    ? new InventoryService(executor, options).execute(metadata, input.inventory!)
    : new ReversalService(executor, options).execute(metadata, input.operationId!);
  parentPort!.postMessage({ event: "result", result });
} catch (error) {
  parentPort!.postMessage({ event: "error", error: error instanceof Error ? { name: error.name, message: error.message } : String(error) });
} finally {
  database.close();
}
