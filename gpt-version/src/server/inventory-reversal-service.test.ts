import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InventorySnapshotRow } from "../shared/types";
import { CommandExecutor, type CommandActorResolver, type CommandMetadata } from "./command-context";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import { InventoryService, ReversalService, type InventoryCommand } from "./inventory-reversal-service";
import { applyMigrations } from "./migrations";
import { createSqliteStockCommandRepositories } from "./sqlite-stock-command-repositories";
import type { StockCommandRepositories } from "./stock-operation-service";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-inventory-reversal-"));
const database = openDatabase(path.join(directory, "inventory-reversal.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin'),('seller','seller');
  INSERT INTO permissions(id,code) VALUES
    ('inventory:write','inventory:write'),('techlog:read','techlog:read');
  INSERT INTO role_permissions(role_id,permission_id) VALUES
    ('admin','inventory:write'),('admin','techlog:read');
  INSERT INTO users(id,status) VALUES ('u-admin','active'),('u-seller','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin'),('u-seller','seller');
  INSERT INTO locations(id,code,name,type,status) VALUES
    ('loc-a','A','A','warehouse','active'),('loc-b','B','B','counter','active'),
    ('loc-old','OLD','Old','other','archived');
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor) VALUES
    ('p-inventory','Inventory','шт','active',2,2000),
    ('p-unchanged','Unchanged','шт','active',0,0),
    ('p-fault-inventory','Fault inventory','шт','active',2,2000),
    ('p-receipt','Receipt','шт','active',0,0),
    ('p-writeoff','Writeoff','шт','active',0,0),
    ('p-transfer','Transfer','шт','active',0,0),
    ('p-inv-plus','Inventory plus','шт','active',0,0),
    ('p-inv-minus','Inventory minus','шт','active',0,0),
    ('p-insufficient','Insufficient','шт','active',0,0),
    ('p-fault-reversal','Fault reversal','шт','active',1,1000),
    ('p-target','Target','шт','active',0,0);
  INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES
    ('p-inventory','loc-a',4,4000,3),('p-inventory','loc-b',1,1000,7),
    ('p-unchanged','loc-a',2,2000,4),('p-fault-inventory','loc-a',4,4000,1),('p-fault-inventory','loc-b',1,1000,1),
    ('p-receipt','loc-a',5,5000,1),('p-writeoff','loc-a',3,3000,1),
    ('p-transfer','loc-a',3,3000,1),('p-transfer','loc-b',4,4000,1),
    ('p-inv-plus','loc-a',7,7000,1),('p-inv-minus','loc-a',3,3000,1),
    ('p-insufficient','loc-a',2,2000,1),('p-fault-reversal','loc-a',3,3000,1),
    ('p-target','loc-a',1,1000,1);
  INSERT INTO notification_preferences(user_id,channel,event_type,delivery_mode,version,updated_at) VALUES
    ('u-admin','webapp','stock.threshold','instant',0,'2026-07-12T06:00:00.000Z'),
    ('u-admin','telegram','stock.threshold','instant',0,'2026-07-12T06:00:00.000Z');
`);

const createdAt = "2026-07-12T05:00:00.000Z";
function seedOperation(input: Readonly<{
  id: string;
  type: "receipt" | "write_off" | "transfer" | "inventory_adjustment" | "reversal" | "merge";
  productId: string;
  quantity: number;
  from?: string;
  to?: string;
  reversed?: string;
  metadata?: Record<string, unknown>;
}>) {
  database.execute(
    `INSERT INTO stock_operations(
       id,type,product_id,from_location_id,to_location_id,quantity,quantity_minor,actor_id,reason,
       idempotency_key,reversed_operation_id,metadata_json,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [input.id, input.type, input.productId, input.from ?? null, input.to ?? null, input.quantity,
      input.quantity * 1000, "u-admin", `Seed ${input.id}`, `seed:${input.id}`, input.reversed ?? null,
      JSON.stringify({ schemaVersion: 1, value: input.metadata ?? {} }), createdAt]
  );
}

