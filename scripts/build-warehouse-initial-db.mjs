import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

const seedPath = path.resolve("data/warehouse-initial-seed.json");
// This is a standalone Warehouse database. It does not share the legacy Core DB.
const configuredDatabasePath = process.env.DVORIK_WAREHOUSE_SQLITE_FILE?.trim();
const databasePath = configuredDatabasePath || path.resolve("data/warehouse.sqlite");
if (!path.isAbsolute(databasePath)) throw new Error("DVORIK_WAREHOUSE_SQLITE_FILE must be an absolute path when provided");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
if (fs.existsSync(databasePath)) fs.rmSync(databasePath);
const db = new BetterSqlite3(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations VALUES (1, datetime('now'));
CREATE TABLE warehouse_seed_metadata(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE warehouse_assumptions(
  id INTEGER PRIMARY KEY,
  description TEXT NOT NULL
);
CREATE TABLE users(
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL
);
CREATE TABLE warehouse_idempotency_keys(
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scope,key)
);
CREATE TABLE suppliers(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  inn TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE products(
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,
  local_name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  status TEXT NOT NULL,
  group_id TEXT,
  inventory_kind TEXT NOT NULL CHECK(inventory_kind IN ('piece','weight')),
  package_mass_grams INTEGER,
  article TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE supplies(
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  invoice_number TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  status TEXT NOT NULL,
  accepted_by_user_id TEXT NOT NULL REFERENCES users(id),
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(supplier_id,invoice_number)
);
CREATE TABLE supply_lines(
  id TEXT PRIMARY KEY,
  supply_id TEXT NOT NULL REFERENCES supplies(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  package_count INTEGER NOT NULL,
  package_mass_grams INTEGER,
  purchase_cost_kopecks INTEGER NOT NULL,
  allocated_delivery_cost_kopecks INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(supply_id,product_id)
);
CREATE TABLE inventory_lots(
  id TEXT PRIMARY KEY,
  supply_line_id TEXT NOT NULL UNIQUE REFERENCES supply_lines(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  received_package_milli INTEGER NOT NULL,
  remaining_package_milli INTEGER NOT NULL,
  package_mass_grams INTEGER,
  total_cost_kopecks INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX inventory_lots_fifo_idx ON inventory_lots(product_id,received_at,id);
CREATE TABLE fifo_allocations(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  lot_id TEXT NOT NULL REFERENCES inventory_lots(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity_package_milli INTEGER NOT NULL,
  cost_kopecks INTEGER NOT NULL,
  direction TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE inventory_balances(
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  quantity_minor INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE estimated_consumption(
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  lot_id TEXT NOT NULL REFERENCES inventory_lots(id),
  quantity_packages INTEGER NOT NULL,
  recognized_cost_kopecks INTEGER NOT NULL,
  basis TEXT NOT NULL,
  estimated_at TEXT NOT NULL
);
CREATE TABLE integration_inbox(
  event_id TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  result_code TEXT,
  received_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE domain_outbox(
  event_id TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error_code TEXT
);
CREATE TABLE product_profitability_projection(
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  estimated_sale_price_kopecks INTEGER,
  estimated_cost_per_package_kopecks INTEGER,
  actual_revenue_kopecks INTEGER NOT NULL DEFAULT 0,
  actual_cost_kopecks INTEGER NOT NULL DEFAULT 0,
  actual_completeness TEXT NOT NULL DEFAULT 'unavailable',
  source_updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE product_price_history(
  id TEXT PRIMARY KEY,
  group_id TEXT,
  product_id TEXT,
  price_kopecks INTEGER NOT NULL,
  price_unit TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const now = seed.generatedAt;
const rubToKopecks = (value) => Math.round(Number(value) * 100);
const insertMetadata = db.prepare("INSERT INTO warehouse_seed_metadata(key,value) VALUES (?,?)");
for (const [key, value] of Object.entries({
  schemaVersion: String(seed.schemaVersion),
  generatedAt: seed.generatedAt,
  asOfDate: seed.asOfDate,
  estimationMode: "upper_bound_by_product",
  sourceDocuments: "20549/2026-07-06;20953/2026-07-10;22566/2026-07-20",
})) insertMetadata.run(key, value);
const insertAssumption = db.prepare("INSERT INTO warehouse_assumptions(id,description) VALUES (?,?)");
seed.assumptions.forEach((description, index) => insertAssumption.run(index + 1, description));
db.prepare("INSERT INTO users(id,status) VALUES ('system-invoice-import','active')").run();
db.prepare("INSERT INTO suppliers(id,name,inn,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
  .run(seed.supplier.id, seed.supplier.name, seed.supplier.inn, "active", now, now);

const productByCode = new Map(seed.products.map((product) => [product.code, product]));
const insertProduct = db.prepare(`INSERT INTO products(id,official_name,local_name,unit,status,inventory_kind,package_mass_grams,article,created_at,updated_at)
  VALUES (?,?,?,?,'active',?,?,?,?,?)`);
for (const product of seed.products) {
  insertProduct.run(product.code, product.name, product.localName || product.name, product.inventoryKind === "weight" ? "кг" : "шт",
    product.inventoryKind, product.packageMassGrams, product.code, now, now);
}

const insertSupply = db.prepare(`INSERT INTO supplies(id,supplier_id,invoice_number,delivered_at,status,accepted_by_user_id,accepted_at,created_at,updated_at)
  VALUES (?,'gordeeva-ip',?,?,'accepted','system-invoice-import',?,?,?)`);
for (const invoice of seed.invoices) {
  insertSupply.run(`invoice-${invoice.invoiceNumber}`, invoice.invoiceNumber, invoice.deliveredAt, invoice.deliveredAt, now, now);
}

const insertLine = db.prepare(`INSERT INTO supply_lines(id,supply_id,product_id,package_count,package_mass_grams,purchase_cost_kopecks,allocated_delivery_cost_kopecks,created_at)
  VALUES (?,?,?,?,?,?,?,?)`);
const insertLot = db.prepare(`INSERT INTO inventory_lots(id,supply_line_id,product_id,received_package_milli,remaining_package_milli,package_mass_grams,total_cost_kopecks,received_at,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
for (const lot of seed.lots) {
  const lineId = `line-${lot.invoiceNumber}-${lot.productCode}`;
  insertLine.run(lineId, `invoice-${lot.invoiceNumber}`, lot.productCode, lot.receivedPackages, lot.packageMassGrams,
    rubToKopecks(lot.purchaseCostRub), rubToKopecks(lot.allocatedDeliveryRub), now);
  insertLot.run(lot.lotId, lineId, lot.productCode, lot.receivedPackages * 1000, lot.remainingPackages * 1000,
    lot.packageMassGrams, rubToKopecks(lot.landedCostRub), lot.deliveredAt, now, now);
}

const insertConsumption = db.prepare(`INSERT INTO estimated_consumption(id,product_id,lot_id,quantity_packages,recognized_cost_kopecks,basis,estimated_at)
  VALUES (?,?,?,?,?,?,?)`);
const insertAllocation = db.prepare(`INSERT INTO fifo_allocations(id,event_id,lot_id,product_id,quantity_package_milli,cost_kopecks,direction,external_reference,created_at)
  VALUES (?,?,?,?,?,?,'consume','estimated-opening-reconstruction',?)`);
for (const item of seed.estimatedConsumption) {
  const id = `estimated-consumption-${item.lotId}`;
  insertConsumption.run(id, item.productCode, item.lotId, item.estimatedConsumedPackages,
    rubToKopecks(item.recognizedCostRub), item.basis, seed.asOfDate);
  insertAllocation.run(`fifo-${id}`, id, item.lotId, item.productCode, item.estimatedConsumedPackages * 1000,
    rubToKopecks(item.recognizedCostRub), seed.asOfDate);
}

const insertBalance = db.prepare("INSERT INTO inventory_balances(product_id,quantity_minor,updated_at) VALUES (?,?,?)");
const insertProjection = db.prepare(`INSERT INTO product_profitability_projection(product_id,estimated_cost_per_package_kopecks,actual_completeness,source_updated_at)
  VALUES (?,?,'unavailable',?)`);
const insertCompanyProjectionEvent = db.prepare(`INSERT INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
  VALUES (?,'warehouse','ProductProfitabilityUpdated',1,?,?,'pending',?,?)`);
for (const product of seed.products) {
  const quantityMinor = product.inventoryKind === "weight"
    ? product.estimatedRemainingPackages * product.packageMassGrams
    : product.estimatedRemainingPackages * 1000;
  insertBalance.run(product.code, quantityMinor, seed.asOfDate);
  const remainingLots = seed.lots.filter((lot) => lot.productCode === product.code && lot.remainingPackages > 0);
  const remainingPackages = remainingLots.reduce((sum, lot) => sum + lot.remainingPackages, 0);
  const remainingCost = remainingLots.reduce((sum, lot) => sum + lot.remainingPackages * lot.landedCostRub / lot.receivedPackages, 0);
  insertProjection.run(product.code, remainingPackages ? rubToKopecks(remainingCost / remainingPackages) : null, seed.asOfDate);
  if (product.estimatedRemainingPackages > 0) {
    const payload = JSON.stringify({ productId: product.code, actualRevenueKopecks: 0, actualCostKopecks: 0, completeness: "unavailable", sourceUpdatedAt: seed.asOfDate });
    insertCompanyProjectionEvent.run(`warehouse-opening-profitability-${product.code}`, product.code, payload, seed.asOfDate, seed.asOfDate);
  }
}

const lotBalanceErrors = db.prepare(`SELECT p.id FROM products p
  JOIN inventory_balances b ON b.product_id=p.id
  WHERE b.quantity_minor <> COALESCE((SELECT SUM(CASE WHEN p.inventory_kind='weight'
    THEN l.remaining_package_milli*l.package_mass_grams/1000 ELSE l.remaining_package_milli END)
    FROM inventory_lots l WHERE l.product_id=p.id),0)`).all();
if (lotBalanceErrors.length) throw new Error(`FIFO reconciliation failed for ${lotBalanceErrors.length} products`);
if (db.pragma("foreign_key_check").length) throw new Error("Foreign key check failed");
db.pragma("wal_checkpoint(TRUNCATE)");
const summary = {
  databasePath,
  products: db.prepare("SELECT count(*) count FROM products").get().count,
  supplies: db.prepare("SELECT count(*) count FROM supplies").get().count,
  lots: db.prepare("SELECT count(*) count FROM inventory_lots").get().count,
  remainingPackages: db.prepare("SELECT sum(remaining_package_milli)/1000 total FROM inventory_lots").get().total,
  estimatedConsumedPackages: db.prepare("SELECT sum(quantity_packages) total FROM estimated_consumption").get().total,
};
db.close();
console.log(JSON.stringify(summary));
