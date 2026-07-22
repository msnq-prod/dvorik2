import type {
  Location,
  Product,
  ProductIdentifier,
  StockBalance
} from "../../shared/types";
import type {
  JsonObject,
  RepositoryStockOperation,
  Revision,
  Supplier,
  SupplierSku,
  ProductAlias,
  VersionedPayload
} from "../repositories";
import {
  enumValue,
  integer,
  nullableString,
  nullableUtcTimestamp,
  quantity,
  quantityColumns,
  requiredString,
  rowIdentity,
  RowMappingError,
  serializeVersionedJson,
  utcTimestamp,
  versionedJson,
  type DatabaseRow,
  type PersistedRow
} from "./core";

const SUPPLIER_STATUSES = ["active", "archived"] as const;
const PRODUCT_UNITS = ["шт", "кг", "л", "м"] as const;
const PRODUCT_STATUSES = ["active", "archived", "deleted"] as const;
const INVENTORY_KINDS = ["piece", "weight"] as const;
const IDENTIFIER_TYPES = ["supplier_article", "barcode", "legacy_article", "other"] as const;
const LOCATION_TYPES = ["warehouse", "house", "counter", "other"] as const;
const LOCATION_STATUSES = ["active", "archived"] as const;
const STOCK_OPERATION_TYPES = ["receipt", "transfer", "write_off", "inventory_adjustment", "correction", "reversal", "merge"] as const;

type ProductUnit = Product["unit"];

export type SupplierRow = Supplier & Readonly<{
  createdAt: string;
  revision: Revision;
}>;

export type ProductRow = Omit<Product, "identifiers"> & Readonly<{
  createdAt: string;
  archivedAt?: string;
  revision: Revision;
}>;

export type ProductIdentifierRow = ProductIdentifier & Readonly<{
  normalizedValue: string;
  createdAt: string;
}>;

export type SupplierSkuRow = SupplierSku & Readonly<{
  normalizedSku: string;
  createdAt: string;
  revision: Revision;
}>;

export type ProductAliasRow = ProductAlias & Readonly<{
  normalizedAlias: string;
  createdAt: string;
}>;

export type LocationRow = Location & Readonly<{
  capacity?: number;
  createdAt: string;
  archivedAt?: string;
  revision: Revision;
}>;

export type StockBalanceRow = StockBalance & Readonly<{
  updatedAt: string;
  revision: Revision;
}>;

export type StockOperationRow = RepositoryStockOperation;

function mappingFailure(
  entity: string,
  row: DatabaseRow,
  field: string,
  code: RowMappingError["code"],
  identityFields: readonly string[] = ["id"]
): never {
  throw new RowMappingError(entity, rowIdentity(row, identityFields), field, code);
}

function requiredId(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = requiredString(entity, row, field, identityFields);
  if (!value.trim()) mappingFailure(entity, row, field, "TYPE", identityFields);
  return value;
}

function nullableId(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = nullableString(entity, row, field, identityFields);
  if (value !== undefined && !value.trim()) mappingFailure(entity, row, field, "TYPE", identityFields);
  return value;
}

function positiveNullableInteger(entity: string, row: DatabaseRow, field: string) {
  if (row[field] === null || row[field] === undefined) return undefined;
  const value = integer(entity, row, field);
  if (value <= 0) mappingFailure(entity, row, field, "INTEGER");
  return value;
}

function jsonObject(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const payload = versionedJson<JsonObject>(entity, row, field, identityFields);
  if (payload.value === null || Array.isArray(payload.value) || typeof payload.value !== "object") {
    mappingFailure(entity, row, field, "JSON", identityFields);
  }
  return payload;
}

function stringArray(entity: string, row: DatabaseRow, field: string) {
  const payload = versionedJson<string[]>(entity, row, field);
  if (!Array.isArray(payload.value) || payload.value.some((value) => typeof value !== "string")) {
    mappingFailure(entity, row, field, "JSON");
  }
  return payload.value;
}

function timestampForWrite(entity: string, id: string, field: string, value: string) {
  return utcTimestamp(entity, { id, [field]: value }, field);
}

function optionalTimestampForWrite(entity: string, id: string, field: string, value: string | undefined) {
  return value === undefined ? null : timestampForWrite(entity, id, field, value);
}

function idForWrite(entity: string, id: string, field: string, value: string) {
  return requiredId(entity, { id, [field]: value }, field);
}

function optionalIdForWrite(entity: string, id: string, field: string, value: string | undefined) {
  return value === undefined ? null : idForWrite(entity, id, field, value);
}

export const supplierMapper = {
  fromRow(row: DatabaseRow): SupplierRow {
    const entity = "suppliers";
    return {
      id: requiredId(entity, row, "id"),
      name: requiredString(entity, row, "name"),
      contact: jsonObject(entity, row, "contact_json"),
      status: enumValue(entity, row, "status", SUPPLIER_STATUSES),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at")
    };
  },

  toRow(value: SupplierRow): PersistedRow {
    const entity = "suppliers";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      name: value.name,
      contact_json: serializeVersionedJson(value.contact),
      status: value.status,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision)
    };
  }
};

