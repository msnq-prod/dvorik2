import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import { UnitOfWork, type UnitOfWorkContext } from "./unit-of-work";

type TestRepositories = ReturnType<typeof createRepositories>;

function createRepositories(database: DatabaseContext) {
  const insert = (table: "business_rows" | "audit_rows" | "idempotency_rows" | "outbox_rows", id: string) =>
    database.execute(`INSERT INTO ${table}(id) VALUES (?)`, [id]);
  return {
    insertBusiness: (id: string) => insert("business_rows", id),
    insertAudit: (id: string) => insert("audit_rows", id),
    insertIdempotency: (id: string) => insert("idempotency_rows", id),
    insertOutbox: (id: string) => insert("outbox_rows", id)
  };
}

function nestedAuditService(context: UnitOfWorkContext<TestRepositories>, id: string) {
  context.repositories.insertAudit(id);
}

function countRows(database: DatabaseContext) {
  return ["business_rows", "audit_rows", "idempotency_rows", "outbox_rows"].map((table) =>
    database.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`)[0].count
  );
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-uow-"));
const file = path.join(directory, "uow.sqlite");
const database = openDatabase(file);
database.executeScript(`
  CREATE TABLE business_rows(id TEXT PRIMARY KEY);
  CREATE TABLE audit_rows(id TEXT PRIMARY KEY);
  CREATE TABLE idempotency_rows(id TEXT PRIMARY KEY);
  CREATE TABLE outbox_rows(id TEXT PRIMARY KEY);
`);
const observer = openDatabase(file, { fileMustExist: true });
const unitOfWork = new UnitOfWork(database, createRepositories);

for (let faultAfter = 0; faultAfter < 4; faultAfter += 1) {
  assert.throws(() => unitOfWork.transaction((context) => {
    context.repositories.insertBusiness(`fault-${faultAfter}`);
    assert.deepEqual(countRows(observer), [0, 0, 0, 0]);
    if (faultAfter === 0) throw new Error("fault after business");
    nestedAuditService(context, `fault-${faultAfter}`);
    if (faultAfter === 1) throw new Error("fault after audit");
    context.repositories.insertIdempotency(`fault-${faultAfter}`);
    if (faultAfter === 2) throw new Error("fault after idempotency");
    context.repositories.insertOutbox(`fault-${faultAfter}`);
    if (faultAfter === 3) throw new Error("fault after outbox");
  }), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.deepEqual(countRows(database), [0, 0, 0, 0]);
  assert.deepEqual(countRows(observer), [0, 0, 0, 0]);
}

unitOfWork.transaction((context) => {
  context.repositories.insertBusiness("committed");
  nestedAuditService(context, "committed");
  context.repositories.insertIdempotency("committed");
  context.repositories.insertOutbox("committed");
});
assert.deepEqual(countRows(database), [1, 1, 1, 1]);
assert.deepEqual(countRows(observer), [1, 1, 1, 1]);

assert.throws(() => unitOfWork.transaction((context) => {
  context.repositories.insertBusiness("nested");
  unitOfWork.transaction(() => undefined);
}), (error) => error instanceof DatabaseError && error.code === "NESTED_TRANSACTION_FORBIDDEN");
assert.deepEqual(countRows(database), [1, 1, 1, 1]);

assert.throws(() => database.transaction(() => database.transaction(() => undefined)),
  (error) => error instanceof DatabaseError && error.code === "NESTED_TRANSACTION_FORBIDDEN");
assert.throws(() => unitOfWork.transaction((context) => {
  context.repositories.insertBusiness("manual-commit");
  context.database.execute("/* no escape */ COMMIT");
}), (error) => error instanceof DatabaseError && error.code === "TRANSACTION_CONTROL_FORBIDDEN");
for (const sql of ["; COMMIT", "/* no escape */;COMMIT", ";; -- empty\n ; RELEASE forbidden"]) {
  assert.throws(() => unitOfWork.transaction((context) => {
    context.repositories.insertBusiness(`escape-${sql.length}`);
    context.database.execute(sql);
  }), (error) => error instanceof DatabaseError && error.code === "TRANSACTION_CONTROL_FORBIDDEN");
}
assert.throws(() => unitOfWork.transaction((context) => context.database.execute("SAVEPOINT forbidden")),
  (error) => error instanceof DatabaseError && error.code === "TRANSACTION_CONTROL_FORBIDDEN");
assert.throws(() => database.transaction((context) => {
  context.execute("INSERT INTO business_rows(id) VALUES (?)", ["script-commit"]);
  database.executeScript("COMMIT");
}), (error) => error instanceof DatabaseError && error.code === "SCRIPT_DURING_TRANSACTION_FORBIDDEN");
assert.deepEqual(countRows(database), [1, 1, 1, 1]);
assert.throws(() => unitOfWork.transaction(() => Promise.resolve("invalid")) as unknown,
  (error) => error instanceof DatabaseError && error.code === "ASYNC_TRANSACTION_FORBIDDEN");
const unhandledRejections: unknown[] = [];
const captureUnhandled = (reason: unknown) => { unhandledRejections.push(reason); };
process.on("unhandledRejection", captureUnhandled);
assert.throws(() => unitOfWork.transaction(async (context) => {
  context.repositories.insertBusiness("async-before-await");
  await Promise.resolve();
  context.repositories.insertAudit("async-after-await");
}) as unknown, (error) => error instanceof DatabaseError && error.code === "ASYNC_TRANSACTION_FORBIDDEN");
await new Promise<void>((resolve) => setImmediate(resolve));
process.off("unhandledRejection", captureUnhandled);
assert.deepEqual(unhandledRejections, []);
assert.deepEqual(countRows(database), [1, 1, 1, 1]);
assert.deepEqual(unitOfWork.transaction(() => ({ then: 7, value: "sync" })), { then: 7, value: "sync" });

let escaped: UnitOfWorkContext<TestRepositories> | undefined;
unitOfWork.transaction((context) => { escaped = context; });
assert.throws(() => escaped?.repositories.insertBusiness("escaped"),
  (error) => error instanceof DatabaseError && error.code === "TRANSACTION_CONTEXT_CLOSED");
assert.deepEqual(countRows(database), [1, 1, 1, 1]);

observer.close();
database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("unit of work tests passed");
