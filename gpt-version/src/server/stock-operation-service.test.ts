import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandActorResolver, type CommandMetadata } from "./command-context";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import { createSqliteStockCommandRepositories } from "./sqlite-stock-command-repositories";
import { StockOperationService, type StockCommandRepositories, type StockOperationCommand } from "./stock-operation-service";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-stock-service-"));
const database = openDatabase(path.join(directory, "stock.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin'),('seller','seller'),('super_admin','super_admin');
  INSERT INTO permissions(id,code) VALUES ('stock:move','stock:move');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','stock:move'),('seller','stock:move'),('super_admin','stock:move');
  INSERT INTO users(id,status) VALUES ('u-admin','active'),('u-seller','active'),('u-blocked','blocked');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin'),('u-seller','seller'),('u-blocked','admin');
  INSERT INTO locations(id,code,name,type,status) VALUES
    ('loc-a','A','A','warehouse','active'),('loc-b','B','B','counter','active'),('loc-archived','OLD','Old','other','archived');
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor) VALUES
    ('p-main','Main','шт','active',2,2000),
    ('p-new','New','кг','active',1,1000),
    ('p-archived','Archived','шт','archived',1,1000),
    ('p-deleted','Deleted','шт','deleted',1,1000),
    ('p-fault','Fault','шт','active',2,2000),
    ('p-wrong-create','Wrong create','шт','active',0,0),
    ('p-max','Max','кг','active',0,0);
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor,inventory_kind,package_mass_grams) VALUES
    ('p-weight','Weight packs','кг','active',0,0,'weight',500);
  INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES
    ('p-main','loc-a',3,3000,1),('p-main','loc-b',2,2000,1),('p-fault','loc-a',5,5000,1),
    ('p-max','loc-a',9000000000,9000000000000,1);
  INSERT INTO notification_preferences(user_id,channel,event_type,delivery_mode,version,updated_at) VALUES
    ('u-admin','webapp','stock.threshold','instant',0,'2026-07-12T00:00:00.000Z'),
    ('u-admin','telegram','stock.threshold','instant',0,'2026-07-12T00:00:00.000Z'),
    ('u-admin','webapp','stock.zero','instant',0,'2026-07-12T00:00:00.000Z'),
    ('u-admin','telegram','stock.zero','instant',0,'2026-07-12T00:00:00.000Z'),
    ('u-seller','telegram','stock.threshold','instant',0,'2026-07-12T00:00:00.000Z');
