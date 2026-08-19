import assert from "node:assert/strict";
import {
  locationMapper,
  productAliasMapper,
  productIdentifierMapper,
  productMapper,
  stockBalanceMapper,
  stockOperationMapper,
  supplierMapper,
  supplierSkuMapper,
  type LocationRow,
  type ProductAliasRow,
  type ProductIdentifierRow,
  type ProductRow,
  type StockBalanceRow,
  type StockOperationRow,
  type SupplierRow,
  type SupplierSkuRow
} from "./catalog";
import { RowMappingError, type DatabaseRow } from "./core";

const CREATED_AT = "2026-07-10T01:02:03.000Z";
const UPDATED_AT = "2026-07-11T04:05:06.000Z";

const supplier: SupplierRow = {
  id: "supplier-1",
  name: "Поставщик",
  status: "active",
  contact: { schemaVersion: 1, value: { email: "s@example.test", priority: 2 } },
  createdAt: CREATED_AT,
  revision: UPDATED_AT
};
assert.deepEqual(supplierMapper.fromRow(supplierMapper.toRow(supplier)), supplier);

const product: ProductRow = {
  id: "product-1",
  officialName: "Молоко",
  localName: "Молоко 3,2%",
  unit: "л",
  photoUrl: "/media/milk.jpg",
  category: "Молочные продукты",
  tags: ["холодильник", "утро"],
  status: "archived",
  lowStockThreshold: 2.5,
  groupId: undefined,
  manufacturerId: undefined,
  inventoryKind: "piece",
  packageMassGrams: undefined,
  article: "",
  createdAt: CREATED_AT,
  revision: UPDATED_AT,
  archivedAt: UPDATED_AT
};
assert.deepEqual(productMapper.fromRow(productMapper.toRow(product)), product);
assert.deepEqual(JSON.parse(String(productMapper.toRow(product).tags_json)), {
  schemaVersion: 1,
  value: product.tags
});

const identifier: ProductIdentifierRow = {
  id: "identifier-1",
  productId: product.id,
  type: "supplier_article",
  value: " MLK-01 ",
  normalizedValue: "mlk-01",
  supplierId: supplier.id,
  createdAt: CREATED_AT
};
assert.deepEqual(productIdentifierMapper.fromRow(productIdentifierMapper.toRow(identifier)), identifier);
const identifierWithoutSupplier: ProductIdentifierRow = {
  ...identifier,
  id: "identifier-2",
  supplierId: undefined
};
assert.equal(productIdentifierMapper.toRow(identifierWithoutSupplier).supplier_id, null);
assert.deepEqual(productIdentifierMapper.fromRow(productIdentifierMapper.toRow(identifierWithoutSupplier)), identifierWithoutSupplier);

const supplierSku: SupplierSkuRow = {
  id: "supplier-sku-1",
  supplierId: supplier.id,
  productId: product.id,
  sku: "Milk-001",
  normalizedSku: "milk-001",
  source: { schemaVersion: 1, value: { importId: "import-1" } },
  createdAt: CREATED_AT,
  revision: UPDATED_AT
};
assert.deepEqual(supplierSkuMapper.fromRow(supplierSkuMapper.toRow(supplierSku)), supplierSku);

const alias: ProductAliasRow = {
  id: "alias-1",
  productId: product.id,
  alias: "Молочко",
  normalizedAlias: "молочко",
  source: "manual",
  createdAt: CREATED_AT
};
assert.deepEqual(productAliasMapper.fromRow(productAliasMapper.toRow(alias)), alias);

const location: LocationRow = {
  id: "location-1",
  code: "WH-01",
  name: "Главный склад",
  type: "warehouse",
  parentId: undefined,
  status: "active",
  capacity: 250,
  createdAt: CREATED_AT,
  revision: UPDATED_AT,
  archivedAt: undefined
};
assert.deepEqual(locationMapper.fromRow(locationMapper.toRow(location)), location);
assert.equal(locationMapper.toRow(location).parent_id, null);
assert.equal(locationMapper.toRow(location).archived_at, null);

const stockBalance: StockBalanceRow = {
  productId: product.id,
  locationId: location.id,
  quantity: 12.375,
  version: 7,
  updatedAt: UPDATED_AT,
  revision: "7"
};
assert.deepEqual(stockBalanceMapper.fromRow(stockBalanceMapper.toRow(stockBalance, "кг"), "кг"), stockBalance);

const stockOperation: StockOperationRow = {
  id: "operation-1",
  type: "transfer",
  productId: product.id,
  fromLocationId: location.id,
  toLocationId: "location-2",
  quantity: 1.25,
  actorId: "user-1",
  reason: "Пополнение витрины",
  idempotencyKey: "idem-operation-1",
  reversedOperationId: undefined,
  metadata: { schemaVersion: 1, value: { requestId: "request-1" } },
  createdAt: CREATED_AT
};
assert.deepEqual(stockOperationMapper.fromRow(stockOperationMapper.toRow(stockOperation, "кг"), "кг"), stockOperation);
assert.equal(stockOperationMapper.toRow(stockOperation, "кг").reversed_operation_id, null);

const operationWithoutMetadata: StockOperationRow = {
  ...stockOperation,
  id: "operation-2",
  idempotencyKey: "idem-operation-2",
  metadata: undefined
};
assert.deepEqual(stockOperationMapper.fromRow(stockOperationMapper.toRow(operationWithoutMetadata, "кг"), "кг"), {
  ...operationWithoutMetadata,
  metadata: { schemaVersion: 1, value: {} }
});

