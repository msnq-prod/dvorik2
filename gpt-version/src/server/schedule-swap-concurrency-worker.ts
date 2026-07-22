import { parentPort, workerData } from "node:worker_threads";
import { CommandExecutor } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { ScheduleSwapService, type ScheduleCommandRepositories } from "./schedule-swap-service";
import { createSqliteScheduleCommandRepositories } from "./sqlite-schedule-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const input = workerData as Readonly<{
  databasePath: string;
  role: "holder" | "contender";
  barrier: SharedArrayBuffer;
  key: string;
  actorId: string;
  operation?: "accept" | "edit";
  swapId?: string;
  shiftId?: string;
}>;
const barrier = new Int32Array(input.barrier);
const database = openDatabase(input.databasePath);

function repositories(connection: DatabaseContext): ScheduleCommandRepositories {
  const real = createSqliteScheduleCommandRepositories(connection);
  let paused = false;
  return {
    ...real,
    schedule: {
      ...real.schedule,
      saveShift(shift, options) {
        const result = real.schedule.saveShift(shift, options);
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
  let idSequence = 0;
  const service = new ScheduleSwapService(
    new CommandExecutor(
      new UnitOfWork(database, repositories),
      { now: () => "2026-07-12T08:00:00.000Z" },
      { resolve: () => ({ kind: "user", userId: input.actorId, authenticatedBy: "web_session" }) }
    ),
    {
      processingTimeoutMs: 60_000,
      idempotencyRetentionMs: 86_400_000,
      outboxMaxAttempts: 8,
      createId: (kind) => `${input.key}-${input.role}-${kind}-${++idSequence}`
    }
  );
  parentPort!.postMessage({ event: "attempting", role: input.role });
  const metadata = {
    actorReference: "verified-session",
    requestId: `http:${input.key}:${input.role}`,
    channel: "web",
    idempotencyKey: input.key
  } as const;
  const result = input.operation === "edit"
    ? service.saveShift(metadata, {
      id: input.shiftId,
      date: "2026-07-15",
      start: "10:00",
      end: "14:00",
      locationId: "loc",
      employeeIds: ["source-d"],
      status: "scheduled",
      comment: "changed concurrently",
      expectedVersion: 0
    })
    : service.resolveSwap(metadata, { swapId: input.swapId ?? "", action: "accept" });
  parentPort!.postMessage({ event: "result", role: input.role, result });
} catch (error) {
  parentPort!.postMessage({
    event: "error",
    role: input.role,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      ...("code" in error ? { code: String(error.code) } : {}),
      ...("causeCode" in error ? { causeCode: String(error.causeCode) } : {})
    } : String(error)
  });
} finally {
  database.close();
}