`);

const adminReference = Object.freeze({ session: "admin" });
const sellerReference = Object.freeze({ session: "seller" });
const blockedReference = Object.freeze({ session: "blocked" });
const actorResolver: CommandActorResolver = {
  resolve(reference, channel) {
    if (channel !== "web") throw new Error("bad channel");
    const userId = reference === adminReference ? "u-admin" : reference === sellerReference ? "u-seller" : reference === blockedReference ? "u-blocked" : undefined;
    if (!userId) throw new Error("untrusted");
    return { kind: "user", userId, authenticatedBy: "web_session" };
  }
};
let idSequence = 0;

function makeService(factory: (connection: DatabaseContext) => StockCommandRepositories = createSqliteStockCommandRepositories, prefix = "main") {
  return new StockOperationService(
    new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-12T06:00:00.000Z" }, actorResolver),
    {
      processingTimeoutMs: 60_000,
      idempotencyRetentionMs: 86_400_000,
      outboxMaxAttempts: 8,
      createId: (kind) => `${prefix}-${kind}-${++idSequence}`
    }
  );
}

const service = makeService();
function metadata(key: string, actorReference: unknown = adminReference): CommandMetadata {
  return { actorReference, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
function execute(key: string, input: StockOperationCommand, actorReference?: unknown) {
  return service.execute(metadata(key, actorReference), input);
}

const receipt: StockOperationCommand = { type: "receipt", productId: "p-new", toLocationId: "loc-a", quantity: 1.25, reason: "Поставка" };
assert.equal(execute("weight-fraction", { type: "receipt", productId: "p-weight", toLocationId: "loc-a", quantity: 0.5 }).status, 400);
assert.equal(execute("weight-pack", { type: "receipt", productId: "p-weight", toLocationId: "loc-a", quantity: 1 }).status, 201);
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id='p-weight'")[0].quantity_minor, 1000);
assert.equal(execute("seller-correction", { type: "correction", productId: "p-weight", toLocationId: "loc-a", quantity: 1 }, sellerReference).status, 403);
assert.equal(execute("seller-damage", { type: "write_off", productId: "p-weight", fromLocationId: "loc-a", quantity: 1, reason: "Брак" }, sellerReference).status, 201);
assert.deepEqual(execute("forbidden", receipt, sellerReference), { outcome: "rejected", status: 403, body: { code: "FORBIDDEN_OPERATION", message: "Продавец не может выполнять приход или корректировку" } });
assert.deepEqual(execute("blocked", receipt, blockedReference), { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } });
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key IN ('forbidden','blocked')")[0].count, 0);

const created = execute("receipt", receipt);
assert.equal(created.outcome, "executed");
assert.equal(created.status, 201);
assert.equal(database.query<{ quantity_minor: number; version: number }>("SELECT quantity_minor,version FROM stock_balances WHERE product_id='p-new' AND location_id='loc-a'")[0].quantity_minor, 1250);
assert.equal(database.query<{ version: number }>("SELECT version FROM stock_balances WHERE product_id='p-new' AND location_id='loc-a'")[0].version, 1);
assert.deepEqual(execute("receipt", { ...receipt }), { ...created, outcome: "replayed" });
assert.deepEqual(execute("receipt", { ...receipt, quantity: 1.5 }), { outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" });
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE idempotency_key='stock.operation:receipt'")[0].count, 1);

const sameLocation = execute("same-location", { type: "transfer", productId: "p-main", fromLocationId: "loc-a", toLocationId: "loc-a", quantity: 1 });
assert.equal(sameLocation.status, 400);
assert.equal(sameLocation.outcome, "executed");
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-main' AND location_id='loc-a'")[0].quantity_minor, 3000);

for (const [key, input, status] of [
  ["pieces-fraction", { type: "receipt", productId: "p-main", toLocationId: "loc-a", quantity: 1.5 }, 400],
  ["zero", { type: "receipt", productId: "p-main", toLocationId: "loc-a", quantity: 0 }, 400],
  ["deleted", { type: "receipt", productId: "p-deleted", toLocationId: "loc-a", quantity: 1 }, 404],
  ["archived-location", { type: "receipt", productId: "p-main", toLocationId: "loc-archived", quantity: 1 }, 404]
] as const) {
  const result = execute(key, input as StockOperationCommand);
  assert.equal(result.status, status);
}
assert.equal(execute("archived-product", { type: "receipt", productId: "p-archived", toLocationId: "loc-a", quantity: 1 }).status, 201);

const maxBefore = database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-max' AND location_id='loc-a'")[0].quantity_minor;
const maxOperationsBefore = database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations")[0].count;
const maxResult = execute("max-overflow", { type: "receipt", productId: "p-max", toLocationId: "loc-a", quantity: 0.001 });
assert.equal(maxResult.status, 409);
assert.equal("body" in maxResult && maxResult.body.code, "STOCK_LIMIT_EXCEEDED");
assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-max' AND location_id='loc-a'")[0].quantity_minor, maxBefore);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations")[0].count, maxOperationsBefore);
assert.deepEqual(database.query<{ status: string; response_status: number }>("SELECT status,response_status FROM idempotency_keys WHERE scope='stock.operation' AND key='max-overflow'"), [{ status: "failed", response_status: 409 }]);

const threshold = execute("threshold", { type: "write_off", productId: "p-main", fromLocationId: "loc-a", quantity: 3, reason: "Списание" });
assert.equal(threshold.status, 201);
assert.equal(threshold.outcome, "executed");
assert.equal("body" in threshold && threshold.body.eventType, "stock.threshold");
if (!("body" in threshold)) throw new Error("threshold response body required");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM webapp_notifications WHERE type='stock.threshold'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM outbox_messages WHERE type='stock.threshold'")[0].count, 1);
assert.deepEqual(database.query<{ request_id: string }>("SELECT request_id FROM audit_entries WHERE entity_id = ?", [String(threshold.body.id)]), [{ request_id: "http:threshold" }]);
const thresholdPayload = JSON.parse(database.query<{ payload_json: string }>("SELECT payload_json FROM outbox_messages WHERE type='stock.threshold'")[0].payload_json) as { value: { correlationId: string; before: number; after: number } };
assert.deepEqual({ correlationId: thresholdPayload.value.correlationId, before: thresholdPayload.value.before, after: thresholdPayload.value.after }, { correlationId: "http:threshold", before: 5, after: 2 });

const notificationsBeforeTransfer = database.query<{ count: number }>("SELECT count(*) AS count FROM webapp_notifications")[0].count;
assert.equal(execute("transfer", { type: "transfer", productId: "p-main", fromLocationId: "loc-b", toLocationId: "loc-a", quantity: 1 }).status, 201);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM webapp_notifications")[0].count, notificationsBeforeTransfer);
assert.equal(database.query<{ total: number }>("SELECT SUM(quantity_minor) AS total FROM stock_balances WHERE product_id='p-main'")[0].total, 2000);

assert.equal(execute("writeoff-a", { type: "write_off", productId: "p-main", fromLocationId: "loc-a", quantity: 1 }).status, 201);
const zeroEvent = execute("writeoff-b", { type: "write_off", productId: "p-main", fromLocationId: "loc-b", quantity: 1 });
assert.equal(zeroEvent.status, 201);
assert.equal("body" in zeroEvent && zeroEvent.body.eventType, "stock.zero");
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM webapp_notifications WHERE type='stock.zero' AND payload_json LIKE '%p-main%'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM outbox_messages WHERE type='stock.zero' AND payload_json LIKE '%p-main%'")[0].count, 1);

database.executeScript(`
  INSERT INTO users(id,status) VALUES ('u-default-manager','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-default-manager','admin');
  INSERT INTO products(id,official_name,unit,status,low_stock_threshold,low_stock_threshold_minor) VALUES ('p-default-alert','Default alert','шт','active',1,1000);
  INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES ('p-default-alert','loc-a',2,2000,0);
