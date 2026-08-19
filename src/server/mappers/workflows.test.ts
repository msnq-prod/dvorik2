import assert from "node:assert/strict";
import type { JsonObject, JsonValue, RepositoryRecord, VersionedPayload } from "../repositories";
import { RowMappingError, type DatabaseRow } from "./core";
import {
  auditEntryFromRow,
  auditEntryToRow,
  idempotencyKeyFromRow,
  idempotencyKeyToRow,
  importFromRow,
  importRowFromRow,
  importRowToRow,
  importToRow,
  labelJobFromRow,
  labelJobToRow,
  mergeJobFromRow,
  mergeJobToRow,
  notificationPreferenceFromRow,
  notificationPreferenceToRow,
  outboxMessageFromRow,
  outboxMessageToRow,
  webappNotificationFromRow,
  webappNotificationToRow,
  type AuditEntryPersistence,
  type IdempotencyKeyPersistence,
  type ImportPersistence,
  type ImportRowPersistence,
  type LabelJobPersistence,
  type MergeJobPersistence,
  type NotificationPreferencePersistence,
  type OutboxMessagePersistence,
  type WebappNotificationPersistence
} from "./workflows";

const objectPayload = (value: JsonObject): VersionedPayload<JsonObject> => ({ schemaVersion: 1, value });
const arrayPayload = (value: JsonValue[]): VersionedPayload<JsonValue[]> => ({ schemaVersion: 1, value });

const importRecord: RepositoryRecord<ImportPersistence> = {
  revision: "1",
  entity: {
    id: "import-1",
    status: "committed",
    fileName: "supply.csv",
    contentHash: "sha256:abc",
    actorId: undefined,
    source: objectPayload({ transport: "upload" }),
    migrationBatchId: "migration-batch-1",
    preview: objectPayload({ rows: [{ name: "Чай", quantity: "2" }] }),
    result: objectPayload({ createdProducts: 1, receipts: 1 }),
    createdAt: "2026-07-12T00:00:00.000Z",
    committedAt: "2026-07-12T00:01:00.000Z",
    revertedAt: undefined,
    updatedAt: "2026-07-12T00:01:00.000Z"
  }
};
assert.deepEqual(importFromRow(importToRow(importRecord)), importRecord);

const importRowRecord: RepositoryRecord<ImportRowPersistence> = {
  revision: "2",
  entity: {
    id: "import-1:1",
    importId: "import-1",
    rowNumber: 1,
    raw: objectPayload({ name: "Чай", quantity: "2" }),
    normalized: objectPayload({ name: "Чай", quantity: 2, unit: "шт" }),
    status: "committed",
    errors: arrayPayload([]),
    productId: "product-1",
    updatedAt: "2026-07-12T00:01:00.000Z"
  }
};
assert.deepEqual(importRowFromRow(importRowToRow(importRowRecord)), importRowRecord);

const mergeRecord: RepositoryRecord<MergeJobPersistence> = {
  revision: "3",
  entity: {
    id: "merge-1",
    status: "previewed",
    sourceProductId: "product-old",
    targetProductId: "product-new",
    actorId: undefined,
    snapshot: objectPayload({ sourceProductId: "product-old", targetProductId: "product-new" }),
    result: objectPayload({}),
    createdAt: "2026-07-12T01:00:00.000Z",
    committedAt: undefined,
    revertedAt: undefined,
    updatedAt: "2026-07-12T01:00:00.000Z"
  }
};
assert.deepEqual(mergeJobFromRow(mergeJobToRow(mergeRecord)), mergeRecord);

const labelRecord: RepositoryRecord<LabelJobPersistence> = {
  revision: "4",
  entity: {
    id: "label-1",
    actorId: undefined,
    status: "completed",
    templateId: "template-1",
    geometry: objectPayload({ widthMm: 58, heightMm: 40 }),
    labels: arrayPayload([{ productId: "product-1", quantity: 2 }]),
    result: objectPayload({ pages: 1 }),
    createdAt: "2026-07-12T02:00:00.000Z",
    completedAt: "2026-07-12T02:00:01.000Z",
    updatedAt: "2026-07-12T02:00:01.000Z"
  }
};
assert.deepEqual(labelJobFromRow(labelJobToRow(labelRecord)), labelRecord);

const preferenceRecord: RepositoryRecord<NotificationPreferencePersistence> = {
  revision: "5",
  entity: {
    preference: { userId: "user-1", channel: "telegram", eventType: "stock.low", deliveryMode: "instant" },
    updatedAt: "2026-07-12T03:00:00.000Z"
  }
};
assert.deepEqual(notificationPreferenceFromRow(notificationPreferenceToRow(preferenceRecord)), preferenceRecord);

