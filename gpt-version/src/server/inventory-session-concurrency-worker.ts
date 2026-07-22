import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { InventorySessionService, type InventorySessionRepositories } from "./inventory-session-service";
import { createSqliteInventorySessionRepositories } from "./sqlite-inventory-session-repositories";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{
  databasePath: string;
  role: "holder" | "contender";
  barrier: SharedArrayBuffer;
  key: string;
  mode: "start" | "consume";
}>;
const database = openDatabase(input.databasePath);
const barrier = new Int32Array(input.barrier);

function repositories(connection: DatabaseContext): InventorySessionRepositories {
  const real = createSqliteInventorySessionRepositories(connection);
  let paused = false;
  function pauseAfterMutation() {
    if (input.role !== "holder" || paused) return;
    paused = true;
    parentPort!.postMessage({ event: "mutation_started" });
    Atomics.wait(barrier, 0, 0, 4_000);
  }
  return {
    ...real,
    sessions: {
      ...real.sessions,
      create(session, rows, at) {
        const result = real.sessions.create(session, rows, at);
        if (input.mode === "start") pauseAfterMutation();
        return result;
      }
    },
    totals: {
      ...real.totals,
      save(productId, quantity, expectedVersion, at) {
        const result = real.totals.save(productId, quantity, expectedVersion, at);
        if (input.mode === "consume") pauseAfterMutation();
        return result;
      }
    }
  };
}

try {
  const executor = new CommandExecutor(
    new UnitOfWork(database, repositories),
    { now: () => "2026-07-20T12:00:00.000Z" },
    { resolve: () => ({ kind: "user", userId: "u-seller", authenticatedBy: "web_session" }) }
  );
  const service = new InventorySessionService(executor, {
    processingTimeoutMs: 60_000,
    idempotencyRetentionMs: 86_400_000,
    createId: (kind) => `${input.key}-${input.role}-${kind}`
  });
  parentPort!.postMessage({ event: "attempting" });
  const metadata = { actorReference: "verified", requestId: `http:${input.key}:${input.role}`, channel: "web" as const, idempotencyKey: input.key };
  const result = input.mode === "start"
    ? service.start(metadata)
    : service.consume(metadata, { productId: "p-piece", quantity: 1, comment: "Параллельный расход" });
  parentPort!.postMessage({ event: "result", result });
} catch (error) {
  parentPort!.postMessage({ event: "error", error: error instanceof Error ? { name: error.name, message: error.message } : String(error) });
} finally {
  database.close();
}
