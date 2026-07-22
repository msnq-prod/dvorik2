import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandContextError, CommandExecutor, type CommandActorResolver, type CommandContext, type CommandMetadata } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-command-context-"));
const database = openDatabase(path.join(directory, "commands.sqlite"));
database.executeScript("CREATE TABLE audit(correlation_id TEXT NOT NULL, actor TEXT NOT NULL, occurred_at TEXT NOT NULL); CREATE TABLE outbox(correlation_id TEXT NOT NULL, channel TEXT NOT NULL);");

function repositories(connection: DatabaseContext) {
  return {
    audit: (correlationId: string, actor: string, at: string) => connection.execute("INSERT INTO audit VALUES (?, ?, ?)", [correlationId, actor, at]),
    outbox: (correlationId: string, channel: string) => connection.execute("INSERT INTO outbox VALUES (?, ?)", [correlationId, channel])
  };
}

type TestRepositories = ReturnType<typeof repositories>;
const actors = Object.freeze({
  webAdmin: Object.freeze({ kind: "user", userId: "u-admin", authenticatedBy: "web_session" }),
  telegramSeller: Object.freeze({ kind: "user", userId: "u-seller", authenticatedBy: "telegram_update" }),
  worker: Object.freeze({ kind: "system", service: "outbox-worker", authenticatedBy: "worker_registry" })
});
const webSession = Object.freeze({ verifiedSession: "session-1" });
const telegramUpdate = Object.freeze({ verifiedUpdate: 100 });
const workerRegistration = Object.freeze({ registration: "outbox-worker" });
const actorResolver: CommandActorResolver = {
  resolve(reference, channel) {
    if (channel === "web" && reference === webSession) return actors.webAdmin;
    if (channel === "telegram" && reference === telegramUpdate) return actors.telegramSeller;
    if (channel === "worker" && reference === workerRegistration) return actors.worker;
    throw new Error("untrusted actor reference");
  }
};
const executor = new CommandExecutor(new UnitOfWork(database, repositories), { now: () => "2026-07-12T03:04:05.000Z" }, actorResolver);

function nestedService(context: CommandContext<TestRepositories>) {
  const actor = context.actor.kind === "user" ? context.actor.userId : context.actor.service;
  context.transaction.repositories.audit(context.correlationId, actor, context.clock.now());
  context.transaction.repositories.outbox(context.correlationId, context.channel);
  assert.equal("database" in context.transaction, false);
}

const web: CommandMetadata = { actorReference: webSession, requestId: "http:req-1", channel: "web", idempotencyKey: "stock:key-1" };
executor.execute(web, (context) => {
  assert.equal(context.requestId, "http:req-1");
  assert.equal(context.correlationId, context.requestId);
  assert.equal(context.idempotencyKey, "stock:key-1");
  assert.equal(context.clock.now(), "2026-07-12T03:04:05.000Z");
  nestedService(context);
});
assert.deepEqual(database.query("SELECT correlation_id, actor, occurred_at FROM audit"), [{ correlation_id: "http:req-1", actor: "u-admin", occurred_at: "2026-07-12T03:04:05.000Z" }]);
assert.deepEqual(database.query("SELECT correlation_id, channel FROM outbox"), [{ correlation_id: "http:req-1", channel: "web" }]);

for (const metadata of [
  { actorReference: telegramUpdate, requestId: "telegram:100", channel: "telegram", idempotencyKey: "update:100" },
  { actorReference: workerRegistration, requestId: "worker:delivery-1", channel: "worker", idempotencyKey: "delivery:1" }
] as const) executor.execute(metadata, (context) => context.channel);

assert.throws(() => executor.execute({ ...web, requestId: " arbitrary header " }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_REQUEST_ID");
assert.throws(() => executor.execute({ ...web, idempotencyKey: "" }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_IDEMPOTENCY_KEY");
assert.throws(() => executor.execute({ ...web, channel: "cron" as never }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_CHANNEL");
assert.throws(() => executor.execute({ ...web, actorReference: "u-admin-from-header" }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_ACTOR");
assert.throws(() => executor.execute({ ...web, actorReference: workerRegistration }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_ACTOR");
assert.throws(() => executor.execute({ ...web, actorReference: telegramUpdate }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_ACTOR");

for (const [resolved, channel] of [
  [{ kind: "user", userId: "", authenticatedBy: "web_session" }, "web"],
  [{ kind: "system", service: "outbox-worker", authenticatedBy: "worker_registry" }, "web"],
  [{ kind: "user", userId: "u-admin", authenticatedBy: "web_session" }, "worker"]
] as const) {
  const invalidActorExecutor = new CommandExecutor(new UnitOfWork(database, repositories), { now: () => "2026-07-12T03:04:05.000Z" }, { resolve: () => resolved });
  assert.throws(() => invalidActorExecutor.execute({ ...web, channel }, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_ACTOR");
}

assert.throws(() => executor.execute({ ...web, requestId: "http:rollback" }, (context) => {
  nestedService(context);
  throw new Error("fault after audit/outbox");
}));
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM audit WHERE correlation_id = ?", ["http:rollback"])[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM outbox WHERE correlation_id = ?", ["http:rollback"])[0].count, 0);

let escapedContext: CommandContext<TestRepositories> | undefined;
executor.execute({ ...web, requestId: "http:escape" }, (context) => { escapedContext = context; });
assert.throws(() => escapedContext && nestedService(escapedContext));
assert.throws(() => executor.execute({ ...web, requestId: "http:async" }, async (context) => {
  nestedService(context);
  await Promise.resolve();
  nestedService(context);
}));

const movingTimes = ["2026-07-12T03:04:05.000Z", "2026-07-12T03:04:06.000Z", "2026-07-12T03:04:07.000Z"];
const movingClockExecutor = new CommandExecutor(
  new UnitOfWork(database, repositories),
  { now: () => movingTimes.shift() ?? "2026-07-12T03:04:08.000Z" },
  actorResolver
);
movingClockExecutor.execute({ ...web, requestId: "http:moving-clock" }, (context) => {
  assert.equal(context.clock.now(), "2026-07-12T03:04:06.000Z");
  assert.equal(context.clock.now(), "2026-07-12T03:04:07.000Z");
});

for (const invalidUtc of ["2026-07-12 03:04:05", "2026-02-31T03:04:05.000Z", "2026-04-31T03:04:05Z"]) {
  const badClockExecutor = new CommandExecutor(new UnitOfWork(database, repositories), { now: () => invalidUtc }, actorResolver);
  assert.throws(() => badClockExecutor.execute(web, () => undefined), (error) => error instanceof CommandContextError && error.code === "BAD_CLOCK");
}

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("command context tests passed");
