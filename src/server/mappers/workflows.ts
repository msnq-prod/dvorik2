import type { NotificationPreference, OutboxMessage, ProductMerge, SupplyImport } from "../../shared/types";
import type {
  IdempotencyRecord,
  JsonObject,
  JsonValue,
  RepositoryAuditEntry,
  RepositoryNotification,
  RepositoryOutboxMessage,
  RepositoryRecord,
  Revision,
  UtcTimestamp,
  VersionedPayload
} from "../repositories";
import {
  enumValue,
  integer,
  nullableString,
  nullableUtcTimestamp,
  requiredString,
  RowMappingError,
  rowIdentity,
  serializeVersionedJson,
  toNullable,
  utcTimestamp,
  versionedJson,
  type DatabaseRow,
  type PersistedRow
} from "./core";

const importStatuses = ["previewed", "committed", "reverted", "failed"] as const;
const importRowStatuses = ["pending", "valid", "invalid", "committed", "skipped"] as const;
const mergeStatuses = ["previewed", "committed", "reverted", "failed"] as const;
const labelStatuses = ["created", "queued", "processing", "completed", "failed", "cancelled"] as const;
const channels = ["telegram", "webapp"] as const;
const deliveryModes = ["off", "instant", "daily"] as const;
const outboxStatuses = ["pending", "processing", "sent", "failed", "cancelled"] as const;
const idempotencyStatuses = ["processing", "completed", "failed"] as const;

export type ImportPersistence = Readonly<{
  id: string;
  status: SupplyImport["status"];
  fileName: string;
  contentHash: string;
  actorId?: string;
  source: VersionedPayload<JsonObject>;
  migrationBatchId?: string;
  preview: VersionedPayload<JsonObject>;
  result: VersionedPayload<JsonObject>;
  createdAt: UtcTimestamp;
  committedAt?: UtcTimestamp;
  revertedAt?: UtcTimestamp;
  updatedAt: UtcTimestamp;
}>;

export type ImportRowPersistence = Readonly<{
  id: string;
  importId: string;
  rowNumber: number;
  raw: VersionedPayload<JsonObject>;
  normalized: VersionedPayload<JsonObject>;
  status: (typeof importRowStatuses)[number];
  errors: VersionedPayload<JsonValue[]>;
  productId?: string;
  updatedAt: UtcTimestamp;
}>;

export type MergeJobPersistence = Readonly<{
  id: string;
  status: ProductMerge["status"] | "failed";
  sourceProductId: string;
  targetProductId: string;
  actorId?: string;
  snapshot: VersionedPayload<JsonObject>;
  result: VersionedPayload<JsonObject>;
  createdAt: UtcTimestamp;
  committedAt?: UtcTimestamp;
  revertedAt?: UtcTimestamp;
  updatedAt: UtcTimestamp;
}>;

export type LabelJobPersistence = Readonly<{
  id: string;
  actorId?: string;
  status: (typeof labelStatuses)[number];
  templateId: string;
  geometry: VersionedPayload<JsonObject>;
  labels: VersionedPayload<JsonValue[]>;
  result: VersionedPayload<JsonObject>;
  createdAt: UtcTimestamp;
  completedAt?: UtcTimestamp;
  updatedAt: UtcTimestamp;
}>;

export type NotificationPreferencePersistence = Readonly<{
  preference: NotificationPreference;
  updatedAt: UtcTimestamp;
}>;

export type WebappNotificationPersistence = Readonly<{
  notification: RepositoryNotification;
  readAt?: UtcTimestamp;
  updatedAt: UtcTimestamp;
}>;

export type OutboxMessagePersistence = RepositoryOutboxMessage & Readonly<{
  lastErrorCode?: string;
  updatedAt: UtcTimestamp;
}>;

export type AuditEntryPersistence = RepositoryAuditEntry & Readonly<{ updatedAt: UtcTimestamp }>;
export type IdempotencyKeyPersistence = IdempotencyRecord & Readonly<{ updatedAt: UtcTimestamp }>;