export const productMapper = {
  fromRow(row: DatabaseRow): ProductRow {
    const entity = "products";
    const unit = enumValue(entity, row, "unit", PRODUCT_UNITS);
    return {
      id: requiredId(entity, row, "id"),
      officialName: requiredString(entity, row, "official_name"),
      localName: requiredString(entity, row, "local_name"),
      unit,
      photoUrl: requiredString(entity, row, "photo_url"),
      category: requiredString(entity, row, "category"),
      tags: stringArray(entity, row, "tags_json"),
      status: enumValue(entity, row, "status", PRODUCT_STATUSES),
      lowStockThreshold: quantity(entity, row, {
        minorField: "low_stock_threshold_minor",
        realField: "low_stock_threshold",
        unit
      }),
      groupId: nullableId(entity, row, "group_id"),
      manufacturerId: nullableId(entity, row, "manufacturer_id"),
      inventoryKind: row.inventory_kind === undefined ? "piece" : enumValue(entity, row, "inventory_kind", INVENTORY_KINDS),
      packageMassGrams: row.package_mass_grams === null || row.package_mass_grams === undefined
        ? undefined
        : positiveNullableInteger(entity, row, "package_mass_grams"),
      article: row.article === undefined ? "" : requiredString(entity, row, "article"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at"),
      archivedAt: nullableUtcTimestamp(entity, row, "archived_at")
    };
  },

  toRow(value: ProductRow): PersistedRow {
    const entity = "products";
    const threshold = quantityColumns(value.lowStockThreshold, value.unit);
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      official_name: value.officialName,
      local_name: value.localName,
      unit: value.unit,
      photo_url: value.photoUrl,
      category: value.category,
      tags_json: serializeVersionedJson({ schemaVersion: 1, value: value.tags }),
      status: value.status,
      low_stock_threshold: threshold.real,
      low_stock_threshold_minor: threshold.minor,
      group_id: optionalIdForWrite(entity, value.id, "group_id", value.groupId),
      manufacturer_id: optionalIdForWrite(entity, value.id, "manufacturer_id", value.manufacturerId),
      inventory_kind: value.inventoryKind ?? "piece",
      package_mass_grams: value.packageMassGrams ?? null,
      article: value.article ?? "",
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision),
      archived_at: optionalTimestampForWrite(entity, value.id, "archived_at", value.archivedAt)
    };
  }
};

export const productIdentifierMapper = {
  fromRow(row: DatabaseRow): ProductIdentifierRow {
    const entity = "product_identifiers";
    return {
      id: requiredId(entity, row, "id"),
      productId: requiredId(entity, row, "product_id"),
      supplierId: nullableId(entity, row, "supplier_id"),
      type: enumValue(entity, row, "type", IDENTIFIER_TYPES),
      value: requiredString(entity, row, "value"),
      normalizedValue: requiredString(entity, row, "normalized_value"),
      createdAt: utcTimestamp(entity, row, "created_at")
    };
  },

  toRow(value: ProductIdentifierRow): PersistedRow {
    const entity = "product_identifiers";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      supplier_id: optionalIdForWrite(entity, value.id, "supplier_id", value.supplierId),
      type: value.type,
      value: value.value,
      normalized_value: value.normalizedValue,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt)
    };
  }
};

export const supplierSkuMapper = {
  fromRow(row: DatabaseRow): SupplierSkuRow {
    const entity = "supplier_skus";
    return {
      id: requiredId(entity, row, "id"),
      supplierId: requiredId(entity, row, "supplier_id"),
      productId: requiredId(entity, row, "product_id"),
      sku: requiredString(entity, row, "sku"),
      normalizedSku: requiredString(entity, row, "normalized_sku"),
      source: jsonObject(entity, row, "source_json"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at")
    };
  },

  toRow(value: SupplierSkuRow): PersistedRow {
    const entity = "supplier_skus";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      supplier_id: idForWrite(entity, value.id, "supplier_id", value.supplierId),
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      sku: value.sku,
      normalized_sku: value.normalizedSku,
      source_json: serializeVersionedJson(value.source),
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision)
    };
  }
};

export const productAliasMapper = {
  fromRow(row: DatabaseRow): ProductAliasRow {
    const entity = "product_aliases";
    return {
      id: requiredId(entity, row, "id"),
      productId: requiredId(entity, row, "product_id"),
      alias: requiredString(entity, row, "alias"),
      normalizedAlias: requiredString(entity, row, "normalized_alias"),
      source: requiredString(entity, row, "source"),
      createdAt: utcTimestamp(entity, row, "created_at")
    };
  },

  toRow(value: ProductAliasRow): PersistedRow {
    const entity = "product_aliases";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      alias: value.alias,
      normalized_alias: value.normalizedAlias,
      source: value.source,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt)
    };
  }
};

