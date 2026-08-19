import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { createSqliteStockCommandRepositories } from "./sqlite-stock-command-repositories";
import { StockOperationService, type StockCommandRepositories, type StockOperationCommand } from "./stock-operation-service";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{
  databasePath: string;
  role: "holder" | "contender";
  barrier: SharedArrayBuffer;
  key: string;
  command: StockOperationCommand;
}>;
const barrier = new Int32Array(input.barrier);
const database = openDatabase(input.databasePath);

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
          parentPort!.postMessage({ event: "mutation_started", role: input.role });
          Atomics.wait(barrier, 0, 0, 4_000);
        }
        return result;
      }
    }
  };
}

try {
  const service = new StockOperationService(
    new CommandExecutor(
      new UnitOfWork(database, repositories),
      { now: () => "2026-07-12T07:00:00.000Z" },
      { resolve: () => ({ kind: "user", userId: "u-admin", authenticatedBy: "web_session" }) }
    ),
    {
      processingTimeoutMs: 60_000,
      idempotencyRetentionMs: 86_400_000,
      outboxMaxAttempts: 8,
      createId: (kind) => `${input.key}-${input.role}-${kind}`
    }
  );
  parentPort!.postMessage({ event: "attempting", role: input.role });
  const result = service.execute({
    actorReference: "verified-session",
    requestId: `http:${input.key}:${input.role}`,
    channel: "web",
    idempotencyKey: input.key
  }, input.command);
  parentPort!.postMessage({ event: "result", role: input.role, result });
} catch (error) {
  parentPort!.postMessage({ event: "error", role: input.role, error: error instanceof Error ? { name: error.name, message: error.message } : String(error) });
} finally {
  database.close();
}
