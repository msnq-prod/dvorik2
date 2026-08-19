import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const corePath = path.join(root, "data/dvorik.sqlite");
const warehousePath = path.join(root, "data/warehouse.sqlite");
const statePath = path.join(root, "data/dvorik-state.json");
const backupDir = path.join(root, "backups");
const createdAt = new Date().toISOString();
const backupPath = path.join(backupDir, `dvorik-before-warehouse-mock-${createdAt.replaceAll(":", "-").replaceAll(".", "-")}.sqlite`);

if (!fs.existsSync(corePath) || !fs.existsSync(warehousePath) || !fs.existsSync(statePath)) {
  throw new Error("Не найдена база core, warehouse или state-файл");
}

const warehouse = new Database(warehousePath, { readonly: true });
const core = new Database(corePath);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

const sourceProducts = warehouse.prepare(`
  SELECT p.id, p.local_name, p.official_name, p.inventory_kind, p.package_mass_grams, p.article, b.quantity_minor
  FROM products p
  JOIN inventory_balances b ON b.product_id = p.id
  WHERE b.quantity_minor > 0
  ORDER BY p.local_name COLLATE NOCASE, p.id
  LIMIT 24
`).all();

if (sourceProducts.length < 12) throw new Error("В warehouse недостаточно товаров с остатком");

fs.mkdirSync(backupDir, { recursive: true });
core.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

const locations = [
  { id: "loc-main", code: "WAREHOUSE", name: "Основной склад", type: "warehouse" },
  { id: "loc-counter", code: "COUNTER", name: "Витрина", type: "counter" },
  { id: "loc-house", code: "HOUSE-1", name: "Точка на фуд-корте", type: "house" }
];

const products = sourceProducts.map((item) => {
  const packageMassGrams = Number(item.package_mass_grams || 1000);
  const quantity = Number(item.quantity_minor) / packageMassGrams;
  return {
    id: `mock-${item.id}`,
    officialName: String(item.official_name),
    localName: String(item.local_name || item.official_name),
    unit: "шт",
    photoUrl: "",
    category: "Жевательный мармелад",
    tags: ["мок-данные", "склад"],
    status: "active",
    identifiers: [{ id: `article-${item.id}`, productId: `mock-${item.id}`, type: "legacy_article", value: String(item.article || item.id) }],
    lowStockThreshold: quantity <= 1 ? 1 : 2,
    groupId: "group-gummies",
    inventoryKind: "weight",
    packageMassGrams,
    article: String(item.article || item.id),
    quantity
  };
});

const balances = [];
const operations = [];
for (const [index, product] of products.entries()) {
  const quantity = product.quantity;
  const displayQuantity = Math.round(quantity * 1000) / 1000;
  const showcase = quantity >= 3 && index % 3 === 0 ? 1 : 0;
  const foodCourt = quantity >= 4 && index % 4 === 0 ? 1 : 0;
  const warehouseQuantity = displayQuantity - showcase - foodCourt;
  const operationBase = `mock-${String(index + 1).padStart(2, "0")}`;
  balances.push({ productId: product.id, locationId: "loc-main", quantity: warehouseQuantity, version: 1 });
  if (showcase) balances.push({ productId: product.id, locationId: "loc-counter", quantity: showcase, version: 1 });
  if (foodCourt) balances.push({ productId: product.id, locationId: "loc-house", quantity: foodCourt, version: 1 });
  operations.push({
    id: `${operationBase}-receipt`, type: "receipt", productId: product.id, toLocationId: "loc-main", quantity: displayQuantity,
    actorId: "u-admin", reason: "Стартовый мок-остаток", idempotencyKey: `${operationBase}-receipt`, createdAt
  });
  if (showcase) operations.push({
    id: `${operationBase}-showcase`, type: "transfer", productId: product.id, fromLocationId: "loc-main", toLocationId: "loc-counter", quantity: showcase,
    actorId: "u-admin", reason: "Раскладка на витрину", idempotencyKey: `${operationBase}-showcase`, createdAt
  });
  if (foodCourt) operations.push({
    id: `${operationBase}-foodcourt`, type: "transfer", productId: product.id, fromLocationId: "loc-main", toLocationId: "loc-house", quantity: foodCourt,
    actorId: "u-admin", reason: "Перемещение на точку", idempotencyKey: `${operationBase}-foodcourt`, createdAt
  });
}

