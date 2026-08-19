import type {
  JsonObject,
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
  rowIdentity,
  RowMappingError,
  serializeVersionedJson,
  toNullable,
  utcTimestamp,
  versionedJson,
  type DatabaseRow,
  type PersistedRow
} from "./core";

const MIGRATION_BATCH_STATUSES = ["started", "completed", "failed"] as const;
const TELEGRAM_UPDATE_STATUSES = ["received", "processing", "processed", "failed"] as const;

export type MigrationBatchRow = Readonly<{
  id: string;
  sourceType: string;
  sourceRef: string;
  sourceChecksum: string;
  status: (typeof MIGRATION_BATCH_STATUSES)[number];
  report: VersionedPayload<JsonObject>;
  startedAt: UtcTimestamp;
  completedAt?: UtcTimestamp;
  version: number;
  updatedAt: UtcTimestamp;
  revision: Revision;
}>;

export type TelegramUpdateRow = Readonly<{
  updateId: string;
  payload: VersionedPayload<JsonObject>;
  status: (typeof TELEGRAM_UPDATE_STATUSES)[number];
  attemptCount: number;
  lastErrorCode?: string;
  receivedAt: UtcTimestamp;
  processedAt?: UtcTimestamp;
  version: number;
  updatedAt: UtcTimestamp;
  revision: Revision;
}>;

function nonNegativeInteger(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = integer(entity, row, field, identityFields);
  if (value < 0) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "INTEGER");
  return value;
}

function versionAndRevision(entity: string, row: DatabaseRow, identityFields?: readonly string[]) {
  const version = nonNegativeInteger(entity, row, "version", identityFields);
  return { version, revision: String(version) };
}

function versionForWrite(entity: string, entityId: string, version: number, revision: Revision) {
  if (!Number.isSafeInteger(version) || version < 0 || revision !== String(version)) {
    throw new RowMappingError(entity, entityId, "version", "INTEGER");
  }
  return version;
}

function requiredId(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = requiredString(entity, row, field, identityFields);
  if (!value.trim()) throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "TYPE");
  return value;
}

function jsonObject(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const payload = versionedJson<JsonObject>(entity, row, field, identityFields);
  if (payload.value === null || Array.isArray(payload.value) || typeof payload.value !== "object") {
    throw new RowMappingError(entity, rowIdentity(row, identityFields), field, "JSON");
  }
  return payload;
}

function timestampForWrite(entity: string, entityId: string, field: string, value: UtcTimestamp) {
  return utcTimestamp(entity, { id: entityId, [field]: value }, field);
}

function optionalTimestampForWrite(entity: string, entityId: string, field: string, value: UtcTimestamp | undefined) {
  return value === undefined ? null : timestampForWrite(entity, entityId, field, value);
}

export const migrationBatchMapper = {
  fromRow(row: DatabaseRow): MigrationBatchRow {
    const entity = "migration_batches";
    return {
      id: requiredId(entity, row, "id"),
      sourceType: requiredString(entity, row, "source_type"),
      sourceRef: requiredString(entity, row, "source_ref"),
      sourceChecksum: requiredString(entity, row, "source_checksum"),
      status: enumValue(entity, row, "status", MIGRATION_BATCH_STATUSES),
      report: jsonObject(entity, row, "report_json"),
      startedAt: utcTimestamp(entity, row, "started_at"),
      completedAt: nullableUtcTimestamp(entity, row, "completed_at"),
      ...versionAndRevision(entity, row),
      updatedAt: utcTimestamp(entity, row, "updated_at")
    };
  },

  toRow(value: MigrationBatchRow): PersistedRow {
    const entity = "migration_batches";
    return {
      id: requiredId(entity, { id: value.id }, "id"),
      source_type: value.sourceType,
      source_ref: value.sourceRef,
      source_checksum: value.sourceChecksum,
      status: value.status,
      report_json: serializeVersionedJson(value.report),
      started_at: timestampForWrite(entity, value.id, "started_at", value.startedAt),
      completed_at: optionalTimestampForWrite(entity, value.id, "completed_at", value.completedAt),
      version: versionForWrite(entity, value.id, value.version, value.revision),
      updated_at: timestampForWrite(entity, value.id, "updated_at", value.updatedAt)
    };
  }
};

const TELEGRAM_UPDATE_IDENTITY = ["update_id"] as const;

export const telegramUpdateMapper = {
  fromRow(row: DatabaseRow): TelegramUpdateRow {
    const entity = "telegram_updates";
    return {
      updateId: requiredId(entity, row, "update_id", TELEGRAM_UPDATE_IDENTITY),
      payload: jsonObject(entity, row, "payload_json", TELEGRAM_UPDATE_IDENTITY),
      status: enumValue(entity, row, "status", TELEGRAM_UPDATE_STATUSES, TELEGRAM_UPDATE_IDENTITY),
      attemptCount: nonNegativeInteger(entity, row, "attempt_count", TELEGRAM_UPDATE_IDENTITY),
      lastErrorCode: nullableString(entity, row, "last_error_code", TELEGRAM_UPDATE_IDENTITY),
      receivedAt: utcTimestamp(entity, row, "received_at", TELEGRAM_UPDATE_IDENTITY),
      processedAt: nullableUtcTimestamp(entity, row, "processed_at", TELEGRAM_UPDATE_IDENTITY),
      ...versionAndRevision(entity, row, TELEGRAM_UPDATE_IDENTITY),
      updatedAt: utcTimestamp(entity, row, "updated_at", TELEGRAM_UPDATE_IDENTITY)
    };
  },

  toRow(value: TelegramUpdateRow): PersistedRow {
    const entity = "telegram_updates";
    const identity = value.updateId;
    return {
      update_id: requiredId(entity, { update_id: identity }, "update_id", TELEGRAM_UPDATE_IDENTITY),
      payload_json: serializeVersionedJson(value.payload),
      status: value.status,
      attempt_count: value.attemptCount,
      last_error_code: toNullable(value.lastErrorCode),
      received_at: timestampForWrite(entity, identity, "received_at", value.receivedAt),
      processed_at: optionalTimestampForWrite(entity, identity, "processed_at", value.processedAt),
      version: versionForWrite(entity, identity, value.version, value.revision),
      updated_at: timestampForWrite(entity, identity, "updated_at", value.updatedAt)
    };
  }
};
