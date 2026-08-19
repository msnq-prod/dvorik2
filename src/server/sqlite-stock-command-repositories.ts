import { quantityFromMinor, type QuantityUnit } from "../shared/quantity";
import type { Manufacturer, NotificationPreference, Permission, Product, ProductGroup, ProductIdentifier, Role } from "../shared/types";
import type { DatabaseContext, SqlValue } from "./database";
import {
  locationMapper,
  productIdentifierMapper,
  productMapper,
  stockBalanceMapper,
  stockOperationMapper
} from "./mappers/catalog";
import { rolePermissionMapper, userMapper, userRoleMapper } from "./mappers/identity";
import {
  auditEntryFromRow,
  auditEntryToRow,
  notificationPreferenceFromRow,
  outboxMessageFromRow,
  outboxMessageToRow,
  webappNotificationFromRow,
  webappNotificationToRow
} from "./mappers/workflows";
import type {
  CreateOptions,
  CreateResult,
  NotificationsRepository,
  LocationsRepository,
  ProductsRepository,
  RepositoryAuditEntry,
  RepositoryNotification,
  RepositoryOutboxMessage,
  RepositoryRecord,
  RepositoryStockOperation,
  WriteOptions,
  WriteResult
} from "./repositories";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import type {
  StockCommandRepositories,
  StockEventDelivery,
  StockEventType
} from "./stock-operation-service";
import type { CatalogCommandRepositories } from "./catalog-service";
import type { NotificationPreferenceCommandRepositories } from "./notification-preference-service";

type Row = Readonly<Record<string, unknown>>;

function first<T extends Row>(database: DatabaseContext, sql: string, parameters: readonly SqlValue[]): T | undefined {
  return database.query<T>(sql, parameters)[0];
}

function values(row: Record<string, SqlValue>, columns: readonly string[]): SqlValue[] {
  return columns.map((column) => row[column]);
}

function revisionNumber(revision: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(revision)) return undefined;
  const value = Number(revision);
  return Number.isSafeInteger(value) ? value : undefined;
}

function assertCreateOptions(options: CreateOptions): void {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}

function productRecord(database: DatabaseContext, productId: string): RepositoryRecord<Product> | undefined {
  const row = first<Row>(database, "SELECT * FROM products WHERE id = ?", [productId]);
  if (!row) return undefined;
  const mapped = productMapper.fromRow(row);
  const identifierRows = database.query<Row>(
    "SELECT * FROM product_identifiers WHERE product_id = ? ORDER BY id",
    [productId]
  );
  const identifiers: ProductIdentifier[] = identifierRows.map((identifierRow) => {
    const { normalizedValue: _normalizedValue, createdAt: _createdAt, ...identifier } = productIdentifierMapper.fromRow(identifierRow);
    return identifier;
  });
  const { createdAt: _createdAt, archivedAt: _archivedAt, revision, ...product } = mapped;
  return { entity: { ...product, identifiers }, revision };
}

function productUnit(database: DatabaseContext, productId: string): QuantityUnit | undefined {
  const row = first<Row>(database, "SELECT * FROM products WHERE id = ?", [productId]);
  return row ? productMapper.fromRow(row).unit : undefined;
}

function locationRecord(database: DatabaseContext, locationId: string) {
  const row = first<Row>(database, "SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row) return undefined;
  const mapped = locationMapper.fromRow(row);
  const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision, ...location } = mapped;
  return { entity: location, revision };
}

function balanceRecord(database: DatabaseContext, productId: string, locationId: string) {
  const unit = productUnit(database, productId);
  if (!unit) return undefined;
  const row = first<Row>(database, "SELECT * FROM stock_balances WHERE product_id = ? AND location_id = ?", [productId, locationId]);
  if (!row) return undefined;
  const mapped = stockBalanceMapper.fromRow(row, unit);
  const { updatedAt: _updatedAt, revision, ...balance } = mapped;
  return { entity: balance, revision };
}