const seed = core.transaction(() => {
  state.products = products.map(({ quantity: _quantity, ...product }) => product);
  state.locations = locations.map(({ id, code, name, type }) => ({ id, code, name, type, status: "active" }));
  state.balances = balances;
  state.operations = operations;
  state.productGroups = [{ id: "group-gummies", name: "Жевательный мармелад", inventoryKind: "weight", status: "active", version: 1 }];
  state.manufacturers = [];
  state.packagings = [];
  state.priceHistory = [];
  state.audit = [...(state.audit || []), { id: `mock-seed-${Date.now()}`, actorId: "u-admin", entity: "catalog", entityId: "warehouse-mock", action: "seed", changes: { products: products.length, source: "warehouse.sqlite" }, createdAt }];

  core.prepare("DELETE FROM stock_operations").run();
  core.prepare("DELETE FROM stock_balances").run();
  core.prepare("DELETE FROM inventory_balances").run();
  core.prepare("DELETE FROM product_identifiers").run();
  core.prepare("DELETE FROM product_packagings").run();
  core.prepare("DELETE FROM product_price_history").run();
  core.prepare("DELETE FROM products").run();
  core.prepare("DELETE FROM product_groups").run();
  core.prepare("DELETE FROM manufacturers").run();

  for (const location of locations) {
    core.prepare(`INSERT INTO locations(id, code, name, type, status, updated_at) VALUES (?, ?, ?, ?, 'active', ?)
      ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, type=excluded.type, status='active', updated_at=excluded.updated_at`)
      .run(location.id, location.code, location.name, location.type, createdAt);
  }
  core.prepare("INSERT INTO product_groups(id, name, inventory_kind, status, created_at, updated_at, version) VALUES (?, ?, 'weight', 'active', ?, ?, 1)")
    .run("group-gummies", "Жевательный мармелад", createdAt, createdAt);
  for (const product of products) {
    core.prepare(`INSERT INTO products(id, official_name, local_name, unit, photo_url, category, tags_json, status, low_stock_threshold, low_stock_threshold_minor, group_id, inventory_kind, package_mass_grams, article, created_at, updated_at)
      VALUES (?, ?, ?, 'шт', '', ?, ?, 'active', ?, ?, 'group-gummies', 'weight', ?, ?, ?, ?)`)
      .run(product.id, product.officialName, product.localName, product.category, JSON.stringify(product.tags), product.lowStockThreshold, Math.round(product.lowStockThreshold * 1000), product.packageMassGrams, product.article, createdAt, createdAt);
    core.prepare("INSERT INTO product_identifiers(id, product_id, type, value, normalized_value, created_at) VALUES (?, ?, 'legacy_article', ?, ?, ?)")
      .run(product.identifiers[0].id, product.id, product.article, product.article.toLocaleLowerCase("ru-RU"), createdAt);
  }
  for (const balance of balances) {
    core.prepare("INSERT INTO stock_balances(product_id, location_id, quantity, quantity_minor, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(balance.productId, balance.locationId, balance.quantity, Math.round(balance.quantity * 1000), balance.version, createdAt);
  }
  for (const operation of operations) {
    core.prepare(`INSERT INTO stock_operations(id, type, product_id, from_location_id, to_location_id, quantity, quantity_minor, actor_id, reason, idempotency_key, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`)
      .run(operation.id, operation.type, operation.productId, operation.fromLocationId || null, operation.toLocationId || null, operation.quantity, Math.round(operation.quantity * 1000), operation.actorId, operation.reason, operation.idempotencyKey, operation.createdAt);
  }
  core.prepare("INSERT INTO app_state(id, payload, updated_at) VALUES ('main', ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at")
    .run(JSON.stringify(state), createdAt);
});

try {
  seed();
  const temporaryStatePath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryStatePath, JSON.stringify(state, null, 2));
  fs.renameSync(temporaryStatePath, statePath);
  console.log(JSON.stringify({ products: products.length, balances: balances.length, operations: operations.length, backupPath }, null, 2));
} finally {
  warehouse.close();
  core.close();
}