seedOperation({ id: "op-receipt", type: "receipt", productId: "p-receipt", quantity: 2, to: "loc-a" });
seedOperation({ id: "op-writeoff", type: "write_off", productId: "p-writeoff", quantity: 2, from: "loc-a" });
seedOperation({ id: "op-transfer", type: "transfer", productId: "p-transfer", quantity: 2, from: "loc-a", to: "loc-b" });
seedOperation({ id: "op-inv-plus", type: "inventory_adjustment", productId: "p-inv-plus", quantity: 2, to: "loc-a", metadata: { expected: 5, actual: 7, delta: 2 } });
seedOperation({ id: "op-inv-minus", type: "inventory_adjustment", productId: "p-inv-minus", quantity: 2, to: "loc-a", metadata: { expected: 5, actual: 3, delta: -2 } });
seedOperation({ id: "op-insufficient", type: "receipt", productId: "p-insufficient", quantity: 5, to: "loc-a" });
seedOperation({ id: "op-fault-reversal", type: "receipt", productId: "p-fault-reversal", quantity: 2, to: "loc-a" });
seedOperation({ id: "op-target-base", type: "receipt", productId: "p-target", quantity: 1, to: "loc-a" });
seedOperation({ id: "op-target-reversal", type: "reversal", productId: "p-target", quantity: 1, from: "loc-a", reversed: "op-target-base" });
seedOperation({ id: "op-target-merge", type: "merge", productId: "p-target", quantity: 1 });
seedOperation({ id: "op-corrupt-inventory-mismatch", type: "inventory_adjustment", productId: "p-target", quantity: 2, to: "loc-a", metadata: { expected: 2, actual: 1, delta: -1 } });
seedOperation({ id: "op-corrupt-inventory-delta", type: "inventory_adjustment", productId: "p-target", quantity: 1, to: "loc-a", metadata: { expected: 2, actual: 1, delta: 1 } });

const adminReference = Object.freeze({ session: "admin" });
const sellerReference = Object.freeze({ session: "seller" });
const actorResolver: CommandActorResolver = {
  resolve(reference, channel) {
    if (channel !== "web") throw new Error("bad channel");
    if (reference === adminReference) return { kind: "user", userId: "u-admin", authenticatedBy: "web_session" };
    if (reference === sellerReference) return { kind: "user", userId: "u-seller", authenticatedBy: "web_session" };
    throw new Error("untrusted actor");
  }
};