export const locationMapper = {
  fromRow(row: DatabaseRow): LocationRow {
    const entity = "locations";
    return {
      id: requiredId(entity, row, "id"),
      code: requiredString(entity, row, "code"),
      name: requiredString(entity, row, "name"),
      type: enumValue(entity, row, "type", LOCATION_TYPES),
      parentId: nullableId(entity, row, "parent_id"),
      status: enumValue(entity, row, "status", LOCATION_STATUSES),
      capacity: positiveNullableInteger(entity, row, "capacity"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      revision: utcTimestamp(entity, row, "updated_at"),
      archivedAt: nullableUtcTimestamp(entity, row, "archived_at")
    };
  },

  toRow(value: LocationRow): PersistedRow {
    const entity = "locations";
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      code: value.code,
      name: value.name,
      type: value.type,
      parent_id: optionalIdForWrite(entity, value.id, "parent_id", value.parentId),
      status: value.status,
      capacity: value.capacity ?? null,
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.revision),
      archived_at: optionalTimestampForWrite(entity, value.id, "archived_at", value.archivedAt)
    };
  }
};

export const stockBalanceMapper = {
  fromRow(row: DatabaseRow, unit: ProductUnit): StockBalanceRow {
    const entity = "stock_balances";
    const identityFields = ["product_id", "location_id"] as const;
    const version = integer(entity, row, "version", identityFields);
    if (version < 0) mappingFailure(entity, row, "version", "INTEGER", identityFields);
    return {
      productId: requiredId(entity, row, "product_id", identityFields),
      locationId: requiredId(entity, row, "location_id", identityFields),
      quantity: quantity(entity, row, { minorField: "quantity_minor", realField: "quantity", unit }, identityFields),
      version,
      updatedAt: utcTimestamp(entity, row, "updated_at", identityFields),
      revision: String(version)
    };
  },

  toRow(value: StockBalanceRow, unit: ProductUnit): PersistedRow {
    const entity = "stock_balances";
    if (value.revision !== String(value.version)) throw new TypeError("stock_balances revision must equal version");
    if (!Number.isSafeInteger(value.version) || value.version < 0) throw new TypeError("stock_balances version must be a non-negative integer");
    const columns = quantityColumns(value.quantity, unit);
    return {
      product_id: idForWrite(entity, `${value.productId}/${value.locationId}`, "product_id", value.productId),
      location_id: idForWrite(entity, `${value.productId}/${value.locationId}`, "location_id", value.locationId),
      quantity: columns.real,
      quantity_minor: columns.minor,
      version: value.version,
      updated_at: timestampForWrite(entity, `${value.productId}/${value.locationId}`, "updated_at", value.updatedAt)
    };
  }
};

const EMPTY_METADATA: VersionedPayload<JsonObject> = { schemaVersion: 1, value: {} };

export const stockOperationMapper = {
  fromRow(row: DatabaseRow, unit: ProductUnit): StockOperationRow {
    const entity = "stock_operations";
    return {
      id: requiredId(entity, row, "id"),
      type: enumValue(entity, row, "type", STOCK_OPERATION_TYPES),
      productId: requiredId(entity, row, "product_id"),
      fromLocationId: nullableId(entity, row, "from_location_id"),
      toLocationId: nullableId(entity, row, "to_location_id"),
      quantity: quantity(entity, row, { minorField: "quantity_minor", realField: "quantity", unit, allowZero: false }),
      actorId: requiredId(entity, row, "actor_id"),
      reason: requiredString(entity, row, "reason"),
      idempotencyKey: nullableId(entity, row, "idempotency_key"),
      reversedOperationId: nullableId(entity, row, "reversed_operation_id"),
      metadata: jsonObject(entity, row, "metadata_json"),
      createdAt: utcTimestamp(entity, row, "created_at")
    };
  },

  toRow(value: StockOperationRow, unit: ProductUnit): PersistedRow {
    const entity = "stock_operations";
    const columns = quantityColumns(value.quantity, unit, false);
    return {
      id: idForWrite(entity, value.id, "id", value.id),
      type: value.type,
      product_id: idForWrite(entity, value.id, "product_id", value.productId),
      from_location_id: optionalIdForWrite(entity, value.id, "from_location_id", value.fromLocationId),
      to_location_id: optionalIdForWrite(entity, value.id, "to_location_id", value.toLocationId),
      quantity: columns.real,
      quantity_minor: columns.minor,
      actor_id: idForWrite(entity, value.id, "actor_id", value.actorId),
      reason: value.reason,
      idempotency_key: optionalIdForWrite(entity, value.id, "idempotency_key", value.idempotencyKey),
      reversed_operation_id: optionalIdForWrite(entity, value.id, "reversed_operation_id", value.reversedOperationId),
      metadata_json: serializeVersionedJson(value.metadata ?? EMPTY_METADATA),
      created_at: timestampForWrite(entity, value.id, "created_at", value.createdAt)
    };
  }
};
