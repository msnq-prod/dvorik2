import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { executeIdempotently } from "./idempotency";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{
  databasePath: string;
  role: "holder" | "contender";
  barrier: SharedArrayBuffer;
  key: string;
  quantity: number;
  operationId: string;
}>;
const barrier = new Int32Array(input.barrier);
const database = openDatabase(input.databasePath);

function repositories(connection: DatabaseContext) {
  return {
    idempotency: createSqliteIdempotencyRepository(connection),
    business: {
      append() { connection.execute("INSERT INTO concurrent_operations(id) VALUES (?)", [input.operationId]); }
    }
  };
}

try {
  const executor = new CommandExecutor(
    new UnitOfWork(database, repositories),
    { now: () => "2026-07-12T04:00:00.000Z" },
    { resolve: () => ({ kind: "system", service: "concurrency-test", authenticatedBy: "worker_registry" }) }
  );
  parentPort!.postMessage({ event: "attempting", role: input.role });
  const result = executor.execute({
    actorReference: "registered-worker",
    requestId: `worker:${input.role}`,
    channel: "worker",
    idempotencyKey: input.key
  }, (context) => executeIdempotently(
    context,
    "stock",
    { productId: "p-1", quantity: input.quantity },
    { processingTimeoutMs: 60_000, retentionMs: 86_400_000 },
    () => {
      context.transaction.repositories.business.append();
      if (input.role === "holder") {
        parentPort!.postMessage({ event: "mutation_started", role: input.role });
        Atomics.wait(barrier, 0, 0, 4_000);
      }
      return { status: 201, body: { operationId: input.operationId } };
    }
  ));
  parentPort!.postMessage({ event: "result", role: input.role, result });
} catch (error) {
  parentPort!.postMessage({
    event: "error",
    role: input.role,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error)
  });
} finally {
  database.close();
}