let idSequence = 0;
const options = (prefix: string) => ({
  processingTimeoutMs: 60_000,
  idempotencyRetentionMs: 86_400_000,
  outboxMaxAttempts: 8,
  createId: (kind: "operation" | "audit" | "notification" | "outbox") => `${prefix}-${kind}-${++idSequence}`
});
function executor(factory: (connection: DatabaseContext) => StockCommandRepositories = createSqliteStockCommandRepositories) {
  return new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-12T06:00:00.000Z" }, actorResolver);
}
function makeInventory(factory?: (connection: DatabaseContext) => StockCommandRepositories, prefix = "inventory") {
  return new InventoryService(executor(factory), options(prefix));
}
function makeReversal(factory?: (connection: DatabaseContext) => StockCommandRepositories, prefix = "reversal") {
  return new ReversalService(executor(factory), options(prefix));
}
function metadata(key: string, actorReference: unknown = adminReference): CommandMetadata {
  return { actorReference, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
function balance(productId: string, locationId: string) {
  return database.query<{ quantity_minor: number; version: number }>(
    "SELECT quantity_minor,version FROM stock_balances WHERE product_id=? AND location_id=?",
    [productId, locationId]
  )[0];
}
function counts() {
  return database.query<{ operations: number; audits: number; notifications: number; outbox: number; idempotency: number }>(
    `SELECT (SELECT count(*) FROM stock_operations) operations,
            (SELECT count(*) FROM audit_entries) audits,
            (SELECT count(*) FROM webapp_notifications) notifications,
            (SELECT count(*) FROM outbox_messages) outbox,
            (SELECT count(*) FROM idempotency_keys) idempotency`
  )[0];
}
function code(result: unknown) {
  return (result as { body?: { code?: string } }).body?.code;
}

const inventory = makeInventory();
const validRows: readonly InventorySnapshotRow[] = [
  { productId: "p-inventory", locationId: "loc-a", expected: 4, actual: 1, version: 3 },
  { productId: "p-inventory", locationId: "loc-b", expected: 1, actual: 0, version: 7 }
];

assert.deepEqual(inventory.execute(metadata("inventory-forbidden", sellerReference), { rows: validRows, comment: "Count" }), {
  outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" }
});
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='inventory-forbidden'")[0].count, 0);

const invalidBefore = { a: balance("p-inventory", "loc-a"), b: balance("p-inventory", "loc-b"), counts: counts() };
const duplicate = inventory.execute(metadata("inventory-duplicate"), {
  comment: "Duplicate",
  rows: [validRows[0], { ...validRows[0], actual: 2 }]
});
assert.equal(duplicate.status, 400);
assert.equal(code(duplicate), "BAD_INVENTORY_ROWS");
assert.deepEqual(balance("p-inventory", "loc-a"), invalidBefore.a);
assert.deepEqual(balance("p-inventory", "loc-b"), invalidBefore.b);
assert.equal(counts().operations, invalidBefore.counts.operations);
assert.equal(counts().audits, invalidBefore.counts.audits);

const missingActual = inventory.execute(metadata("inventory-invalid"), {
  comment: "Missing actual",
  rows: [{ productId: "p-inventory", locationId: "loc-a", expected: 4, version: 3 }]
});
assert.equal(missingActual.status, 400);
assert.equal(code(missingActual), "BAD_INVENTORY_ROWS");
assert.deepEqual(balance("p-inventory", "loc-a"), invalidBefore.a);

const stale = inventory.execute(metadata("inventory-stale"), {
  comment: "Stale all-row rollback",
  rows: [validRows[0], { ...validRows[1], version: 6 }]
});
assert.equal(stale.status, 409);
assert.equal(code(stale), "INVENTORY_CONFLICT");
assert.deepEqual(balance("p-inventory", "loc-a"), invalidBefore.a);
assert.deepEqual(balance("p-inventory", "loc-b"), invalidBefore.b);
assert.equal(counts().operations, invalidBefore.counts.operations);
assert.equal(counts().audits, invalidBefore.counts.audits);

const unchangedStale = inventory.execute(metadata("inventory-unchanged-stale"), {
  comment: "Validate unchanged rows",
  rows: [{ productId: "p-unchanged", locationId: "loc-a", expected: 2, actual: 2, version: 3 }]
});
assert.equal(unchangedStale.status, 409);
assert.equal(code(unchangedStale), "INVENTORY_CONFLICT");
assert.deepEqual(balance("p-unchanged", "loc-a"), { quantity_minor: 2000, version: 4 });

const applied = inventory.execute(metadata("inventory-apply"), { rows: validRows, comment: "  Full count  " });
assert.equal(applied.outcome, "executed");
assert.equal(applied.status, 201);
if (!("body" in applied) || !Array.isArray(applied.body.operations)) throw new Error("inventory operations response required");
assert.equal(applied.body.operations.length, 2);
assert.deepEqual(balance("p-inventory", "loc-a"), { quantity_minor: 1000, version: 4 });
assert.deepEqual(balance("p-inventory", "loc-b"), { quantity_minor: 0, version: 8 });
const inventoryOperations = database.query<{ id: string; reason: string; metadata_json: string }>(
  "SELECT id,reason,metadata_json FROM stock_operations WHERE type='inventory_adjustment' AND product_id='p-inventory' ORDER BY id"
);
assert.equal(inventoryOperations.length, 2);
assert.deepEqual(inventoryOperations.map((row) => {
  const metadataValue = (JSON.parse(row.metadata_json) as { value: Record<string, unknown> }).value;
  return { reason: row.reason, expected: metadataValue.expected, actual: metadataValue.actual, delta: metadataValue.delta, correlationId: metadataValue.correlationId };
}), [
  { reason: "Full count", expected: 4, actual: 1, delta: -3, correlationId: "http:inventory-apply" },
  { reason: "Full count", expected: 1, actual: 0, delta: -1, correlationId: "http:inventory-apply" }
]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM webapp_notifications WHERE type='stock.threshold'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE type='stock.threshold'")[0].count, 1);
const eventPayload = JSON.parse(database.query<{ payload_json: string }>("SELECT payload_json FROM outbox_messages WHERE type='stock.threshold'")[0].payload_json) as { value: Record<string, unknown> };
assert.deepEqual({ before: eventPayload.value.before, after: eventPayload.value.after, correlationId: eventPayload.value.correlationId }, {
  before: 5, after: 1, correlationId: "http:inventory-apply"
});
const inventoryAudit = database.query<{ changes_json: string; request_id: string }>(
  "SELECT changes_json,request_id FROM audit_entries WHERE entity_type='inventory' AND entity_id='inventory-apply'"
)[0];
assert.equal(inventoryAudit.request_id, "http:inventory-apply");
const inventoryChanges = (JSON.parse(inventoryAudit.changes_json) as { value: Record<string, unknown> }).value;
assert.deepEqual({ requestedCount: inventoryChanges.requestedCount, changedCount: inventoryChanges.changedCount, correlationId: inventoryChanges.correlationId }, {
  requestedCount: 2, changedCount: 2, correlationId: "http:inventory-apply"
});
assert.deepEqual(inventory.execute(metadata("inventory-apply"), { rows: validRows, comment: "  Full count  " }), { ...applied, outcome: "replayed" });
assert.deepEqual(inventory.execute(metadata("inventory-apply"), { rows: validRows, comment: "Changed" }), {
  outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
});
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM stock_operations WHERE type='inventory_adjustment' AND product_id='p-inventory'")[0].count, 2);

const reversal = makeReversal();
assert.deepEqual(reversal.execute(metadata("reversal-forbidden", sellerReference), "op-receipt"), {
  outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" }
});
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='reversal-forbidden'")[0].count, 0);

function reverseAndAssert(key: string, operationId: string, expected: readonly [string, string, number, number][]) {
  const result = reversal.execute(metadata(key), operationId);
  assert.equal(result.outcome, "executed");
  assert.equal(result.status, 201);
  for (const [productId, locationId, quantityMinor, version] of expected) {
    assert.deepEqual(balance(productId, locationId), { quantity_minor: quantityMinor, version });
  }
  const operation = database.query<{ id: string; reversed_operation_id: string; metadata_json: string }>(
    "SELECT id,reversed_operation_id,metadata_json FROM stock_operations WHERE reversed_operation_id=?",
    [operationId]
  )[0];
  assert.equal(operation.reversed_operation_id, operationId);
  assert.equal((JSON.parse(operation.metadata_json) as { value: { correlationId: string } }).value.correlationId, `http:${key}`);
  assert.deepEqual(database.query<{ request_id: string }>("SELECT request_id FROM audit_entries WHERE entity_id=?", [operation.id]), [{ request_id: `http:${key}` }]);
  return result;
}

const receiptReversal = reverseAndAssert("reverse-receipt", "op-receipt", [["p-receipt", "loc-a", 3000, 2]]);
assert.deepEqual(reversal.execute(metadata("reverse-receipt"), "op-receipt"), { ...receiptReversal, outcome: "replayed" });
assert.deepEqual(reversal.execute(metadata("reverse-receipt"), "op-writeoff"), {
  outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
});
const repeated = reversal.execute(metadata("reverse-receipt-again"), "op-receipt");
assert.equal(repeated.status, 409);
assert.equal(code(repeated), "ALREADY_REVERSED");

reverseAndAssert("reverse-writeoff", "op-writeoff", [["p-writeoff", "loc-a", 5000, 2]]);
reverseAndAssert("reverse-transfer", "op-transfer", [
  ["p-transfer", "loc-a", 5000, 2], ["p-transfer", "loc-b", 2000, 2]
]);
reverseAndAssert("reverse-inventory-plus", "op-inv-plus", [["p-inv-plus", "loc-a", 5000, 2]]);
reverseAndAssert("reverse-inventory-minus", "op-inv-minus", [["p-inv-minus", "loc-a", 5000, 2]]);

for (const [key, operationId, expectedCode] of [
  ["reject-reversal", "op-target-reversal", "BAD_REVERSAL_TARGET"],
  ["reject-merge", "op-target-merge", "BAD_REVERSAL_TARGET"],
  ["reject-insufficient", "op-insufficient", "NEGATIVE_STOCK_BLOCKED"],
  ["reject-corrupt-mismatch", "op-corrupt-inventory-mismatch", "BAD_REVERSAL_STATE"],
  ["reject-corrupt-delta", "op-corrupt-inventory-delta", "BAD_REVERSAL_STATE"]
] as const) {
  const before = counts();
  const result = reversal.execute(metadata(key), operationId);
  assert.equal(result.status, expectedCode === "BAD_REVERSAL_TARGET" ? 400 : 409);
  assert.equal(code(result), expectedCode);
  assert.equal(counts().operations, before.operations);
  assert.equal(counts().audits, before.audits);
}
assert.deepEqual(balance("p-insufficient", "loc-a"), { quantity_minor: 2000, version: 1 });

type FaultStage =
  | "inventory-balance" | "inventory-second-balance" | "inventory-operation" | "inventory-notification" | "inventory-outbox" | "inventory-audit" | "inventory-completion"
  | "reversal-balance" | "reversal-operation" | "reversal-notification" | "reversal-outbox" | "reversal-audit" | "reversal-completion";

function faultFactory(stage: FaultStage) {
  return (connection: DatabaseContext): StockCommandRepositories => {
    const real = createSqliteStockCommandRepositories(connection);
    let balanceWrites = 0;
    return {
      ...real,
      stock: {
        ...real.stock,
        saveBalance(next, writeOptions) {
          balanceWrites += 1;
          if (stage === "inventory-balance" || stage === "reversal-balance") {
            return { outcome: "unchanged", record: real.stock.findBalance(next.productId, next.locationId)! };
          }
          const result = real.stock.saveBalance(next, writeOptions);
          if (stage === "inventory-second-balance" && balanceWrites === 2) throw new Error(stage);
          return result;
        },
        appendOperation(operation, writeOptions) {
          const result = real.stock.appendOperation(operation, writeOptions);
          if ((stage === "inventory-operation" && operation.type === "inventory_adjustment")
            || (stage === "reversal-operation" && operation.type === "reversal")) throw new Error(stage);
          return result;
        }
      },
      notifications: {
        append(notification, writeOptions) {
          const result = real.notifications.append(notification, writeOptions);
          if (stage === "inventory-notification" || stage === "reversal-notification") throw new Error(stage);
          return result;
        }
      },
      outbox: {
        enqueue(message, writeOptions) {
          const result = real.outbox.enqueue(message, writeOptions);
          if (stage === "inventory-outbox" || stage === "reversal-outbox") throw new Error(stage);
          return result;
        }
      },
      audit: {
        append(entry, writeOptions) {
          const result = real.audit.append(entry, writeOptions);
          if ((stage === "inventory-audit" && entry.entity === "inventory")
            || (stage === "reversal-audit" && entry.action === "reverse")) throw new Error(stage);
          return result;
        }
      },
      idempotency: stage === "inventory-completion" || stage === "reversal-completion" ? {
        ...real.idempotency,
        find: real.idempotency.find.bind(real.idempotency),
        reserve: real.idempotency.reserve.bind(real.idempotency),
        complete(record) { return { outcome: "stale", current: real.idempotency.find(record.scope, record.key)! }; },
        fail: real.idempotency.fail.bind(real.idempotency),
        deleteExpired: real.idempotency.deleteExpired.bind(real.idempotency)
      } : real.idempotency
    };
  };
}

for (const stage of [
  "inventory-balance", "inventory-second-balance", "inventory-operation", "inventory-notification",
  "inventory-outbox", "inventory-audit", "inventory-completion"
] as const) {
  const key = `fault-${stage}`;
  const before = { a: balance("p-fault-inventory", "loc-a"), b: balance("p-fault-inventory", "loc-b"), counts: counts() };
  const rows: InventorySnapshotRow[] = stage === "inventory-second-balance"
    ? [
      { productId: "p-fault-inventory", locationId: "loc-a", expected: 4, actual: 1, version: 1 },
      { productId: "p-fault-inventory", locationId: "loc-b", expected: 1, actual: 0, version: 1 }
    ]
    : [{ productId: "p-fault-inventory", locationId: "loc-a", expected: 4, actual: 1, version: 1 }];
  assert.throws(() => makeInventory(faultFactory(stage), stage).execute(metadata(key), { comment: "Fault", rows }),
    (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.deepEqual(balance("p-fault-inventory", "loc-a"), before.a);
  assert.deepEqual(balance("p-fault-inventory", "loc-b"), before.b);
  assert.deepEqual(counts(), before.counts);
  assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key=?", [key])[0].count, 0);
}

for (const stage of [
  "reversal-balance", "reversal-operation", "reversal-notification", "reversal-outbox", "reversal-audit", "reversal-completion"
] as const) {
  const key = `fault-${stage}`;
  const before = { balance: balance("p-fault-reversal", "loc-a"), counts: counts() };
  assert.throws(() => makeReversal(faultFactory(stage), stage).execute(metadata(key), "op-fault-reversal"),
    (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.deepEqual(balance("p-fault-reversal", "loc-a"), before.balance);
  assert.deepEqual(counts(), before.counts);
  assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM stock_operations WHERE reversed_operation_id='op-fault-reversal'")[0].count, 0);
  assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key=?", [key])[0].count, 0);
}

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("inventory and reversal service tests passed");