function assertIdempotencyConsistency(value: IdempotencyKeyPersistence) {
  const entityId = `${value.scope}/${value.key}`;
  if (value.status === "processing") {
    if (value.responseStatus !== undefined) throw new RowMappingError("idempotency_keys", entityId, "response_status", "TYPE");
    if (value.response !== undefined) throw new RowMappingError("idempotency_keys", entityId, "response_json", "TYPE");
    if (value.completedAt !== undefined) throw new RowMappingError("idempotency_keys", entityId, "completed_at", "TYPE");
    return;
  }
  if (value.responseStatus === undefined) throw new RowMappingError("idempotency_keys", entityId, "response_status", "MISSING");
  if (value.responseStatus < 100 || value.responseStatus > 599) throw new RowMappingError("idempotency_keys", entityId, "response_status", "INTEGER");
  if (value.response === undefined) throw new RowMappingError("idempotency_keys", entityId, "response_json", "MISSING");
  if (value.completedAt === undefined) throw new RowMappingError("idempotency_keys", entityId, "completed_at", "MISSING");
}

function assertOutboxConsistency(value: OutboxMessagePersistence) {
  if (value.attemptCount > value.maxAttempts) {
    throw new RowMappingError("outbox_messages", value.id, "attempt_count", "INTEGER");
  }
  const leaseFields = [value.leaseOwner, value.leaseToken, value.leaseExpiresAt];
  const completeLease = leaseFields.every((field) => field !== undefined);
  const emptyLease = leaseFields.every((field) => field === undefined);
  if (value.status === "processing" && !completeLease) throw new RowMappingError("outbox_messages", value.id, "lease_token", "MISSING");
  if (value.status !== "processing" && !emptyLease) throw new RowMappingError("outbox_messages", value.id, "lease_token", "TYPE");
}

function revision(entity: string, row: DatabaseRow, identityFields?: readonly string[]): Revision {
  return String(nonNegativeInteger(entity, row, "version", identityFields));
}

function revisionVersion(entity: string, entityId: string, value: Revision) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new RowMappingError(entity, entityId, "version", "INTEGER");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RowMappingError(entity, entityId, "version", "INTEGER");
  return parsed;
}

function jsonObject(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]): VersionedPayload<JsonObject> {
  const payload = versionedJson<JsonValue>(entity, row, field, identityFields);
  if (payload.value === null || Array.isArray(payload.value) || typeof payload.value !== "object") {
    throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "JSON");
  }
  return { schemaVersion: payload.schemaVersion, value: payload.value as JsonObject };
}

function jsonArray(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]): VersionedPayload<JsonValue[]> {
  const payload = versionedJson<JsonValue>(entity, row, field, identityFields);
  if (!Array.isArray(payload.value)) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "JSON");
  return { schemaVersion: payload.schemaVersion, value: payload.value };
}

function positiveInteger(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = integer(entity, row, field, identityFields);
  if (value <= 0) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "INTEGER");
  return value;
}

function nonNegativeInteger(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = integer(entity, row, field, identityFields);
  if (value < 0) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "INTEGER");
  return value;
}