`);
assert.equal(execute("default-manager-alert", { type: "write_off", productId: "p-default-alert", fromLocationId: "loc-a", quantity: 1, reason: "Проверка" }).status, 201);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM webapp_notifications WHERE recipient_user_id='u-default-manager' AND type='stock.threshold'")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE recipient_user_id='u-default-manager' AND type='stock.threshold'")[0].count, 1);
const operationsBeforeInsufficient = database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations")[0].count;
assert.equal(execute("insufficient", { type: "write_off", productId: "p-main", fromLocationId: "loc-a", quantity: 1 }).status, 409);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations")[0].count, operationsBeforeInsufficient);

type FaultStage = "sum_balance" | "first_balance" | "second_balance" | "unchanged" | "wrong_create" | "operation" | "audit" | "notification" | "outbox" | "completion";
function faultFactory(stage: FaultStage) {
  return (connection: DatabaseContext): StockCommandRepositories => {
    const real = createSqliteStockCommandRepositories(connection);
    let balanceWrites = 0;
    return {
      ...real,
      stock: {
        ...real.stock,
        sumBalance(productId) {
          if (stage === "sum_balance") throw new Error(stage);
          return real.stock.sumBalance(productId);
        },
        saveBalance(balance, options) {
          if (stage === "unchanged") return { outcome: "unchanged", record: real.stock.findBalance(balance.productId, balance.locationId)! };
          if (stage === "wrong_create") return { outcome: "unchanged", record: { revision: "0", entity: balance } };
          const result = real.stock.saveBalance(balance, options);
          balanceWrites += 1;
          if ((stage === "first_balance" && balanceWrites === 1) || (stage === "second_balance" && balanceWrites === 2)) throw new Error(stage);
          return result;
        },
        appendOperation(operation, options) {
          const result = real.stock.appendOperation(operation, options);
          if (stage === "operation") throw new Error(stage);
          return result;
        }
      },
      audit: {
        append(entry, options) {
          const result = real.audit.append(entry, options);
          if (stage === "audit") throw new Error(stage);
          return result;
        }
      },
      notifications: {
        append(notification, options) {
          const result = real.notifications.append(notification, options);
          if (stage === "notification") throw new Error(stage);
          return result;
        }
      },
      outbox: {
        enqueue(message, options) {
          const result = real.outbox.enqueue(message, options);
          if (stage === "outbox") throw new Error(stage);
          return result;
        }
      },
      idempotency: stage === "completion" ? {
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

for (const stage of ["sum_balance", "first_balance", "operation", "audit", "notification", "outbox", "completion"] as const) {
  const key = `fault-${stage}`;
  const before = database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-fault' AND location_id='loc-a'")[0].quantity_minor;
  const countsBefore = database.query<{ operations: number; audits: number; notifications: number; outbox: number }>("SELECT (SELECT count(*) FROM stock_operations) operations, (SELECT count(*) FROM audit_entries) audits, (SELECT count(*) FROM webapp_notifications) notifications, (SELECT count(*) FROM outbox_messages) outbox")[0];
  const faultService = makeService(faultFactory(stage), stage);
  assert.throws(() => faultService.execute(metadata(key), { type: "write_off", productId: "p-fault", fromLocationId: "loc-a", quantity: 3 }), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.equal(database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-fault' AND location_id='loc-a'")[0].quantity_minor, before);
  assert.deepEqual(database.query("SELECT (SELECT count(*) FROM stock_operations) operations, (SELECT count(*) FROM audit_entries) audits, (SELECT count(*) FROM webapp_notifications) notifications, (SELECT count(*) FROM outbox_messages) outbox")[0], countsBefore);
  assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key=?", [key])[0].count, 0);
}

for (const stage of ["unchanged", "wrong_create"] as const) {
  const key = `fault-${stage}`;
  const productId = stage === "unchanged" ? "p-fault" : "p-wrong-create";
  const command: StockOperationCommand = stage === "unchanged"
    ? { type: "write_off", productId, fromLocationId: "loc-a", quantity: 1 }
    : { type: "receipt", productId, toLocationId: "loc-a", quantity: 1 };
  const faultService = makeService(faultFactory(stage), stage);
  assert.throws(() => faultService.execute(metadata(key), command), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM stock_operations WHERE idempotency_key=?", [`stock.operation:${key}`])[0].count, 0);
  assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key=?", [key])[0].count, 0);
}
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM stock_balances WHERE product_id='p-wrong-create' AND location_id='loc-a'")[0].count, 0);

const beforeA = database.query<{ quantity_minor: number }>("SELECT quantity_minor FROM stock_balances WHERE product_id='p-fault' AND location_id='loc-a'")[0].quantity_minor;
database.execute("INSERT INTO stock_balances(product_id,location_id,quantity,quantity_minor,version) VALUES ('p-fault','loc-b',1,1000,1)");
const beforeB = 1000;
const secondBalanceService = makeService(faultFactory("second_balance"), "second-balance");
assert.throws(() => secondBalanceService.execute(metadata("fault-second-balance"), { type: "transfer", productId: "p-fault", fromLocationId: "loc-a", toLocationId: "loc-b", quantity: 1 }), (error) => error instanceof DatabaseError);
assert.deepEqual(database.query<{ location_id: string; quantity_minor: number }>("SELECT location_id,quantity_minor FROM stock_balances WHERE product_id='p-fault' ORDER BY location_id"), [{ location_id: "loc-a", quantity_minor: beforeA }, { location_id: "loc-b", quantity_minor: beforeB }]);
assert.equal(database.query<{ count: number }>("SELECT count(*) AS count FROM idempotency_keys WHERE key='fault-second-balance'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("stock operation service tests passed");
