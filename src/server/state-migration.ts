import type { AppState, Permission, Role } from "../shared/types";
import { quantityToMinor, requireQuantity } from "../shared/quantity";
import { rolePermissions } from "./permissions";

export type StateMigrationReport = {
  counts: Record<string, number>;
  conflicts: string[];
};

const quote = (value: unknown) => value === undefined || value === null
  ? "NULL"
  : `'${String(value).replace(/'/g, "''")}'`;
const json = (value: unknown) => quote(JSON.stringify(value));
const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU");
const dayId = (date: string, locationId: string) => `legacy-day:${date}:${locationId}`;

/** Validates the legacy payload before it is allowed to write normalized tables. */
export function inspectLegacyState(state: AppState): StateMigrationReport {
  const counts: Record<string, number> = {
    users: state.users.length,
    products: state.products.length,
    productIdentifiers: state.products.reduce((total, product) => total + product.identifiers.length, 0),
    locations: state.locations.length,
    balances: state.balances.length,
    operations: state.operations.length,
    shifts: state.shifts.length,
    scheduleDays: state.scheduleDays.length,
    swaps: state.swaps.length,
    imports: state.imports.length,
    merges: state.merges.length,
    labelJobs: state.labelJobs.length,
    notifications: state.notifications.length,
    outbox: state.outbox.length,
    notificationPreferences: state.notificationPreferences.length,
    auditEntries: state.audit.length,
    sessions: state.sessions.length
  };
  const conflicts: string[] = [];
  const users = new Set(state.users.map((item) => item.id));
  const products = new Set(state.products.map((item) => item.id));
  const locations = new Set(state.locations.map((item) => item.id));
  const shifts = new Set(state.shifts.map((item) => item.id));
  const barcodeOwners = new Map<string, string>();
  const locationCodes = new Set<string>();
  const importHashes = new Set<string>();
  for (const product of state.products) {
    for (const identifier of product.identifiers) {
      if (identifier.productId !== product.id) conflicts.push(`identifier ${identifier.id}: productId does not match owner`);
      if (identifier.type !== "barcode") continue;
      const key = normalize(identifier.value);
      const owner = barcodeOwners.get(key);
      if (owner && owner !== product.id) conflicts.push(`barcode ${identifier.value}: belongs to ${owner} and ${product.id}`);
      barcodeOwners.set(key, product.id);
    }
  }
  for (const balance of state.balances) {
    if (!products.has(balance.productId)) conflicts.push(`balance: missing product ${balance.productId}`);
    if (!locations.has(balance.locationId)) conflicts.push(`balance: missing location ${balance.locationId}`);
  }
  for (const location of state.locations) {
    const code = normalize(location.code);
    if (locationCodes.has(code)) conflicts.push(`location code ${location.code}: duplicate`);
    locationCodes.add(code);
  }
  for (const item of state.imports) {
    if (importHashes.has(item.hash)) conflicts.push(`import ${item.id}: duplicate content hash`);
    importHashes.add(item.hash);
  }
  for (const operation of state.operations) {
    if (!products.has(operation.productId)) conflicts.push(`operation ${operation.id}: missing product`);
    if (!users.has(operation.actorId)) conflicts.push(`operation ${operation.id}: missing actor`);
    if (operation.fromLocationId && !locations.has(operation.fromLocationId)) conflicts.push(`operation ${operation.id}: missing source location`);
    if (operation.toLocationId && !locations.has(operation.toLocationId)) conflicts.push(`operation ${operation.id}: missing target location`);
  }
  for (const shift of state.shifts) {
    if (!locations.has(shift.locationId)) conflicts.push(`shift ${shift.id}: missing location`);
    for (const userId of shift.employeeIds) if (!users.has(userId)) conflicts.push(`shift ${shift.id}: missing employee ${userId}`);
  }
  for (const swap of state.swaps) {
    if (!shifts.has(swap.fromShiftId)) conflicts.push(`swap ${swap.id}: missing shift`);
    if (!users.has(swap.fromUserId) || !users.has(swap.toUserId)) conflicts.push(`swap ${swap.id}: missing participant`);
  }
  for (const notification of state.notifications) {
    if (!users.has(notification.userId)) conflicts.push(`notification ${notification.id}: missing recipient`);
  }
  for (const product of state.products) {
    try { requireQuantity(product.lowStockThreshold, { unit: product.inventoryKind === "weight" ? "шт" : product.unit }); } catch { conflicts.push(`product ${product.id}: invalid low stock threshold`); }
  }
  for (const balance of state.balances) {
    const product = state.products.find((item) => item.id === balance.productId);
    try { requireQuantity(balance.quantity, { unit: product?.inventoryKind === "weight" ? "шт" : product?.unit }); } catch { conflicts.push(`balance ${balance.productId}/${balance.locationId}: invalid quantity`); }
  }
  for (const operation of state.operations) {
    const product = state.products.find((item) => item.id === operation.productId);
    try { requireQuantity(operation.quantity, { unit: product?.inventoryKind === "weight" ? "шт" : product?.unit, allowZero: false }); } catch { conflicts.push(`operation ${operation.id}: invalid quantity`); }
  }
  return { counts, conflicts };
}