function operationRecord(database: DatabaseContext, operationId: string, idempotencyKey?: string) {
  const row = first<Row>(
    database,
    idempotencyKey
      ? "SELECT * FROM stock_operations WHERE id = ? OR idempotency_key = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1"
      : "SELECT * FROM stock_operations WHERE id = ?",
    idempotencyKey ? [operationId, idempotencyKey, operationId] : [operationId]
  );
  if (!row) return undefined;
  const productId = typeof row.product_id === "string" ? row.product_id : "";
  const unit = productUnit(database, productId);
  if (!unit) return undefined;
  const operation = stockOperationMapper.fromRow(row, unit);
  return { entity: operation, revision: operation.createdAt };
}

function notificationRecord(database: DatabaseContext, notificationId: string): RepositoryRecord<RepositoryNotification> | undefined {
  const row = first<Row>(database, "SELECT * FROM webapp_notifications WHERE id = ?", [notificationId]);
  if (!row) return undefined;
  const mapped = webappNotificationFromRow(row);
  return { entity: mapped.entity.notification, revision: mapped.revision };
}

function outboxRecord(database: DatabaseContext, messageId: string, channel?: string, idempotencyKey?: string): RepositoryRecord<RepositoryOutboxMessage> | undefined {
  const row = first<Row>(
    database,
    channel && idempotencyKey
      ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1"
      : "SELECT * FROM outbox_messages WHERE id = ?",
    channel && idempotencyKey ? [messageId, channel, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return undefined;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}

function auditRecord(database: DatabaseContext, entryId: string): RepositoryRecord<RepositoryAuditEntry> | undefined {
  const row = first<Row>(database, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return undefined;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}

export function createRolesRepository(database: DatabaseContext): StockCommandRepositories["roles"] {
  return {
    getAuthorization(userId) {
      const rawUser = first<Row>(database, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };

      const roles = database.query<Row>("SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id", [userId])
        .map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(roles)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };

      const role = distinctRoles[0] as Role;
      const permissions = database.query<Row>("SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id", [role])
        .map((row) => rolePermissionMapper.fromRow(row).permission) as Permission[];
      return {
        outcome: "found",
        snapshot: { userId, role, permissions, revision: user.revision }
      };
    }
  };
}

export function createProductsRepository(database: DatabaseContext): ProductsRepository {
  return {
    findById: (productId) => productRecord(database, productId),
    findByIdentifier(input) {
      const row = first<Row>(database,
        "SELECT product_id FROM product_identifiers WHERE type = ? AND normalized_value = ? AND (supplier_id IS ? OR supplier_id = ?) ORDER BY id LIMIT 1",
        [input.type, input.value.trim().toLocaleLowerCase("ru-RU"), input.supplierId ?? null, input.supplierId ?? null]
      );
      return typeof row?.product_id === "string" ? productRecord(database, row.product_id) : undefined;
    },
    list() { throw new Error("Product command repository does not expose list queries"); },
    listAliases() { throw new Error("Product command repository does not expose alias queries"); },
    create(product, options) {
      assertCreateOptions(options);
      const persisted = productMapper.toRow({ ...product, createdAt: options.at, revision: options.at });
      const columns = ["id", "official_name", "local_name", "unit", "photo_url", "category", "tags_json", "status", "low_stock_threshold", "low_stock_threshold_minor", "group_id", "manufacturer_id", "inventory_kind", "package_mass_grams", "article", "created_at", "updated_at", "archived_at"] as const;
      const result = database.execute(
        `INSERT INTO products(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) DO NOTHING`,
        values(persisted, columns)
      );
      if (result.changes === 1) {
        database.execute("INSERT INTO inventory_balances(product_id, quantity_minor, version, updated_at) VALUES (?, 0, 0, ?)", [product.id, options.at]);
        for (const identifier of product.identifiers) {
          const row = productIdentifierMapper.toRow({
            ...identifier,
            normalizedValue: identifier.value.trim().toLocaleLowerCase("ru-RU"),
            createdAt: options.at
          });
          const identifierColumns = ["id", "product_id", "supplier_id", "type", "value", "normalized_value", "created_at"] as const;
          database.execute(
            `INSERT INTO product_identifiers(${identifierColumns.join(", ")}) VALUES (${identifierColumns.map(() => "?").join(", ")})`,
            values(row, identifierColumns)
          );
        }
      }
      const current = productRecord(database, product.id);
      if (!current) throw new Error("product insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },
    save(product, options) {
      const result = database.execute(
        "UPDATE products SET local_name = ?, photo_url = ?, category = ?, status = ?, group_id = ?, manufacturer_id = ?, inventory_kind = ?, package_mass_grams = ?, article = ?, archived_at = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
        [product.localName, product.photoUrl, product.category, product.status, product.groupId ?? null, product.manufacturerId ?? null, product.inventoryKind ?? "piece", product.packageMassGrams ?? null, product.article ?? "", product.status === "archived" ? options.at : null, options.at, product.id, options.expectedRevision]
      );
      const current = productRecord(database, product.id);
      if (result.changes === 1) {
        if (!current) throw new Error("product update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },
    saveAlias() { throw new Error("Product command repository does not expose aliases yet"); }
  };
}

export function createLocationsRepository(database: DatabaseContext): LocationsRepository {
  return {
    findById: (locationId) => locationRecord(database, locationId),
    findByCode(code) {
      const row = first<Row>(database, "SELECT id FROM locations WHERE code = ? COLLATE NOCASE", [code]);
      return typeof row?.id === "string" ? locationRecord(database, row.id) : undefined;
    },
    list() { throw new Error("Location command repository does not expose list queries"); },
    save(location, options) {
      if (options.expectedRevision === null) {
        const result = database.execute("INSERT INTO locations(id,code,name,type,parent_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [location.id, location.code, location.name, location.type, location.parentId ?? null, location.status, options.at, options.at]);
        const current = locationRecord(database, location.id);
        if (!current) throw new Error("location insert did not create or find row");
        return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
      }
      const result = database.execute("UPDATE locations SET code=?,name=?,type=?,parent_id=?,status=?,archived_at=?,updated_at=? WHERE id=? AND updated_at=?", [location.code, location.name, location.type, location.parentId ?? null, location.status, location.status === "archived" ? options.at : null, options.at, location.id, options.expectedRevision]);
      const current = locationRecord(database, location.id);
      if (result.changes === 1) return current ? { outcome: "updated", record: current } : { outcome: "missing" };
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    }
  };
}

function createStockRepository(database: DatabaseContext): StockCommandRepositories["stock"] {
  const repository: StockCommandRepositories["stock"] = {
    findBalance: (productId, locationId) => balanceRecord(database, productId, locationId),
    findOperation: (operationId) => operationRecord(database, operationId),
    findReversalFor(operationId) {
      const row = first<Row>(database, "SELECT id FROM stock_operations WHERE reversed_operation_id = ? LIMIT 1", [operationId]);
      return typeof row?.id === "string" ? operationRecord(database, row.id) : undefined;
    },

    sumBalance(productId) {
      const row = first<{ total_minor: number | null }>(
        database,
        "SELECT quantity_minor AS total_minor FROM inventory_balances WHERE product_id = ?",
        [productId]
      );
      return quantityFromMinor(row?.total_minor ?? 0);
    },

    saveBalance(balance, options: WriteOptions): WriteResult<typeof balance> {
      const unit = productUnit(database, balance.productId);
      if (!unit) throw new Error("Cannot save a stock balance for a missing product");
      const persisted = stockBalanceMapper.toRow({
        ...balance,
        updatedAt: options.at,
        revision: String(balance.version)
      }, unit);
      const columns = ["product_id", "location_id", "quantity", "quantity_minor", "version", "updated_at"] as const;

      if (options.expectedRevision === null) {
        if (balance.version !== 1) throw new TypeError("A new stock balance must start at version 1");
        const result = database.execute(
          `INSERT INTO stock_balances(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values(persisted, columns)
        );
        const current = balanceRecord(database, balance.productId, balance.locationId);
        if (!current) throw new Error("stock balance insert did not create or find a row");
        return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
      }

      const expected = revisionNumber(options.expectedRevision);
      if (expected === undefined) {
        const current = balanceRecord(database, balance.productId, balance.locationId);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      if (!Number.isSafeInteger(expected + 1) || balance.version !== expected + 1) {
        throw new TypeError("A stock balance update must increment version by exactly one");
      }
      const result = database.execute(
        "UPDATE stock_balances SET quantity = ?, quantity_minor = ?, version = ?, updated_at = ? WHERE product_id = ? AND location_id = ? AND version = ?",
        [persisted.quantity, persisted.quantity_minor, persisted.version, persisted.updated_at, balance.productId, balance.locationId, expected]
      );
      const current = balanceRecord(database, balance.productId, balance.locationId);
      if (result.changes === 1) {
        if (!current) throw new Error("stock balance update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },

    appendOperation(operation, options: CreateOptions): CreateResult<RepositoryStockOperation> {
      assertCreateOptions(options);
      const unit = productUnit(database, operation.productId);
      if (!unit) throw new Error("Cannot append a stock operation for a missing product");
      const persisted = stockOperationMapper.toRow(operation, unit);
      const columns = [
        "id", "type", "product_id", "from_location_id", "to_location_id", "quantity", "quantity_minor",
        "actor_id", "reason", "idempotency_key", "reversed_operation_id", "metadata_json", "created_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO stock_operations(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(persisted, columns)
      );
      const current = operationRecord(database, operation.id, operation.idempotencyKey);
      if (!current) throw new Error("stock operation insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
  return repository;
}

export function createNotificationsRepository(database: DatabaseContext): NotificationsRepository {
  return {
    findById: (notificationId) => notificationRecord(database, notificationId),
    listForUser() { throw new Error("Notification command repository does not expose notification queries"); },
    append(notification, options) {
      assertCreateOptions(options);
      const mapped = webappNotificationToRow({
        entity: { notification, updatedAt: options.at },
        revision: "0"
      });
      const columns = ["id", "recipient_user_id", "type", "payload_json", "is_read", "created_at", "read_at", "version", "updated_at"] as const;
      const result = database.execute(
        `INSERT INTO webapp_notifications(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = notificationRecord(database, notification.id);
      if (!current) throw new Error("notification insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },
    markRead() { throw new Error("Notification command repository does not expose markRead yet"); },
    listPreferences(userId) {
      const items = database.query<Row>(
        "SELECT * FROM notification_preferences WHERE user_id = ? ORDER BY channel, event_type",
        [userId]
      ).map((row) => {
        const mapped = notificationPreferenceFromRow(row);
        return { entity: mapped.entity.preference, revision: mapped.revision };
      });
      return { items };
    },
    savePreference(preference: NotificationPreference, options: WriteOptions) {
      const currentRow = first<Row>(database,
        "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
        [preference.userId, preference.channel, preference.eventType]
      );
      const current = currentRow ? (() => {
        const mapped = notificationPreferenceFromRow(currentRow);
        return { entity: mapped.entity.preference, revision: mapped.revision };
      })() : undefined;
      if (options.expectedRevision === null) {
        const result = database.execute(
          "INSERT INTO notification_preferences(user_id, channel, event_type, delivery_mode, version, updated_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT DO NOTHING",
          [preference.userId, preference.channel, preference.eventType, preference.deliveryMode, options.at]
        );
        const createdRow = first<Row>(database,
          "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
          [preference.userId, preference.channel, preference.eventType]
        );
        if (!createdRow) throw new Error("preference insert did not create or find a row");
        const mapped = notificationPreferenceFromRow(createdRow);
        const record = { entity: mapped.entity.preference, revision: mapped.revision };
        return result.changes === 1 ? { outcome: "created", record } : { outcome: "duplicate", current: record };
      }
      if (!current) return { outcome: "missing" };
      const result = database.execute(
        "UPDATE notification_preferences SET delivery_mode = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND channel = ? AND event_type = ? AND CAST(version AS TEXT) = ?",
        [preference.deliveryMode, options.at, preference.userId, preference.channel, preference.eventType, options.expectedRevision]
      );
      const updatedRow = first<Row>(database,
        "SELECT * FROM notification_preferences WHERE user_id = ? AND channel = ? AND event_type = ?",
        [preference.userId, preference.channel, preference.eventType]
      );
      if (result.changes === 1 && updatedRow) {
        const mapped = notificationPreferenceFromRow(updatedRow);
        return { outcome: "updated", record: { entity: mapped.entity.preference, revision: mapped.revision } };
      }
      return updatedRow ? { outcome: "stale", current: (() => { const mapped = notificationPreferenceFromRow(updatedRow); return { entity: mapped.entity.preference, revision: mapped.revision }; })() } : { outcome: "missing" };
    }
  };
}

export function createOutboxRepository(database: DatabaseContext): StockCommandRepositories["outbox"] {
  return {
    enqueue(message, options) {
      assertCreateOptions(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id", "channel", "recipient_user_id", "type", "payload_json", "status", "idempotency_key",
        "attempt_count", "max_attempts", "available_at", "last_error", "last_error_code", "lease_owner",
        "lease_token", "lease_expires_at", "failed_at", "sent_at", "created_at", "version", "updated_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = outboxRecord(database, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

export function createAuditRepository(database: DatabaseContext): StockCommandRepositories["audit"] {
  return {
    append(entry, options) {
      assertCreateOptions(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "actor_id", "entity_type", "entity_id", "action", "changes_json", "request_id", "created_at", "version", "updated_at"] as const;
      const result = database.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = auditRecord(database, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

function createStockEventRecipients(database: DatabaseContext): StockCommandRepositories["stockEventRecipients"] {
  return {
    resolveInstant(eventType: StockEventType): readonly StockEventDelivery[] {
      return database.query<{ user_id: string; channel: "webapp" | "telegram" }>(
        `SELECT u.id AS user_id, channels.channel
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id IN ('admin','super_admin')
         CROSS JOIN (SELECT 'webapp' AS channel UNION ALL SELECT 'telegram') channels
         LEFT JOIN notification_preferences np
           ON np.user_id = u.id AND np.channel = channels.channel AND np.event_type = ?
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles exact_role WHERE exact_role.user_id = u.id) = 1
           AND COALESCE(np.delivery_mode, 'instant') = 'instant'
         ORDER BY u.id, channels.channel`,
        [eventType]
      ).map((row) => ({ userId: row.user_id, channel: row.channel }));
    }
  };
}

export function createSqliteStockCommandRepositories(database: DatabaseContext): StockCommandRepositories {
  return Object.freeze({
    roles: createRolesRepository(database),
    products: createProductsRepository(database),
    locations: createLocationsRepository(database),
    stock: createStockRepository(database),
    notifications: createNotificationsRepository(database),
    outbox: createOutboxRepository(database),
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database),
    stockEventRecipients: createStockEventRecipients(database)
    ,inventoryGuard: { isOpen: () => Boolean(first<Row>(database, "SELECT id FROM inventory_sessions WHERE status IN ('active','closing') LIMIT 1", [])) }
  });
}

export function createSqliteCatalogCommandRepositories(database: DatabaseContext): CatalogCommandRepositories {
  return Object.freeze({
    roles: createRolesRepository(database),
    products: createProductsRepository(database),
    locations: createLocationsRepository(database),
    catalog: createCatalogReferenceRepository(database),
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}

function createCatalogReferenceRepository(database: DatabaseContext): CatalogCommandRepositories["catalog"] {
  const group = (id: string): ProductGroup | undefined => {
    const row = first<Row>(database, "SELECT * FROM product_groups WHERE id = ?", [id]);
    return row ? { id: String(row.id), name: String(row.name), inventoryKind: row.inventory_kind as ProductGroup["inventoryKind"], status: row.status as ProductGroup["status"], version: Number(row.version) } : undefined;
  };
  const manufacturer = (id: string): Manufacturer | undefined => {
    const row = first<Row>(database, "SELECT * FROM manufacturers WHERE id = ?", [id]);
    return row ? { id: String(row.id), name: String(row.name), status: row.status as Manufacturer["status"], version: Number(row.version) } : undefined;
  };
  return {
    findGroup: group,
    saveGroup(value, expectedVersion, at) {
      if (expectedVersion === null) {
        const result = database.execute("INSERT INTO product_groups(id,name,inventory_kind,status,created_at,updated_at,version) VALUES (?,?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.name, value.inventoryKind, value.status, at, at]);
        return result.changes === 1 ? "created" : "duplicate";
      }
      const result = database.execute("UPDATE product_groups SET name=?, inventory_kind=?, status=?, version=version+1, updated_at=? WHERE id=? AND version=?", [value.name, value.inventoryKind, value.status, at, value.id, expectedVersion]);
      return result.changes === 1 ? "updated" : group(value.id) ? "stale" : "duplicate";
    },
    findManufacturer: manufacturer,
    saveManufacturer(value, expectedVersion, at) {
      if (expectedVersion === null) {
        const result = database.execute("INSERT INTO manufacturers(id,name,status,created_at,updated_at,version) VALUES (?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.name, value.status, at, at]);
        return result.changes === 1 ? "created" : "duplicate";
      }
      const result = database.execute("UPDATE manufacturers SET name=?, status=?, version=version+1, updated_at=? WHERE id=? AND version=?", [value.name, value.status, at, value.id, expectedVersion]);
      return result.changes === 1 ? "updated" : manufacturer(value.id) ? "stale" : "duplicate";
    },
    appendPackaging(value, at) {
      const result = database.execute("INSERT INTO product_packagings(id,product_id,name,units_per_package,mass_grams,is_primary,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT DO NOTHING", [value.id, value.productId, value.name, value.unitsPerPackage, value.massGrams ?? null, value.isPrimary ? 1 : 0, at, at]);
      return result.changes === 1 ? "created" : "duplicate";
    },
    appendPrice(value) {
      const result = database.execute("INSERT INTO product_price_history(id,group_id,product_id,price_kopecks,price_unit,effective_from,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", [value.id, value.groupId ?? null, value.productId ?? null, value.priceKopecks, value.priceUnit, value.effectiveFrom, value.createdByUserId ?? null, value.createdAt]);
      return result.changes === 1 ? "created" : "duplicate";
    },
    appendBarcode(value, at) {
      const row = productIdentifierMapper.toRow({
        ...value,
        normalizedValue: value.value.trim().toLocaleLowerCase("ru-RU"),
        createdAt: at
      });
      const columns = ["id", "product_id", "supplier_id", "type", "value", "normalized_value", "created_at"] as const;
      const result = database.execute(
        `INSERT OR IGNORE INTO product_identifiers(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        values(row, columns)
      );
      return result.changes === 1 ? "created" : "duplicate";
    }
  };
}

export function createSqliteNotificationPreferenceCommandRepositories(database: DatabaseContext): NotificationPreferenceCommandRepositories {
  return Object.freeze({
    roles: createRolesRepository(database),
    notifications: createNotificationsRepository(database),
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}
