import { quantityFromMinor, quantityToMinor } from "../shared/quantity";
import type { Product } from "../shared/types";
import type { DatabaseContext } from "./database";
import type { InventorySession, InventorySessionRepositories, InventorySessionRow } from "./inventory-session-service";
import { stockOperationMapper } from "./mappers/catalog";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import { createAuditRepository, createProductsRepository, createRolesRepository } from "./sqlite-stock-command-repositories";

type Row = Readonly<Record<string, unknown>>;

function session(row: Row): InventorySession {
  return { id: String(row.id), status: row.status as InventorySession["status"], actorId: String(row.actor_id), comment: String(row.comment), startedAt: String(row.started_at), completedAt: row.completed_at === null ? undefined : String(row.completed_at), version: Number(row.version) };
}

export function createSqliteInventorySessionRepositories(database: DatabaseContext): InventorySessionRepositories {
  const products = createProductsRepository(database);
  return Object.freeze({
    roles: createRolesRepository(database),
    products: {
      findById: products.findById,
      listWeight() {
        return database.query<Row>("SELECT id FROM products WHERE inventory_kind='weight' AND status='active' ORDER BY official_name COLLATE NOCASE,id")
          .map((row) => products.findById(String(row.id))?.entity)
          .filter((value): value is Product => Boolean(value));
      }
    },
    sessions: {
      findOpen() {
        const row = database.query<Row>("SELECT * FROM inventory_sessions WHERE status IN ('active','closing') ORDER BY started_at,id LIMIT 1")[0];
        return row ? session(row) : undefined;
      },
      findById(id) {
        const row = database.query<Row>("SELECT * FROM inventory_sessions WHERE id=?", [id])[0];
        return row ? session(row) : undefined;
      },
      create(value, rows, at) {
        const inserted = database.execute("INSERT INTO inventory_sessions(id,status,actor_id,comment,started_at,completed_at,version,updated_at) VALUES (?,?,?,?,?,?,0,?) ON CONFLICT DO NOTHING", [value.id, value.status, value.actorId, value.comment, value.startedAt, value.completedAt ?? null, at]);
        if (inserted.changes !== 1) return false;
        for (const row of rows) database.execute("INSERT INTO inventory_session_rows(session_id,product_id,expected_quantity_minor,actual_quantity_minor,version,updated_at) VALUES (?,?,?,NULL,0,?)", [row.sessionId, row.productId, quantityToMinor(row.expected, "шт"), at]);
        return true;
      },
      rows(sessionId) {
        return database.query<Row>("SELECT * FROM inventory_session_rows WHERE session_id=? ORDER BY product_id", [sessionId]).map((row): InventorySessionRow => ({ sessionId: String(row.session_id), productId: String(row.product_id), expected: quantityFromMinor(Number(row.expected_quantity_minor)), actual: row.actual_quantity_minor === null ? undefined : quantityFromMinor(Number(row.actual_quantity_minor)), version: Number(row.version) }));
      },
      save(value, expectedVersion, at) {
        return database.execute("UPDATE inventory_sessions SET status=?,comment=?,completed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?", [value.status, value.comment, value.completedAt ?? null, at, value.id, expectedVersion]).changes === 1;
      },
      saveActual(sessionId, productId, actual, expectedVersion, at) {
        return database.execute("UPDATE inventory_session_rows SET actual_quantity_minor=?,version=version+1,updated_at=? WHERE session_id=? AND product_id=? AND version=?", [quantityToMinor(actual, "шт"), at, sessionId, productId, expectedVersion]).changes === 1;
      }
    },
    totals: {
      find(productId) {
        const row = database.query<Row>("SELECT * FROM inventory_balances WHERE product_id=?", [productId])[0];
        return row ? { quantity: quantityFromMinor(Number(row.quantity_minor)), version: Number(row.version) } : undefined;
      },
      save(productId, quantity, expectedVersion, at) {
        return database.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [quantityToMinor(quantity, "шт"), at, productId, expectedVersion]).changes === 1;
      }
    },
    ledger: {
      appendOperation(operation) {
        const product = products.findById(operation.productId)?.entity;
        if (!product) return false;
        const row = stockOperationMapper.toRow(operation, product.inventoryKind === "weight" ? "шт" : product.unit);
        const columns = ["id","type","product_id","from_location_id","to_location_id","quantity","quantity_minor","actor_id","reason","idempotency_key","reversed_operation_id","metadata_json","created_at"] as const;
        return database.execute(`INSERT INTO stock_operations(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`, columns.map((column) => row[column] as never)).changes === 1;
      },
      appendConsumption(value) {
        return database.execute("INSERT INTO consumption_records(id,product_id,quantity_minor,source,inventory_session_id,stock_operation_id,actor_id,comment,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [value.id, value.productId, quantityToMinor(value.quantity, "шт"), value.source, value.inventorySessionId ?? null, value.stockOperationId, value.actorId, value.comment, value.createdAt]).changes === 1;
      }
    },
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}