const notificationRecord: RepositoryRecord<WebappNotificationPersistence> = {
  revision: "6",
  entity: {
    notification: {
      id: "notification-1",
      channel: "webapp",
      userId: "user-1",
      type: "stock.low",
      payload: objectPayload({ productId: "product-1" }),
      read: true,
      createdAt: "2026-07-12T03:30:00.000Z"
    },
    readAt: "2026-07-12T03:31:00.000Z",
    updatedAt: "2026-07-12T03:31:00.000Z"
  }
};
assert.deepEqual(webappNotificationFromRow(webappNotificationToRow(notificationRecord)), notificationRecord);

const outboxRecord: RepositoryRecord<OutboxMessagePersistence> = {
  revision: "7",
  entity: {
    id: "outbox-1",
    channel: "telegram",
    userId: "user-1",
    type: "report_pdf",
    payload: objectPayload({ fileName: "report.pdf" }),
    status: "failed",
    attemptCount: 5,
    maxAttempts: 8,
    availableAt: "2026-07-12T04:00:00.000Z",
    lastError: "Transport timeout",
    lastErrorCode: "TRANSPORT_TIMEOUT",
    sentAt: undefined,
    createdAt: "2026-07-12T04:00:00.000Z",
    idempotencyKey: undefined,
    leaseOwner: undefined,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    failedAt: "2026-07-12T04:05:00.000Z",
    updatedAt: "2026-07-12T04:00:00.000Z"
  }
};
assert.deepEqual(outboxMessageFromRow(outboxMessageToRow(outboxRecord)), outboxRecord);
const processingOutboxRecord: RepositoryRecord<OutboxMessagePersistence> = {
  revision: "8",
  entity: {
    ...outboxRecord.entity,
    id: "outbox-2",
    status: "processing",
    attemptCount: 1,
    lastError: undefined,
    lastErrorCode: undefined,
    leaseOwner: "worker-1",
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-07-12T04:01:00.000Z",
    failedAt: undefined
  }
};
assert.deepEqual(outboxMessageFromRow(outboxMessageToRow(processingOutboxRecord)), processingOutboxRecord);

const auditRecord: RepositoryRecord<AuditEntryPersistence> = {
  revision: "8",
  entity: {
    id: "audit-1",
    actorId: undefined,
    entity: "stock_operation",
    entityId: "operation-1",
    action: "create",
    changes: objectPayload({ quantity: 2 }),
    requestId: undefined,
    createdAt: "2026-07-12T05:00:00.000Z",
    updatedAt: "2026-07-12T05:00:00.000Z"
  }
};
assert.deepEqual(auditEntryFromRow(auditEntryToRow(auditRecord)), auditRecord);

const idempotencyRecord: RepositoryRecord<IdempotencyKeyPersistence> = {
  revision: "9",
  entity: {
    scope: "stock",
    key: "request-1",
    requestHash: "sha256:def",
    status: "processing",
    responseStatus: undefined,
    response: undefined,
    createdAt: "2026-07-12T06:00:00.000Z",
    completedAt: undefined,
    expiresAt: undefined,
    updatedAt: "2026-07-12T06:00:00.000Z"
  }
};
assert.deepEqual(idempotencyKeyFromRow(idempotencyKeyToRow(idempotencyRecord)), idempotencyRecord);

const completedIdempotency: RepositoryRecord<IdempotencyKeyPersistence> = {
  revision: "10",
  entity: {
    scope: "stock",
    key: "request-2",
    requestHash: "sha256:ghi",
    status: "completed",
    responseStatus: 201,
    response: { schemaVersion: 1, value: { operationId: "operation-1" } },
    createdAt: "2026-07-12T06:00:00.000Z",
    completedAt: "2026-07-12T06:00:01.000Z",
    expiresAt: "2026-07-13T06:00:00.000Z",
    updatedAt: "2026-07-12T06:00:01.000Z"
  }
};
assert.deepEqual(idempotencyKeyFromRow(idempotencyKeyToRow(completedIdempotency)), completedIdempotency);

const legacyImportRow = {
  ...importToRow(importRecord),
  preview_json: JSON.stringify({ rows: [] }),
  created_at: "2026-07-12 00:00:00",
  updated_at: "2026-07-12 00:01:00"
};
const legacyImport = importFromRow(legacyImportRow);
assert.deepEqual(legacyImport.entity.preview, objectPayload({ rows: [] }));
assert.equal(legacyImport.entity.createdAt, "2026-07-12T00:00:00.000Z");
assert.equal(legacyImport.entity.updatedAt, "2026-07-12T00:01:00.000Z");
assert.equal("revision" in importToRow(importRecord), false);
assert.equal(importToRow(importRecord).version, 1);

