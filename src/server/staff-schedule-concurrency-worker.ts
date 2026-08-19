import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { createSqliteStaffScheduleRepositories } from "./sqlite-staff-schedule-repositories";
import { StaffScheduleService, type StaffScheduleRepositories } from "./staff-schedule-service";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{ databasePath: string; role: "holder" | "contender"; barrier: SharedArrayBuffer; key: string }>;
const database = openDatabase(input.databasePath);
const barrier = new Int32Array(input.barrier);
function repositories(connection: DatabaseContext): StaffScheduleRepositories {
  const real = createSqliteStaffScheduleRepositories(connection);
  let paused = false;
  return { ...real, schedule: { ...real.schedule, saveShift(shift, options) {
    const result = real.schedule.saveShift(shift, options);
    if (input.role === "holder" && !paused) {
      paused = true;
      parentPort!.postMessage({ event: "mutation_started" });
      Atomics.wait(barrier, 0, 0, 4_000);
    }
    return result;
  } } };
}
try {
  let sequence = 0;
  const service = new StaffScheduleService(
    new CommandExecutor(new UnitOfWork(database, repositories), { now: () => "2026-07-21T02:00:00.000Z" }, { resolve: () => ({ kind: "user", userId: "u-b", authenticatedBy: "web_session" }) }),
    { processingTimeoutMs: 60_000, idempotencyRetentionMs: 86_400_000, outboxMaxAttempts: 8, createId: (kind) => `${input.key}-${input.role}-${kind}-${++sequence}` }
  );
  parentPort!.postMessage({ event: "attempting" });
  const result = service.resolveExchange({ actorReference: "verified", requestId: `http:${input.key}`, channel: "web", idempotencyKey: input.key }, "exchange", "accept");
  parentPort!.postMessage({ event: "result", result });
} catch (error) {
  parentPort!.postMessage({ event: "error", error: error instanceof Error ? { name: error.name, message: error.message } : String(error) });
} finally { database.close(); }
