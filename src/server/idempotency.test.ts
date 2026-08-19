import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandContext, type CommandMetadata } from "./command-context";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import {
  canonicalRequestHash,
  canonicalizeJson,
  executeIdempotently,
  IdempotencyError,
  type IdempotentHttpResponse
} from "./idempotency";
import { RowMappingError } from "./mappers/core";
import { applyMigrations } from "./migrations";
import { createPageLimit, type IdempotencyRepository, type JsonValue } from "./repositories";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import { UnitOfWork } from "./unit-of-work";

assert.equal(canonicalizeJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
assert.equal(canonicalRequestHash({ quantity: 1, nested: { b: true, a: null } }), canonicalRequestHash({ nested: { a: null, b: true }, quantity: 1 }));
assert.notEqual(canonicalRequestHash({ quantity: 1 }), canonicalRequestHash({ quantity: 2 }));
assert.notEqual(canonicalRequestHash({ values: [1, 2] }), canonicalRequestHash({ values: [2, 1] }));
for (const invalid of [undefined, Number.NaN, Number.POSITIVE_INFINITY, [, 1], () => undefined, Symbol("bad"), new Date()] as unknown[]) {
  assert.throws(() => canonicalRequestHash(invalid as JsonValue), (error) => error instanceof IdempotencyError && error.code === "INVALID_PAYLOAD");
}
const symbolArray = [1] as unknown[] & Record<symbol, unknown>;
symbolArray[Symbol("hidden")] = true;
const hiddenObject = { visible: true };
Object.defineProperty(hiddenObject, "hidden", { value: true });
const accessorObject = Object.defineProperty({}, "unstable", { enumerable: true, get: () => 1 });
for (const invalid of [symbolArray, hiddenObject, accessorObject]) {
  assert.throws(() => canonicalRequestHash(invalid as JsonValue), (error) => error instanceof IdempotencyError && error.code === "INVALID_PAYLOAD");
}
const cyclic: Record<string, unknown> = {};
cyclic.self = cyclic;
assert.throws(() => canonicalRequestHash(cyclic as JsonValue), (error) => error instanceof IdempotencyError && error.code === "INVALID_PAYLOAD");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-idempotency-"));
const database = openDatabase(path.join(directory, "idempotency.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now')); CREATE TABLE business_events(id TEXT PRIMARY KEY, value TEXT NOT NULL);");
applyMigrations(database);

function repositories(connection: DatabaseContext, completionFault = false) {
  const realIdempotency = createSqliteIdempotencyRepository(connection);
  const idempotency: IdempotencyRepository = completionFault ? {
    ...realIdempotency,
    find: realIdempotency.find.bind(realIdempotency),
    reserve: realIdempotency.reserve.bind(realIdempotency),
    complete: () => ({ outcome: "stale", current: realIdempotency.find("fault", "completion")! }),
    fail: realIdempotency.fail.bind(realIdempotency),
    deleteExpired: realIdempotency.deleteExpired.bind(realIdempotency)
  } : realIdempotency;
  return {
    idempotency,
    business: {
      append(id: string, value: string) { connection.execute("INSERT INTO business_events VALUES (?, ?)", [id, value]); }
    }
  };
}

type TestRepositories = ReturnType<typeof repositories>;
const verifiedSession = Object.freeze({ session: "verified" });
const actorResolver = {
  resolve(reference: unknown, channel: string) {
    if (reference !== verifiedSession || channel !== "web") throw new Error("untrusted");
    return { kind: "user", userId: "u-admin", authenticatedBy: "web_session" };
  }
};
const options = { processingTimeoutMs: 60_000, retentionMs: 86_400_000 };

function metadata(key: string): CommandMetadata {
  return { actorReference: verifiedSession, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}

function command<T extends JsonValue>(
  key: string,
  request: JsonValue,
  now: string,
  run: (context: CommandContext<TestRepositories>) => IdempotentHttpResponse<T>,
  completionFault = false,
  scope = "stock"
) {
  const executor = new CommandExecutor(
    new UnitOfWork(database, (connection) => repositories(connection, completionFault)),
    { now: () => now },
    actorResolver
  );
  return executor.execute(metadata(key), (context) => executeIdempotently(context, scope, request, options, () => run(context)));
}

let invalidRuns = 0;
assert.deepEqual(command("invalid-payload", undefined as unknown as JsonValue, "2026-07-12T00:00:00.000Z", () => {
  invalidRuns += 1;
  return { status: 200, body: null };
}), { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_PAYLOAD" });
assert.deepEqual(command("invalid-scope", { quantity: 1 }, "2026-07-12T00:00:00.000Z", () => {
  invalidRuns += 1;
  return { status: 200, body: null };
}, false, " arbitrary scope "), { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_SCOPE" });
assert.equal(invalidRuns, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key IN ('invalid-payload','invalid-scope')")[0].count, 0);

let firstRuns = 0;
const first = command("same", { quantity: 1, productId: "p-1" }, "2026-07-12T01:00:00.000Z", (context) => {
  firstRuns += 1;
  context.transaction.repositories.business.append("business-same", "winner");
  return { status: 201, body: { operationId: "operation-1", quantity: 1 } };
});
assert.deepEqual(first, { outcome: "executed", status: 201, body: { operationId: "operation-1", quantity: 1 } });
const replay = command("same", { productId: "p-1", quantity: 1 }, "2026-07-12T01:00:01.000Z", () => {
  firstRuns += 1;
  return { status: 599, body: { wrong: true } };
});
assert.deepEqual(replay, { outcome: "replayed", status: 201, body: { operationId: "operation-1", quantity: 1 } });
assert.equal(firstRuns, 1);
assert.deepEqual(command("same", { quantity: 2, productId: "p-1" }, "2026-07-12T01:00:02.000Z", () => ({ status: 200, body: null })), {
  outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
});
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM business_events WHERE id = 'business-same'")[0].count, 1);

let failedRuns = 0;
const failed = command("failed", { quantity: 3 }, "2026-07-12T01:10:00.000Z", () => {
  failedRuns += 1;
  return { status: 422, body: { code: "INVALID_QUANTITY", quantity: 3 } };
});
assert.deepEqual(failed, { outcome: "executed", status: 422, body: { code: "INVALID_QUANTITY", quantity: 3 } });
assert.deepEqual(command("failed", { quantity: 3 }, "2026-07-12T01:10:01.000Z", () => {
  failedRuns += 1;
  return { status: 200, body: null };
}), { outcome: "replayed", status: 422, body: { code: "INVALID_QUANTITY", quantity: 3 } });
assert.equal(failedRuns, 1);

database.transaction((connection) => {
  const repository = createSqliteIdempotencyRepository(connection);
  repository.reserve({
    scope: "stock", key: "active", requestHash: canonicalRequestHash({ quantity: 4 }),
    createdAt: "2026-07-12T02:00:00.000Z", claimExpiresAt: "2026-07-12T02:05:00.000Z"
  }, "2026-07-12T02:00:00.000Z");
});
assert.deepEqual(command("active", { quantity: 4 }, "2026-07-12T02:04:59.999Z", () => ({ status: 200, body: null })), {
  outcome: "in_progress", status: 409, code: "IDEMPOTENCY_IN_PROGRESS"
});
assert.deepEqual(command("active", { quantity: 5 }, "2026-07-12T02:05:00.000Z", () => ({ status: 200, body: null })), {
  outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
});

database.execute(
  "INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,expires_at,version,updated_at) VALUES ('stock','legacy-null-deadline',?,'processing',?,NULL,0,?)",
  [canonicalRequestHash({ quantity: 5 }), "2026-07-12 02:00:00", "2026-07-12 02:00:00"]
);
assert.deepEqual(command("legacy-null-deadline", { quantity: 5 }, "2026-07-12T02:00:59.999Z", () => ({ status: 200, body: null })), {
  outcome: "in_progress", status: 409, code: "IDEMPOTENCY_IN_PROGRESS"
});
assert.deepEqual(command("legacy-null-deadline", { quantity: 5 }, "2026-07-12T02:01:00.000Z", () => ({ status: 200, body: { recovered: "legacy" } })), {
  outcome: "executed", status: 200, body: { recovered: "legacy" }
});

database.transaction((connection) => {
  const repository = createSqliteIdempotencyRepository(connection);
  const old = repository.reserve({
    scope: "stock", key: "recover", requestHash: canonicalRequestHash({ quantity: 6 }),
    createdAt: "2026-07-12T02:00:00.000Z", claimExpiresAt: "2026-07-12T02:01:00.000Z"
  }, "2026-07-12T02:00:00.000Z");
  assert.equal(old.outcome, "reserved");
});
const recovered = command("recover", { quantity: 6 }, "2026-07-12T02:01:00.000Z", (context) => {
  context.transaction.repositories.business.append("business-recovered", "recovered");
  return { status: 200, body: { recovered: true } };
});
assert.deepEqual(recovered, { outcome: "executed", status: 200, body: { recovered: true } });
assert.equal(database.query<{ version: number }>("SELECT version FROM idempotency_keys WHERE scope='stock' AND key='recover'")[0].version, 2);

database.transaction((connection) => {
  const repository = createSqliteIdempotencyRepository(connection);
  const firstClaim = repository.reserve({
    scope: "stock", key: "stale-claimant", requestHash: canonicalRequestHash({ quantity: 7 }),
    createdAt: "2026-07-12 02:00:00", claimExpiresAt: "2026-07-12 02:01:00"
  }, "2026-07-12T02:00:00.000Z");
  assert.equal(firstClaim.outcome, "reserved");
  const nextClaim = repository.reserve({
    scope: "stock", key: "stale-claimant", requestHash: canonicalRequestHash({ quantity: 7 }),
    createdAt: "2026-07-12T02:01:00.000Z", claimExpiresAt: "2026-07-12T02:02:00.000Z"
  }, "2026-07-12T02:01:00.000Z");
  assert.equal(nextClaim.outcome, "reserved");
  if (firstClaim.outcome !== "reserved" || nextClaim.outcome !== "reserved") throw new Error("claims required");
  const terminal = {
    scope: "stock", key: "stale-claimant", requestHash: canonicalRequestHash({ quantity: 7 }),
    status: "completed" as const, responseStatus: 200, response: { schemaVersion: 1, value: { ok: true } },
    createdAt: firstClaim.record.entity.createdAt, completedAt: "2026-07-12T02:01:01.000Z", expiresAt: "2026-07-13T02:01:01.000Z"
  };
  assert.equal(repository.complete(terminal, { at: terminal.completedAt, expectedRevision: firstClaim.record.revision }).outcome, "stale");
  assert.equal(repository.complete(terminal, { at: terminal.completedAt, expectedRevision: nextClaim.record.revision }).outcome, "updated");
});

assert.throws(() => command("fault-after-business", { quantity: 8 }, "2026-07-12T03:00:00.000Z", (context) => {
  context.transaction.repositories.business.append("business-fault", "must rollback");
  throw new Error("fault after business");
}), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM business_events WHERE id='business-fault'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key='fault-after-business'")[0].count, 0);

assert.throws(() => command("completion", { quantity: 9 }, "2026-07-12T03:10:00.000Z", (context) => {
  context.transaction.repositories.business.append("business-completion-fault", "must rollback");
  return { status: 200, body: { ok: true } };
}, true), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM business_events WHERE id='business-completion-fault'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key='completion'")[0].count, 0);

database.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,expires_at,version,updated_at) VALUES ('cleanup','processing','hash','processing',?,?,0,?)", ["2026-07-01T00:00:00.000Z", "2026-07-01T00:01:00.000Z", "2026-07-01T00:00:00.000Z"]);
database.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,response_status,response_json,created_at,completed_at,expires_at,version,updated_at) VALUES ('cleanup','terminal','hash','completed',200,?,?,?, ?,0,?)", [JSON.stringify({ schemaVersion: 1, value: null }), "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:01.000Z", "2026-07-02T00:00:00.000Z", "2026-07-01T00:00:01.000Z"]);
database.transaction((connection) => assert.equal(createSqliteIdempotencyRepository(connection).deleteExpired("2026-07-03T00:00:00.000Z", createPageLimit(1)), 1));
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE scope='cleanup' AND key='processing'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE scope='cleanup' AND key='terminal'")[0].count, 0);

database.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,completed_at,version,updated_at) VALUES ('corrupt','terminal','hash','completed',?,?,0,?)", ["2026-07-12T00:00:00.000Z", "2026-07-12T00:00:01.000Z", "2026-07-12T00:00:01.000Z"]);
assert.throws(() => createSqliteIdempotencyRepository(database).find("corrupt", "terminal"), (error) => error instanceof RowMappingError && error.field === "response_status");
database.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,expires_at,version,updated_at) VALUES ('corrupt','timestamp','hash','processing',?,?,0,?)", ["2026-02-31T00:00:00.000Z", "2026-07-12T00:00:00.000Z", "2026-02-31T00:00:00.000Z"]);
assert.throws(() => createSqliteIdempotencyRepository(database).find("corrupt", "timestamp"), (error) => error instanceof RowMappingError && error.field === "created_at" && error.code === "TIMESTAMP");

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("idempotency tests passed");
