import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseError, openDatabase } from "./database";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-database-"));
const file = path.join(directory, "database.sqlite");
const database = openDatabase(file);
database.executeScript("CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT NOT NULL);");
const inserted = database.execute("INSERT INTO entries(value) VALUES (?)", ["first"]);
assert.equal(inserted.changes, 1);
assert.deepEqual(database.query<{ value: string }>("SELECT value FROM entries ORDER BY id"), [{ value: "first" }]);

const transactionHandle = database.transaction((transaction) => {
  transaction.execute("INSERT INTO entries(value) VALUES (?)", ["committed"]);
  assert.equal(transaction.query<{ count: number }>("SELECT count(*) AS count FROM entries")[0].count, 2);
  return "committed";
});
assert.equal(transactionHandle, "committed");
assert.equal(database.transaction((transaction) => {
  transaction.execute("INSERT INTO entries(value) VALUES (?)", ["immediate"]);
  return "immediate";
}, { mode: "immediate" }), "immediate");

assert.throws(() => database.transaction((transaction) => {
  transaction.execute("INSERT INTO entries(value) VALUES (?)", ["rolled-back"]);
  throw new Error("fault injection");
}), (error) => error instanceof DatabaseError && error.operation === "transaction");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM entries")[0].count, 3);
assert.throws(() => database.transaction(() => Promise.resolve("invalid")) as unknown, (error) => error instanceof DatabaseError && error.code === "ASYNC_TRANSACTION_FORBIDDEN");

const secret = "DO_NOT_LEAK_SQL_OR_PARAMS";
assert.throws(() => database.query(`SELECT missing_${secret} FROM nowhere`, [secret]), (error) => {
  assert.ok(error instanceof DatabaseError);
  assert.equal(error.operation, "query");
  assert.equal(error.message.includes(secret), false);
  assert.equal(error.cause, undefined);
  assert.equal(JSON.stringify(error).includes(secret), false);
  return true;
});
database.close();
database.close();
assert.throws(() => database.query("SELECT 1"), (error) => error instanceof DatabaseError && error.code === "DATABASE_CLOSED");
assert.equal(fs.existsSync(file), true);
console.log("database tests passed");