function mappingError(input: () => unknown, expected: Pick<RowMappingError, "entity" | "entityId" | "field" | "code">) {
  assert.throws(input, (error) => error instanceof RowMappingError
    && error.entity === expected.entity
    && error.entityId === expected.entityId
    && error.field === expected.field
    && error.code === expected.code);
}

mappingError(
  () => importFromRow({ ...importToRow(importRecord), preview_json: "{" }),
  { entity: "imports", entityId: "import-1", field: "preview_json", code: "JSON" }
);
mappingError(
  () => importFromRow({ ...importToRow(importRecord), preview_json: JSON.stringify({ schemaVersion: 2, value: {} }) }),
  { entity: "imports", entityId: "import-1", field: "preview_json", code: "JSON_VERSION" }
);
mappingError(
  () => labelJobFromRow({ ...labelJobToRow(labelRecord), labels_json: JSON.stringify({ schemaVersion: 1, value: {} }) }),
  { entity: "label_jobs", entityId: "label-1", field: "labels_json", code: "JSON" }
);
mappingError(
  () => importRowFromRow({ ...importRowToRow(importRowRecord), row_number: 0 }),
  { entity: "import_rows", entityId: "import-1:1", field: "row_number", code: "INTEGER" }
);
mappingError(
  () => mergeJobFromRow({ ...mergeJobToRow(mergeRecord), status: "unknown" }),
  { entity: "merge_jobs", entityId: "merge-1", field: "status", code: "ENUM" }
);
mappingError(
  () => notificationPreferenceFromRow({ ...notificationPreferenceToRow(preferenceRecord), delivery_mode: "weekly" }),
  { entity: "notification_preferences", entityId: "user-1/telegram/stock.low", field: "delivery_mode", code: "ENUM" }
);
mappingError(
  () => outboxMessageFromRow({ ...outboxMessageToRow(outboxRecord), max_attempts: undefined }),
  { entity: "outbox_messages", entityId: "outbox-1", field: "max_attempts", code: "INTEGER" }
);
mappingError(
  () => outboxMessageFromRow({ ...outboxMessageToRow(outboxRecord), attempt_count: -1 }),
  { entity: "outbox_messages", entityId: "outbox-1", field: "attempt_count", code: "INTEGER" }
);
mappingError(
  () => outboxMessageFromRow({ ...outboxMessageToRow(outboxRecord), attempt_count: 9, max_attempts: 8 }),
  { entity: "outbox_messages", entityId: "outbox-1", field: "attempt_count", code: "INTEGER" }
);
mappingError(
  () => outboxMessageFromRow({ ...outboxMessageToRow(outboxRecord), status: "processing" }),
  { entity: "outbox_messages", entityId: "outbox-1", field: "lease_token", code: "MISSING" }
);
mappingError(
  () => outboxMessageFromRow({ ...outboxMessageToRow(processingOutboxRecord), status: "pending" }),
  { entity: "outbox_messages", entityId: "outbox-2", field: "lease_token", code: "TYPE" }
);
mappingError(
  () => auditEntryFromRow({ ...auditEntryToRow(auditRecord), version: -1 }),
  { entity: "audit_entries", entityId: "audit-1", field: "version", code: "INTEGER" }
);
mappingError(
  () => auditEntryToRow({ ...auditRecord, revision: "not-a-version" }),
  { entity: "audit_entries", entityId: "audit-1", field: "version", code: "INTEGER" }
);
mappingError(
  () => idempotencyKeyFromRow({ ...idempotencyKeyToRow(idempotencyRecord), response_json: "not-json" }),
  { entity: "idempotency_keys", entityId: "stock/request-1", field: "response_json", code: "JSON" }
);

const nullableOutboxRow: DatabaseRow = {
  ...outboxMessageToRow(outboxRecord),
  last_error: null,
  last_error_code: null,
  sent_at: null,
  failed_at: null,
  lease_expires_at: null
};
const nullableOutbox = outboxMessageFromRow(nullableOutboxRow).entity;
assert.equal(nullableOutbox.lastError, undefined);
assert.equal(nullableOutbox.lastErrorCode, undefined);
assert.equal(nullableOutbox.sentAt, undefined);
assert.equal(nullableOutbox.failedAt, undefined);
assert.equal(nullableOutbox.leaseExpiresAt, undefined);

console.log("workflow mapper tests passed");