export function importFromRow(row: DatabaseRow): RepositoryRecord<ImportPersistence> {
  const entity = "imports";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      status: enumValue(entity, row, "status", importStatuses),
      fileName: requiredString(entity, row, "file_name"),
      contentHash: requiredString(entity, row, "content_hash"),
      actorId: nullableString(entity, row, "actor_id"),
      source: jsonObject(entity, row, "source_json"),
      migrationBatchId: nullableString(entity, row, "migration_batch_id"),
      preview: jsonObject(entity, row, "preview_json"),
      result: jsonObject(entity, row, "result_json"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      committedAt: nullableUtcTimestamp(entity, row, "committed_at"),
      revertedAt: nullableUtcTimestamp(entity, row, "reverted_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function importToRow(record: RepositoryRecord<ImportPersistence>): PersistedRow {
  const value = record.entity;
  return {
    id: value.id,
    status: value.status,
    file_name: value.fileName,
    content_hash: value.contentHash,
    actor_id: toNullable(value.actorId),
    source_json: serializeVersionedJson(value.source),
    migration_batch_id: toNullable(value.migrationBatchId),
    preview_json: serializeVersionedJson(value.preview),
    result_json: serializeVersionedJson(value.result),
    created_at: value.createdAt,
    committed_at: toNullable(value.committedAt),
    reverted_at: toNullable(value.revertedAt),
    version: revisionVersion("imports", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

export function importRowFromRow(row: DatabaseRow): RepositoryRecord<ImportRowPersistence> {
  const entity = "import_rows";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      importId: requiredString(entity, row, "import_id"),
      rowNumber: positiveInteger(entity, row, "row_number"),
      raw: jsonObject(entity, row, "raw_json"),
      normalized: jsonObject(entity, row, "normalized_json"),
      status: enumValue(entity, row, "status", importRowStatuses),
      errors: jsonArray(entity, row, "error_json"),
      productId: nullableString(entity, row, "product_id"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function importRowToRow(record: RepositoryRecord<ImportRowPersistence>): PersistedRow {
  const value = record.entity;
  return {
    id: value.id,
    import_id: value.importId,
    row_number: value.rowNumber,
    raw_json: serializeVersionedJson(value.raw),
    normalized_json: serializeVersionedJson(value.normalized),
    status: value.status,
    error_json: serializeVersionedJson(value.errors),
    product_id: toNullable(value.productId),
    version: revisionVersion("import_rows", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

export function mergeJobFromRow(row: DatabaseRow): RepositoryRecord<MergeJobPersistence> {
  const entity = "merge_jobs";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      status: enumValue(entity, row, "status", mergeStatuses),
      sourceProductId: requiredString(entity, row, "source_product_id"),
      targetProductId: requiredString(entity, row, "target_product_id"),
      actorId: nullableString(entity, row, "actor_id"),
      snapshot: jsonObject(entity, row, "snapshot_json"),
      result: jsonObject(entity, row, "result_json"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      committedAt: nullableUtcTimestamp(entity, row, "committed_at"),
      revertedAt: nullableUtcTimestamp(entity, row, "reverted_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function mergeJobToRow(record: RepositoryRecord<MergeJobPersistence>): PersistedRow {
  const value = record.entity;
  return {
    id: value.id,
    status: value.status,
    source_product_id: value.sourceProductId,
    target_product_id: value.targetProductId,
    actor_id: toNullable(value.actorId),
    snapshot_json: serializeVersionedJson(value.snapshot),
    result_json: serializeVersionedJson(value.result),
    created_at: value.createdAt,
    committed_at: toNullable(value.committedAt),
    reverted_at: toNullable(value.revertedAt),
    version: revisionVersion("merge_jobs", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

export function labelJobFromRow(row: DatabaseRow): RepositoryRecord<LabelJobPersistence> {
  const entity = "label_jobs";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      actorId: nullableString(entity, row, "actor_id"),
      status: enumValue(entity, row, "status", labelStatuses),
      templateId: requiredString(entity, row, "template_id"),
      geometry: jsonObject(entity, row, "geometry_json"),
      labels: jsonArray(entity, row, "labels_json"),
      result: jsonObject(entity, row, "result_json"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      completedAt: nullableUtcTimestamp(entity, row, "completed_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function labelJobToRow(record: RepositoryRecord<LabelJobPersistence>): PersistedRow {
  const value = record.entity;
  return {
    id: value.id,
    actor_id: toNullable(value.actorId),
    status: value.status,
    template_id: value.templateId,
    geometry_json: serializeVersionedJson(value.geometry),
    labels_json: serializeVersionedJson(value.labels),
    result_json: serializeVersionedJson(value.result),
    created_at: value.createdAt,
    completed_at: toNullable(value.completedAt),
    version: revisionVersion("label_jobs", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

const notificationPreferenceIdentity = ["user_id", "channel", "event_type"] as const;

export function notificationPreferenceFromRow(row: DatabaseRow): RepositoryRecord<NotificationPreferencePersistence> {
  const entity = "notification_preferences";
  return {
    revision: revision(entity, row, notificationPreferenceIdentity),
    entity: {
      preference: {
        userId: requiredString(entity, row, "user_id", notificationPreferenceIdentity),
        channel: enumValue(entity, row, "channel", channels, notificationPreferenceIdentity),
        eventType: requiredString(entity, row, "event_type", notificationPreferenceIdentity),
        deliveryMode: enumValue(entity, row, "delivery_mode", deliveryModes, notificationPreferenceIdentity)
      },
      updatedAt: utcTimestamp(entity, row, "updated_at", notificationPreferenceIdentity)
    }
  };
}

export function notificationPreferenceToRow(record: RepositoryRecord<NotificationPreferencePersistence>): PersistedRow {
  const { preference, updatedAt } = record.entity;
  return {
    user_id: preference.userId,
    channel: preference.channel,
    event_type: preference.eventType,
    delivery_mode: preference.deliveryMode,
    updated_at: updatedAt,
    version: revisionVersion("notification_preferences", `${preference.userId}/${preference.channel}/${preference.eventType}`, record.revision)
  };
}

export function webappNotificationFromRow(row: DatabaseRow): RepositoryRecord<WebappNotificationPersistence> {
  const entity = "webapp_notifications";
  const isRead = integer(entity, row, "is_read");
  if (isRead !== 0 && isRead !== 1) throw new RowMappingError(entity, rowIdentity(row), "is_read", "ENUM");
  return {
    revision: revision(entity, row),
    entity: {
      notification: {
        id: requiredString(entity, row, "id"),
        channel: "webapp",
        userId: requiredString(entity, row, "recipient_user_id"),
        type: requiredString(entity, row, "type"),
        payload: jsonObject(entity, row, "payload_json"),
        read: isRead === 1,
        createdAt: utcTimestamp(entity, row, "created_at")
      },
      readAt: nullableUtcTimestamp(entity, row, "read_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function webappNotificationToRow(record: RepositoryRecord<WebappNotificationPersistence>): PersistedRow {
  const { notification, readAt, updatedAt } = record.entity;
  if (notification.channel !== "webapp") throw new RowMappingError("webapp_notifications", notification.id, "channel", "ENUM");
  return {
    id: notification.id,
    recipient_user_id: notification.userId,
    type: notification.type,
    payload_json: serializeVersionedJson(notification.payload),
    is_read: notification.read ? 1 : 0,
    created_at: notification.createdAt,
    read_at: toNullable(readAt),
    version: revisionVersion("webapp_notifications", notification.id, record.revision),
    updated_at: updatedAt
  };
}

export function outboxMessageFromRow(row: DatabaseRow): RepositoryRecord<OutboxMessagePersistence> {
  const entity = "outbox_messages";
  const record: RepositoryRecord<OutboxMessagePersistence> = {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      channel: enumValue(entity, row, "channel", channels),
      userId: requiredString(entity, row, "recipient_user_id"),
      type: requiredString(entity, row, "type"),
      payload: jsonObject(entity, row, "payload_json"),
      status: enumValue(entity, row, "status", outboxStatuses) as OutboxMessage["status"],
      idempotencyKey: nullableString(entity, row, "idempotency_key"),
      attemptCount: nonNegativeInteger(entity, row, "attempt_count"),
      maxAttempts: positiveInteger(entity, row, "max_attempts"),
      availableAt: utcTimestamp(entity, row, "available_at"),
      lastError: nullableString(entity, row, "last_error"),
      lastErrorCode: nullableString(entity, row, "last_error_code"),
      leaseOwner: nullableString(entity, row, "lease_owner"),
      leaseToken: nullableString(entity, row, "lease_token"),
      leaseExpiresAt: nullableUtcTimestamp(entity, row, "lease_expires_at"),
      failedAt: nullableUtcTimestamp(entity, row, "failed_at"),
      sentAt: nullableUtcTimestamp(entity, row, "sent_at"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
  assertOutboxConsistency(record.entity);
  return record;
}

export function outboxMessageToRow(record: RepositoryRecord<OutboxMessagePersistence>): PersistedRow {
  const value = record.entity;
  assertOutboxConsistency(value);
  return {
    id: value.id,
    channel: value.channel,
    recipient_user_id: value.userId,
    type: value.type,
    payload_json: serializeVersionedJson(value.payload),
    status: value.status,
    idempotency_key: toNullable(value.idempotencyKey),
    attempt_count: value.attemptCount,
    max_attempts: value.maxAttempts,
    available_at: value.availableAt,
    last_error: toNullable(value.lastError),
    last_error_code: toNullable(value.lastErrorCode),
    lease_owner: toNullable(value.leaseOwner),
    lease_token: toNullable(value.leaseToken),
    lease_expires_at: toNullable(value.leaseExpiresAt),
    failed_at: toNullable(value.failedAt),
    sent_at: toNullable(value.sentAt),
    created_at: value.createdAt,
    version: revisionVersion("outbox_messages", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

export function auditEntryFromRow(row: DatabaseRow): RepositoryRecord<AuditEntryPersistence> {
  const entity = "audit_entries";
  return {
    revision: revision(entity, row),
    entity: {
      id: requiredString(entity, row, "id"),
      actorId: nullableString(entity, row, "actor_id"),
      entity: requiredString(entity, row, "entity_type"),
      entityId: requiredString(entity, row, "entity_id"),
      action: requiredString(entity, row, "action"),
      changes: jsonObject(entity, row, "changes_json"),
      requestId: nullableString(entity, row, "request_id"),
      createdAt: utcTimestamp(entity, row, "created_at"),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    }
  };
}

export function auditEntryToRow(record: RepositoryRecord<AuditEntryPersistence>): PersistedRow {
  const value = record.entity;
  return {
    id: value.id,
    actor_id: toNullable(value.actorId),
    entity_type: value.entity,
    entity_id: value.entityId,
    action: value.action,
    changes_json: serializeVersionedJson(value.changes),
    request_id: toNullable(value.requestId),
    created_at: value.createdAt,
    version: revisionVersion("audit_entries", value.id, record.revision),
    updated_at: value.updatedAt
  };
}

const idempotencyIdentity = ["scope", "key"] as const;

export function idempotencyKeyFromRow(row: DatabaseRow): RepositoryRecord<IdempotencyKeyPersistence> {
  const entity = "idempotency_keys";
  const record: RepositoryRecord<IdempotencyKeyPersistence> = {
    revision: revision(entity, row, idempotencyIdentity),
    entity: {
      scope: requiredString(entity, row, "scope", idempotencyIdentity),
      key: requiredString(entity, row, "key", idempotencyIdentity),
      requestHash: requiredString(entity, row, "request_hash", idempotencyIdentity),
      status: enumValue(entity, row, "status", idempotencyStatuses, idempotencyIdentity),
      responseStatus: row.response_status === null || row.response_status === undefined
        ? undefined
        : integer(entity, row, "response_status", idempotencyIdentity),
      response: row.response_json === null || row.response_json === undefined
        ? undefined
        : versionedJson<JsonValue>(entity, row, "response_json", idempotencyIdentity),
      createdAt: utcTimestamp(entity, row, "created_at", idempotencyIdentity),
      completedAt: nullableUtcTimestamp(entity, row, "completed_at", idempotencyIdentity),
      expiresAt: nullableUtcTimestamp(entity, row, "expires_at", idempotencyIdentity),
      updatedAt: utcTimestamp(entity, row, "updated_at", idempotencyIdentity)
    }
  };
  assertIdempotencyConsistency(record.entity);
  return record;
}

export function idempotencyKeyToRow(record: RepositoryRecord<IdempotencyKeyPersistence>): PersistedRow {
  const value = record.entity;
  assertIdempotencyConsistency(value);
  return {
    scope: value.scope,
    key: value.key,
    request_hash: value.requestHash,
    status: value.status,
    response_status: value.responseStatus ?? null,
    response_json: value.response ? serializeVersionedJson(value.response) : null,
    created_at: value.createdAt,
    completed_at: toNullable(value.completedAt),
    expires_at: toNullable(value.expiresAt),
    version: revisionVersion("idempotency_keys", `${value.scope}/${value.key}`, record.revision),
    updated_at: value.updatedAt
  };
}