/**
 * Produces one atomic, rollbackable conversion from `app_state.payload` to v2 tables.
 * It never executes SQL itself, so callers can dry-run after inspecting the report.
 */
export function buildNormalizedStateSql(state: AppState, options: Readonly<{
  preserveSessions?: boolean;
  preserveIdentity?: boolean;
  preserveCommandTables?: boolean;
}> = {}) {
  const report = inspectLegacyState(state);
  if (report.conflicts.length) throw new Error(`State migration blocked: ${report.conflicts.join("; ")}`);
  const userIds = new Set(state.users.map((user) => user.id));
  const supplierIds = [...new Set(
    state.products.flatMap((product) => product.identifiers.map((identifier) => identifier.supplierId))
      .filter((id): id is string => Boolean(id))
  )];
  const statements: string[] = ["PRAGMA foreign_keys = OFF", "BEGIN IMMEDIATE", "DROP TRIGGER IF EXISTS product_price_history_immutable_delete"];
  if (options.preserveSessions && !options.preserveIdentity) {
    if (state.users.length) {
      const userList = state.users.map((user) => quote(user.id)).join(", ");
      statements.push(`DELETE FROM sessions WHERE user_id NOT IN (${userList})`);
      statements.push(`UPDATE audit_entries SET actor_id = NULL WHERE actor_id IS NOT NULL AND actor_id NOT IN (${userList})`);
    } else {
      statements.push("DELETE FROM sessions");
      statements.push("UPDATE audit_entries SET actor_id = NULL WHERE actor_id IS NOT NULL");
    }
  }
  const tables = [
    ...(options.preserveIdentity ? [] : ["role_permissions", "user_roles"]),
    ...(options.preserveSessions ? [] : ["sessions"]),
    "product_price_history", "product_packagings", "product_identifiers", "supplier_skus", "product_aliases", "stock_operations", "inventory_balances", "stock_balances",
    "shift_assignments", "shift_swap_requests", "shifts", "schedule_days", "rotation_templates",
    "import_rows", "imports", "merge_jobs", "label_jobs", "notification_preferences", "webapp_notifications",
    ...(options.preserveCommandTables ? [] : ["outbox_messages"]),
    ...(options.preserveSessions ? [] : ["audit_entries"]),
    ...(options.preserveCommandTables ? [] : ["idempotency_keys"]),
    "products", "product_groups", "manufacturers", "suppliers", "locations",
    ...(options.preserveIdentity ? [] : ["permissions", "roles", "users"])
  ];
  statements.push(...tables.map((table) => `DELETE FROM ${table}`));

  const roles = [...new Set<Role>([
    ...(Object.keys(rolePermissions) as Role[]),
    ...state.users.map((user) => user.role)
  ])];
  const permissions = [...new Set<Permission>([
    ...Object.values(rolePermissions).flat(),
    ...state.users.flatMap((user) => user.permissions)
  ])];
  if (!options.preserveIdentity) {
    statements.push(...roles.map((role) => `INSERT INTO roles(id, name) VALUES (${quote(role)}, ${quote(role)})`));
    statements.push(...permissions.map((permission) => `INSERT INTO permissions(id, code) VALUES (${quote(permission)}, ${quote(permission)})`));
    statements.push(...state.users.map((user) => `INSERT INTO users(id, telegram_user_id, first_name, last_name, username, status) VALUES (${quote(user.id)}, ${quote(user.telegramUserId)}, ${quote(user.firstName)}, ${quote(user.lastName)}, ${quote(user.username)}, ${quote(user.status)})`));
    statements.push(...state.users.map((user) => `INSERT INTO user_roles(user_id, role_id) VALUES (${quote(user.id)}, ${quote(user.role)})`));
    statements.push(...Object.entries(rolePermissions).flatMap(([role, assignedPermissions]) => assignedPermissions.map((permission) => `INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (${quote(role)}, ${quote(permission)})`)));
    statements.push(...state.users.flatMap((user) => user.permissions.map((permission) => `INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES (${quote(user.role)}, ${quote(permission)})`)));
  }
  // Legacy session IDs were bearer credentials and cannot be safely converted
  // into hash-only sessions. Conversion intentionally revokes them by omission.
  statements.push(...state.locations.map((location) => `INSERT INTO locations(id, code, name, type, parent_id, status) VALUES (${quote(location.id)}, ${quote(location.code)}, ${quote(location.name)}, ${quote(location.type)}, ${quote(location.parentId)}, ${quote(location.status)})`));
  statements.push(...supplierIds.map((id) => `INSERT INTO suppliers(id, name) VALUES (${quote(id)}, ${quote(`Legacy supplier ${id}`)})`));
  statements.push(...(state.productGroups || []).map((group) => `INSERT INTO product_groups(id,name,inventory_kind,status,created_at,updated_at,version) VALUES (${quote(group.id)},${quote(group.name)},${quote(group.inventoryKind)},${quote(group.status)},datetime('now'),datetime('now'),${group.version})`));
  statements.push(...(state.manufacturers || []).map((manufacturer) => `INSERT INTO manufacturers(id,name,status,created_at,updated_at,version) VALUES (${quote(manufacturer.id)},${quote(manufacturer.name)},${quote(manufacturer.status)},datetime('now'),datetime('now'),${manufacturer.version})`));
  statements.push(...state.products.map((product) => { const quantityUnit = product.inventoryKind === "weight" ? "шт" : product.unit; return `INSERT INTO products(id, official_name, local_name, unit, photo_url, category, tags_json, status, low_stock_threshold, low_stock_threshold_minor, group_id, manufacturer_id, inventory_kind, package_mass_grams, article) VALUES (${quote(product.id)}, ${quote(product.officialName)}, ${quote(product.localName)}, ${quote(product.unit)}, ${quote(product.photoUrl)}, ${quote(product.category)}, ${json(product.tags)}, ${quote(product.status)}, ${product.lowStockThreshold}, ${quantityToMinor(product.lowStockThreshold, quantityUnit)}, ${quote(product.groupId)}, ${quote(product.manufacturerId)}, ${quote(product.inventoryKind || "piece")}, ${product.packageMassGrams || "NULL"}, ${quote(product.article || "")})`; }));
  statements.push(...(state.packagings || []).map((packaging) => `INSERT INTO product_packagings(id,product_id,name,units_per_package,mass_grams,is_primary,created_at,updated_at,version) VALUES (${quote(packaging.id)},${quote(packaging.productId)},${quote(packaging.name)},${packaging.unitsPerPackage},${packaging.massGrams || "NULL"},${packaging.isPrimary ? 1 : 0},datetime('now'),datetime('now'),${packaging.version})`));
  statements.push(...(state.priceHistory || []).map((price) => `INSERT INTO product_price_history(id,group_id,product_id,price_kopecks,price_unit,effective_from,created_by_user_id,created_at) VALUES (${quote(price.id)},${quote(price.groupId)},${quote(price.productId)},${price.priceKopecks},${quote(price.priceUnit)},${quote(price.effectiveFrom)},${quote(price.createdByUserId && userIds.has(price.createdByUserId) ? price.createdByUserId : undefined)},${quote(price.createdAt)})`));
  statements.push(...state.products.flatMap((product) => product.identifiers.map((identifier) => `INSERT INTO product_identifiers(id, product_id, supplier_id, type, value, normalized_value) VALUES (${quote(identifier.id)}, ${quote(product.id)}, ${quote(identifier.supplierId)}, ${quote(identifier.type)}, ${quote(identifier.value)}, ${quote(normalize(identifier.value))})`)));
  statements.push(...state.balances.map((balance) => { const product = state.products.find((item) => item.id === balance.productId); const unit = product?.inventoryKind === "weight" ? "шт" : product?.unit; return `INSERT INTO stock_balances(product_id, location_id, quantity, quantity_minor, version) VALUES (${quote(balance.productId)}, ${quote(balance.locationId)}, ${balance.quantity}, ${quantityToMinor(balance.quantity, unit)}, ${balance.version})`; }));
  statements.push("INSERT OR IGNORE INTO inventory_balances(product_id, quantity_minor, version, updated_at) SELECT id, 0, 0, datetime('now') FROM products");
  statements.push(...state.operations.map((operation) => { const product = state.products.find((item) => item.id === operation.productId); const unit = product?.inventoryKind === "weight" ? "шт" : product?.unit; return `INSERT INTO stock_operations(id, type, product_id, from_location_id, to_location_id, quantity, quantity_minor, actor_id, reason, idempotency_key, reversed_operation_id, metadata_json, created_at) VALUES (${quote(operation.id)}, ${quote(operation.type)}, ${quote(operation.productId)}, ${quote(operation.fromLocationId)}, ${quote(operation.toLocationId)}, ${operation.quantity}, ${quantityToMinor(operation.quantity, unit)}, ${quote(operation.actorId)}, ${quote(operation.reason)}, ${quote(operation.idempotencyKey)}, ${quote(operation.reversedOperationId)}, ${json(operation.metadata || {})}, ${quote(operation.createdAt)})`; }));
  const derivedDays = state.shifts.map((shift) => ({ id: dayId(shift.date, shift.locationId), date: shift.date, locationId: shift.locationId, status: "working" as const, comment: "", version: 0 }));
  const daysByKey = new Map([...derivedDays, ...state.scheduleDays].map((day) => [`${day.date}:${day.locationId}`, day]));
  const days = [...daysByKey.values()];
  statements.push(...days.map((day) => `INSERT INTO schedule_days(id, local_date, location_id, status, comment, version) VALUES (${quote(day.id)}, ${quote(day.date)}, ${quote(day.locationId)}, ${quote(day.status)}, ${quote(day.comment)}, ${day.version})`));
  statements.push(...state.shifts.map((shift) => `INSERT INTO shifts(id, schedule_day_id, location_id, local_date, start_time, end_time, status, comment) VALUES (${quote(shift.id)}, ${quote(daysByKey.get(`${shift.date}:${shift.locationId}`)?.id || dayId(shift.date, shift.locationId))}, ${quote(shift.locationId)}, ${quote(shift.date)}, ${quote(shift.start)}, ${quote(shift.end)}, ${quote(shift.status)}, ${quote(shift.comment)})`));
  statements.push(...state.shifts.flatMap((shift) => shift.employeeIds.map((userId) => `INSERT INTO shift_assignments(shift_id, user_id) VALUES (${quote(shift.id)}, ${quote(userId)})`)));
  statements.push(...state.swaps.map((swap) => {
    const status = swap.status === "pending" ? "expired" : swap.status;
    const resolvedAt = swap.status === "pending" ? swap.createdAt : undefined;
    return `INSERT INTO shift_swap_requests(id, from_shift_id, from_user_id, to_user_id, source_shift_version, status, created_at, resolved_at, updated_at) VALUES (${quote(swap.id)}, ${quote(swap.fromShiftId)}, ${quote(swap.fromUserId)}, ${quote(swap.toUserId)}, 0, ${quote(status)}, ${quote(swap.createdAt)}, ${quote(resolvedAt)}, ${quote(swap.createdAt)})`;
  }));
  statements.push(...state.imports.map((item) => `INSERT INTO imports(id, status, file_name, content_hash, preview_json, result_json, created_at, committed_at, reverted_at, updated_at) VALUES (${quote(item.id)}, ${quote(item.status)}, ${quote(item.fileName)}, ${quote(item.hash)}, ${json({ rows: item.rows })}, ${json(item.result || {})}, ${quote(item.createdAt)}, ${quote(item.status === "committed" ? item.createdAt : undefined)}, ${quote(item.status === "reverted" ? item.createdAt : undefined)}, ${quote(item.createdAt)})`));
  statements.push(...state.imports.flatMap((item) => item.rows.map((row, index) => `INSERT INTO import_rows(id, import_id, row_number, raw_json, status, updated_at) VALUES (${quote(`${item.id}:${index + 1}`)}, ${quote(item.id)}, ${index + 1}, ${json(row)}, ${quote(item.status === "committed" ? "committed" : "pending")}, ${quote(item.createdAt)})`)));
  statements.push(...state.merges.map((item) => `INSERT INTO merge_jobs(id, status, source_product_id, target_product_id, snapshot_json, created_at, committed_at, reverted_at, updated_at) VALUES (${quote(item.id)}, ${quote(item.status)}, ${quote(item.sourceProductId)}, ${quote(item.targetProductId)}, ${json(item.snapshot)}, ${quote(item.createdAt)}, ${quote(item.committedAt)}, ${quote(item.status === "reverted" ? item.createdAt : undefined)}, ${quote(item.committedAt || item.createdAt)})`));
  statements.push(...state.labelJobs.map((job) => `INSERT INTO label_jobs(id, actor_id, template_id, geometry_json, labels_json, created_at, updated_at) VALUES (${quote(job.id)}, ${quote(userIds.has(job.actorId) ? job.actorId : undefined)}, ${quote(job.templateId)}, ${json(job.geometry)}, ${json(job.labels)}, ${quote(job.createdAt)}, ${quote(job.createdAt)})`));
  statements.push(...state.audit.map((entry) => `INSERT INTO audit_entries(id, actor_id, entity_type, entity_id, action, changes_json, created_at, updated_at) VALUES (${quote(entry.id)}, ${quote(userIds.has(entry.actorId) ? entry.actorId : undefined)}, ${quote(entry.entity)}, ${quote(entry.entityId)}, ${quote(entry.action)}, ${json(entry.changes)}, ${quote(entry.createdAt)}, ${quote(entry.createdAt)})${options.preserveSessions ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.notifications.filter((notification) => notification.channel === "webapp").map((notification) => `INSERT INTO webapp_notifications(id, recipient_user_id, type, payload_json, is_read, created_at, read_at, updated_at) VALUES (${quote(notification.id)}, ${quote(notification.userId)}, ${quote(notification.type)}, ${json({ schemaVersion: 1, value: notification.payload })}, ${notification.read ? 1 : 0}, ${quote(notification.createdAt)}, ${quote(notification.read ? notification.createdAt : undefined)}, ${quote(notification.createdAt)})`));
  statements.push(...state.notifications.filter((notification) => notification.channel === "telegram").map((notification) => `INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, sent_at, created_at, updated_at) VALUES (${quote(notification.id)}, 'telegram', ${quote(notification.userId)}, ${quote(notification.type)}, ${json({ schemaVersion: 1, value: notification.payload })}, 'sent', ${quote(notification.createdAt)}, ${quote(notification.createdAt)}, ${quote(notification.createdAt)})${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.outbox.map((message) => `INSERT INTO outbox_messages(id, channel, recipient_user_id, type, payload_json, status, idempotency_key, attempt_count, max_attempts, available_at, last_error, last_error_code, sent_at, created_at, updated_at) VALUES (${quote(message.id)}, ${quote(message.channel)}, ${quote(message.userId)}, ${quote(message.type)}, ${json({ schemaVersion: 1, value: message.payload })}, ${quote(message.status === "processing" ? "pending" : message.status)}, ${quote(message.idempotencyKey)}, ${message.attemptCount}, ${Math.max(8, message.attemptCount)}, ${quote(message.availableAt)}, ${quote(message.lastError)}, ${quote(message.status === "processing" ? "RECOVERED_LEGACY_PROCESSING" : undefined)}, ${quote(message.sentAt)}, ${quote(message.createdAt)}, ${quote(message.sentAt || message.createdAt)})${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`));
  statements.push(...state.notificationPreferences.map((preference) => `INSERT INTO notification_preferences(user_id, channel, event_type, delivery_mode, updated_at) VALUES (${quote(preference.userId)}, ${quote(preference.channel)}, ${quote(preference.eventType)}, ${quote(preference.deliveryMode)}, datetime('now'))`));
  statements.push(...Object.entries(state.idempotency).map(([key, response]) => {
    const separator = key.indexOf(":");
    const scope = separator < 0 ? "legacy" : key.slice(0, separator);
    const idempotencyKey = separator < 0 ? key : key.slice(separator + 1);
    return `INSERT INTO idempotency_keys(scope, key, request_hash, status, response_status, response_json, created_at, completed_at, updated_at) VALUES (${quote(scope)}, ${quote(idempotencyKey)}, ${quote(`legacy:${key}`)}, 'completed', 200, ${json(response)}, datetime('now'), datetime('now'), datetime('now'))${options.preserveCommandTables ? " ON CONFLICT DO NOTHING" : ""}`;
  }));
  statements.push("CREATE TRIGGER product_price_history_immutable_delete BEFORE DELETE ON product_price_history BEGIN SELECT RAISE(ABORT, 'price history is immutable'); END", "COMMIT", "PRAGMA foreign_keys = ON");
  return statements.join(";\n");
}