const legacySupplierRow: DatabaseRow = {
  ...supplierMapper.toRow(supplier),
  contact_json: JSON.stringify({ phone: "+7" }),
  created_at: "2026-07-10 01:02:03",
  updated_at: "2026-07-11 04:05:06"
};
assert.deepEqual(supplierMapper.fromRow(legacySupplierRow).contact, {
  schemaVersion: 1,
  value: { phone: "+7" }
});
assert.equal(supplierMapper.fromRow(legacySupplierRow).createdAt, CREATED_AT);
assert.equal(supplierMapper.fromRow(legacySupplierRow).revision, UPDATED_AT);

function expectMappingError(
  run: () => unknown,
  expected: { entity: string; entityId: string; field: string; code: RowMappingError["code"] }
) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof RowMappingError);
    assert.equal(error.entity, expected.entity);
    assert.equal(error.entityId, expected.entityId);
    assert.equal(error.field, expected.field);
    assert.equal(error.code, expected.code);
    assert.match(error.message, new RegExp(`${expected.entity} ${expected.entityId}`));
    return true;
  });
}

expectMappingError(
  () => supplierMapper.fromRow({ ...supplierMapper.toRow(supplier), contact_json: "{not-json" }),
  { entity: "suppliers", entityId: supplier.id, field: "contact_json", code: "JSON" }
);
expectMappingError(
  () => supplierMapper.fromRow({
    ...supplierMapper.toRow(supplier),
    contact_json: JSON.stringify({ schemaVersion: 2, value: {} })
  }),
  { entity: "suppliers", entityId: supplier.id, field: "contact_json", code: "JSON_VERSION" }
);
expectMappingError(
  () => supplierMapper.fromRow({ ...supplierMapper.toRow(supplier), contact_json: JSON.stringify([]) }),
  { entity: "suppliers", entityId: supplier.id, field: "contact_json", code: "JSON" }
);
expectMappingError(
  () => productMapper.fromRow({ ...productMapper.toRow(product), status: "unknown" }),
  { entity: "products", entityId: product.id, field: "status", code: "ENUM" }
);
expectMappingError(
  () => productMapper.fromRow({ ...productMapper.toRow(product), tags_json: JSON.stringify(["valid", 1]) }),
  { entity: "products", entityId: product.id, field: "tags_json", code: "JSON" }
);
expectMappingError(
  () => productMapper.fromRow({ ...productMapper.toRow(product), low_stock_threshold: 2.6 }),
  { entity: "products", entityId: product.id, field: "low_stock_threshold", code: "QUANTITY" }
);
expectMappingError(
  () => productIdentifierMapper.fromRow({ ...productIdentifierMapper.toRow(identifier), product_id: "" }),
  { entity: "product_identifiers", entityId: identifier.id, field: "product_id", code: "TYPE" }
);
expectMappingError(
  () => productIdentifierMapper.fromRow({ ...productIdentifierMapper.toRow(identifier), supplier_id: "   " }),
  { entity: "product_identifiers", entityId: identifier.id, field: "supplier_id", code: "TYPE" }
);
expectMappingError(
  () => locationMapper.fromRow({ ...locationMapper.toRow(location), capacity: 0 }),
  { entity: "locations", entityId: location.id, field: "capacity", code: "INTEGER" }
);
expectMappingError(
  () => stockBalanceMapper.fromRow({ ...stockBalanceMapper.toRow(stockBalance, "кг"), quantity: 12.374 }, "кг"),
  { entity: "stock_balances", entityId: `${product.id}/${location.id}`, field: "quantity", code: "QUANTITY" }
);
expectMappingError(
  () => stockBalanceMapper.fromRow({ ...stockBalanceMapper.toRow(stockBalance, "кг"), version: -1 }, "кг"),
  { entity: "stock_balances", entityId: `${product.id}/${location.id}`, field: "version", code: "INTEGER" }
);
expectMappingError(
  () => stockOperationMapper.fromRow({ ...stockOperationMapper.toRow(stockOperation, "кг"), metadata_json: "bad" }, "кг"),
  { entity: "stock_operations", entityId: stockOperation.id, field: "metadata_json", code: "JSON" }
);
const legacyOperation = stockOperationMapper.fromRow({ ...stockOperationMapper.toRow(stockOperation, "кг"), idempotency_key: null }, "кг");
assert.equal(legacyOperation.idempotencyKey, undefined);
assert.equal(stockOperationMapper.toRow(legacyOperation, "кг").idempotency_key, null);
expectMappingError(
  () => stockOperationMapper.fromRow({
    ...stockOperationMapper.toRow(stockOperation, "кг"),
    quantity: 0,
    quantity_minor: 0
  }, "кг"),
  { entity: "stock_operations", entityId: stockOperation.id, field: "quantity_minor", code: "QUANTITY" }
);

assert.throws(
  () => stockBalanceMapper.toRow({ ...stockBalance, revision: "6" }, "кг"),
  /revision must equal version/
);
assert.throws(
  () => stockOperationMapper.toRow({ ...stockOperation, quantity: 1.5 }, "шт"),
  /Invalid quantity/
);

console.log("catalog mapper tests passed");
