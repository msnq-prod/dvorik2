import assert from "node:assert/strict";
import {
  migrationBatchMapper,
  telegramUpdateMapper,
  type MigrationBatchRow,
  type TelegramUpdateRow
} from "./runtime";
import { RowMappingError } from "./core";

const STARTED_AT = "2026-07-12T01:00:00.000Z";
const COMPLETED_AT = "2026-07-12T01:05:00.000Z";
const UPDATED_AT = "2026-07-12T01:06:00.000Z";

const migrationBatch: MigrationBatchRow = {
  id: "migration-batch-1",
  sourceType: "legacy_app_state",
  sourceRef: "app-state-row-1",
  sourceChecksum: "sha256:1234",
  status: "completed",
  report: { schemaVersion: 1, value: { imported: 14, warnings: [] } },
  startedAt: STARTED_AT,
  completedAt: COMPLETED_AT,
  version: 2,
  updatedAt: UPDATED_AT,
  revision: "2"
};
assert.deepEqual(migrationBatchMapper.fromRow(migrationBatchMapper.toRow(migrationBatch)), migrationBatch);

const pendingMigrationBatch: MigrationBatchRow = {
  ...migrationBatch,
  id: "migration-batch-2",
  status: "started",
  completedAt: undefined,
  version: 0,
  revision: "0"
};
assert.equal(migrationBatchMapper.toRow(pendingMigrationBatch).completed_at, null);
assert.deepEqual(migrationBatchMapper.fromRow(migrationBatchMapper.toRow(pendingMigrationBatch)), pendingMigrationBatch);

const telegramUpdate: TelegramUpdateRow = {
  updateId: "telegram-update-100",
  payload: { schemaVersion: 1, value: { update_id: 100, message: { text: "/start" } } },
  status: "processed",
  attemptCount: 1,
  lastErrorCode: undefined,
  receivedAt: STARTED_AT,
  processedAt: COMPLETED_AT,
  version: 3,
  updatedAt: UPDATED_AT,
  revision: "3"
};
assert.equal(telegramUpdateMapper.toRow(telegramUpdate).last_error_code, null);
assert.deepEqual(telegramUpdateMapper.fromRow(telegramUpdateMapper.toRow(telegramUpdate)), telegramUpdate);

const legacyBatch = migrationBatchMapper.fromRow({
  ...migrationBatchMapper.toRow(migrationBatch),
  report_json: JSON.stringify({ imported: 14 }),
  started_at: "2026-07-12 01:00:00",
  updated_at: "2026-07-12 01:06:00"
});
assert.deepEqual(legacyBatch.report, { schemaVersion: 1, value: { imported: 14 } });
assert.equal(legacyBatch.startedAt, STARTED_AT);
assert.equal(legacyBatch.updatedAt, UPDATED_AT);

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
    return true;
  });
}

expectMappingError(
  () => migrationBatchMapper.fromRow({ ...migrationBatchMapper.toRow(migrationBatch), report_json: "not-json" }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "report_json", code: "JSON" }
);
expectMappingError(
  () => migrationBatchMapper.fromRow({
    ...migrationBatchMapper.toRow(migrationBatch),
    report_json: JSON.stringify({ schemaVersion: 2, value: {} })
  }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "report_json", code: "JSON_VERSION" }
);
expectMappingError(
  () => migrationBatchMapper.fromRow({ ...migrationBatchMapper.toRow(migrationBatch), status: "cancelled" }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "status", code: "ENUM" }
);
expectMappingError(
  () => migrationBatchMapper.fromRow({ ...migrationBatchMapper.toRow(migrationBatch), version: -1 }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "version", code: "INTEGER" }
);
expectMappingError(
  () => migrationBatchMapper.fromRow({ ...migrationBatchMapper.toRow(migrationBatch), updated_at: "2026-07-12T01:06:00+10:00" }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "updated_at", code: "TIMESTAMP" }
);

expectMappingError(
  () => telegramUpdateMapper.fromRow({ ...telegramUpdateMapper.toRow(telegramUpdate), payload_json: JSON.stringify([]) }),
  { entity: "telegram_updates", entityId: telegramUpdate.updateId, field: "payload_json", code: "JSON" }
);
expectMappingError(
  () => telegramUpdateMapper.fromRow({ ...telegramUpdateMapper.toRow(telegramUpdate), status: "unknown" }),
  { entity: "telegram_updates", entityId: telegramUpdate.updateId, field: "status", code: "ENUM" }
);
expectMappingError(
  () => telegramUpdateMapper.fromRow({ ...telegramUpdateMapper.toRow(telegramUpdate), attempt_count: -1 }),
  { entity: "telegram_updates", entityId: telegramUpdate.updateId, field: "attempt_count", code: "INTEGER" }
);
expectMappingError(
  () => telegramUpdateMapper.fromRow({ ...telegramUpdateMapper.toRow(telegramUpdate), processed_at: "yesterday" }),
  { entity: "telegram_updates", entityId: telegramUpdate.updateId, field: "processed_at", code: "TIMESTAMP" }
);

expectMappingError(
  () => migrationBatchMapper.toRow({ ...migrationBatch, revision: "1" }),
  { entity: "migration_batches", entityId: migrationBatch.id, field: "version", code: "INTEGER" }
);
expectMappingError(
  () => telegramUpdateMapper.toRow({ ...telegramUpdate, receivedAt: "invalid" }),
  { entity: "telegram_updates", entityId: telegramUpdate.updateId, field: "received_at", code: "TIMESTAMP" }
);

console.log("runtime mapper tests passed");
