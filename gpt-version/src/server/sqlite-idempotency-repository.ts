import type { DatabaseContext } from "./database";
import {
  idempotencyKeyFromRow,
  idempotencyKeyToRow,
  type IdempotencyKeyPersistence
} from "./mappers/workflows";
import type {
  IdempotencyRecord,
  IdempotencyClaim,
  IdempotencyRepository,
  IdempotencyReservation,
  IdempotencyTerminal,
  PageLimit,
  RepositoryRecord,
  UpdateOptions,
  UpdateResult,
  UtcTimestamp
} from "./repositories";

function persistence(record: RepositoryRecord<IdempotencyRecord>, updatedAt: UtcTimestamp): RepositoryRecord<IdempotencyKeyPersistence> {
  return { revision: record.revision, entity: { ...record.entity, updatedAt } };
}

function validateTerminal(record: IdempotencyTerminal, status: "completed" | "failed") {
  if (record.status !== status || !Number.isInteger(record.responseStatus)
    || record.responseStatus! < 100 || record.responseStatus! > 599
    || record.response === undefined || record.completedAt === undefined || record.expiresAt === undefined) {
    throw new RangeError(`Idempotency ${status} record must contain a status, response, completion and expiry`);
  }
}

function utcMilliseconds(value: UtcTimestamp) {
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const milliseconds = new Date(candidate).getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError("Invalid idempotency timestamp");
  return milliseconds;
}

export class SqliteIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly database: DatabaseContext) {}

  find(scope: string, key: string): RepositoryRecord<IdempotencyRecord> | undefined {
    const row = this.database.query<Record<string, unknown>>(
      "SELECT * FROM idempotency_keys WHERE scope = ? AND key = ?",
      [scope, key]
    )[0];
    return row ? idempotencyKeyFromRow(row) : undefined;
  }

  reserve(claim: IdempotencyClaim, at: UtcTimestamp): IdempotencyReservation {
    const record: IdempotencyRecord = {
      scope: claim.scope,
      key: claim.key,
      requestHash: claim.requestHash,
      status: "processing",
      createdAt: claim.createdAt,
      expiresAt: claim.claimExpiresAt
    };
    const row = idempotencyKeyToRow(persistence({ revision: "0", entity: record }, at));
    const inserted = this.database.execute(
      `INSERT INTO idempotency_keys(
        scope, key, request_hash, status, response_status, response_json,
        created_at, completed_at, expires_at, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, key) DO NOTHING`,
      [row.scope, row.key, row.request_hash, row.status, row.response_status, row.response_json,
        row.created_at, row.completed_at, row.expires_at, row.version, row.updated_at]
    );
    if (inserted.changes === 1) return { outcome: "reserved", record: this.required(record.scope, record.key) };

    const current = this.required(record.scope, record.key);
    if (current.entity.requestHash !== record.requestHash) return { outcome: "conflict", record: current };
    if (current.entity.status !== "processing") return { outcome: "replay", record: current };

    const version = Number(current.revision);
    const timeoutMs = utcMilliseconds(claim.claimExpiresAt) - utcMilliseconds(claim.createdAt);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("Invalid idempotency claim timeout");
    const recovered = this.database.execute(
      `UPDATE idempotency_keys
       SET response_status = NULL, response_json = NULL, completed_at = NULL,
           expires_at = ?, version = version + 1, updated_at = ?
       WHERE scope = ? AND key = ? AND request_hash = ? AND status = 'processing'
         AND version = ? AND (
           (expires_at IS NOT NULL AND julianday(expires_at) <= julianday(?))
           OR (expires_at IS NULL
             AND julianday(COALESCE(updated_at, created_at)) + ? <= julianday(?))
         )`,
      [record.expiresAt!, at, record.scope, record.key, record.requestHash, version,
        at, timeoutMs / 86_400_000, at]
    );
    if (recovered.changes === 1) return { outcome: "reserved", record: this.required(record.scope, record.key) };
    return { outcome: "in_progress", record: this.required(record.scope, record.key) };
  }

  complete(record: IdempotencyTerminal & Readonly<{ status: "completed" }>, options: UpdateOptions): UpdateResult<IdempotencyRecord> {
    validateTerminal(record, "completed");
    return this.terminal(record, options);
  }

  fail(record: IdempotencyTerminal & Readonly<{ status: "failed" }>, options: UpdateOptions): UpdateResult<IdempotencyRecord> {
    validateTerminal(record, "failed");
    return this.terminal(record, options);
  }

  deleteExpired(expiredBefore: UtcTimestamp, limit: PageLimit): number {
    return this.database.execute(
      `DELETE FROM idempotency_keys WHERE rowid IN (
        SELECT rowid FROM idempotency_keys
        WHERE status <> 'processing' AND expires_at IS NOT NULL
          AND julianday(expires_at) <= julianday(?)
        ORDER BY expires_at ASC, scope ASC, key ASC LIMIT ?
      )`,
      [expiredBefore, limit]
    ).changes;
  }

  private terminal(record: IdempotencyTerminal, options: UpdateOptions): UpdateResult<IdempotencyRecord> {
    const row = idempotencyKeyToRow(persistence({ revision: options.expectedRevision, entity: record }, options.at));
    const updated = this.database.execute(
      `UPDATE idempotency_keys
       SET status = ?, response_status = ?, response_json = ?, completed_at = ?, expires_at = ?,
           version = version + 1, updated_at = ?
       WHERE scope = ? AND key = ? AND request_hash = ? AND status = 'processing' AND version = ?`,
      [row.status, row.response_status, row.response_json, row.completed_at, row.expires_at,
        row.updated_at, row.scope, row.key, row.request_hash, row.version]
    );
    const current = this.find(record.scope, record.key);
    if (updated.changes === 1 && current) return { outcome: "updated", record: current };
    if (!current) return { outcome: "missing" };
    return { outcome: "stale", current };
  }

  private required(scope: string, key: string): RepositoryRecord<IdempotencyRecord> {
    const record = this.find(scope, key);
    if (!record) throw new Error("Idempotency record disappeared inside transaction");
    return record;
  }
}

export function createSqliteIdempotencyRepository(database: DatabaseContext): IdempotencyRepository {
  return new SqliteIdempotencyRepository(database);
}
