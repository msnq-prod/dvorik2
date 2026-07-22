import { randomUUID } from "node:crypto";
import type { OutboxMessage } from "../shared/types";
import type { DatabaseAdapter, DatabaseContext } from "./database";
import { outboxMessageFromRow, type OutboxMessagePersistence } from "./mappers/workflows";
import type { RepositoryRecord } from "./repositories";

type Row = Readonly<Record<string, unknown>>;

export type SqliteOutboxDispatchOptions = Readonly<{
  workerId?: string;
  now?: Date;
  leaseMs?: number;
  limit?: number;
  channel?: OutboxMessage["channel"];
  excludedTypes?: readonly string[];
  createLeaseToken?: () => string;
}>;

type ClaimedMessage = Readonly<{
  record: RepositoryRecord<OutboxMessagePersistence>;
  leaseToken: string;
}>;

export class OutboxDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "OutboxDeliveryError";
  }
}

function iso(date: Date) {
  return date.toISOString();
}

function isDeliveryError(error: unknown): error is OutboxDeliveryError {
  return error instanceof OutboxDeliveryError || (
    typeof error === "object" && error !== null && "code" in error && "retryable" in error &&
    typeof (error as { code?: unknown }).code === "string" && typeof (error as { retryable?: unknown }).retryable === "boolean"
  );
}

function publicMessage(record: RepositoryRecord<OutboxMessagePersistence>): OutboxMessage {
  const { maxAttempts: _maxAttempts, leaseOwner: _leaseOwner, leaseToken: _leaseToken, leaseExpiresAt: _leaseExpiresAt,
    failedAt: _failedAt, lastErrorCode: _lastErrorCode, updatedAt: _updatedAt, ...message } = record.entity;
  return { ...message, payload: message.payload.value };
}

function claimDue(
  database: DatabaseAdapter,
  input: Required<Pick<SqliteOutboxDispatchOptions, "workerId" | "leaseMs" | "limit">> & Pick<SqliteOutboxDispatchOptions, "channel" | "excludedTypes" | "createLeaseToken"> & { now: Date }
): ClaimedMessage[] {
  const at = iso(input.now);
  const leaseUntil = iso(new Date(input.now.getTime() + input.leaseMs));
  const channelClause = input.channel ? " AND channel = ?" : "";
  const channelParameters = input.channel ? [input.channel] : [];
  const excludedTypes = input.excludedTypes?.length ? ` AND type NOT IN (${input.excludedTypes.map(() => "?").join(", ")})` : "";
  const excludedTypeParameters = input.excludedTypes || [];
  return database.transaction((transaction) => {
    transaction.execute(
      `UPDATE outbox_messages
       SET status = 'pending', lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
           last_error = 'LEASE_EXPIRED', last_error_code = 'LEASE_EXPIRED', updated_at = ?, version = version + 1
       WHERE status = 'processing' AND lease_expires_at <= ?${channelClause}${excludedTypes}`,
      [at, at, ...channelParameters, ...excludedTypeParameters]
    );
    transaction.execute(
      `UPDATE outbox_messages
       SET status = 'failed', failed_at = ?, last_error_code = 'MAX_ATTEMPTS', updated_at = ?, version = version + 1
       WHERE status = 'pending' AND attempt_count >= max_attempts AND available_at <= ?${channelClause}${excludedTypes}`,
      [at, at, at, ...channelParameters, ...excludedTypeParameters]
    );
    const ids = transaction.query<{ id: string }>(
      `SELECT id FROM outbox_messages
       WHERE status = 'pending' AND available_at <= ? AND attempt_count < max_attempts${channelClause}${excludedTypes}
       ORDER BY available_at ASC, created_at ASC, id ASC LIMIT ?`,
      [at, ...channelParameters, ...excludedTypeParameters, input.limit]
    );
    return ids.flatMap(({ id }) => {
      const leaseToken = input.createLeaseToken?.() ?? randomUUID();
      const claimed = transaction.execute(
        `UPDATE outbox_messages
         SET status = 'processing', lease_owner = ?, lease_token = ?, lease_expires_at = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND status = 'pending' AND available_at <= ? AND attempt_count < max_attempts`,
        [input.workerId, leaseToken, leaseUntil, at, id, at]
      );
      if (claimed.changes !== 1) return [];
      const row = transaction.query<Row>("SELECT * FROM outbox_messages WHERE id = ?", [id])[0];
      if (!row) throw new Error(`Claimed outbox message ${id} disappeared`);
      return [{ record: outboxMessageFromRow(row), leaseToken }];
    });
  }, { mode: "immediate" });
}

function markSent(database: DatabaseAdapter, candidate: ClaimedMessage, workerId: string, at: string) {
  return database.execute(
    `UPDATE outbox_messages
     SET status = 'sent', sent_at = ?, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
         last_error = NULL, last_error_code = NULL, updated_at = ?, version = version + 1
     WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND version = ?`,
    [at, at, candidate.record.entity.id, workerId, candidate.leaseToken, Number(candidate.record.revision)]
  ).changes === 1;
}

function reschedule(database: DatabaseAdapter, candidate: ClaimedMessage, workerId: string, error: unknown, now: Date) {
  const message = error instanceof Error ? error.message : String(error);
  const delivery = isDeliveryError(error) ? error : undefined;
  const at = iso(now);
  const nextAttempt = candidate.record.entity.attemptCount + 1;
  const delay = delivery?.retryAfterMs ?? Math.min(60 * 60_000, 1_000 * 2 ** nextAttempt);
  const status = delivery?.retryable === false || nextAttempt >= candidate.record.entity.maxAttempts ? "failed" : "pending";
  const availableAt = iso(new Date(now.getTime() + delay));
  return database.execute(
    `UPDATE outbox_messages
     SET status = ?, attempt_count = ?, available_at = ?, last_error = ?, last_error_code = ?,
         failed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
         lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?, version = version + 1
     WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND version = ?`,
    [status, nextAttempt, availableAt, message.slice(0, 4_000), delivery?.code ?? "DELIVERY_FAILED", status, at, at,
      candidate.record.entity.id, workerId, candidate.leaseToken, Number(candidate.record.revision)]
  ).changes === 1;
}

/** Dispatches only messages atomically leased from the normalized SQLite outbox. */
export async function dispatchSqliteOutbox(
  database: DatabaseAdapter,
  send: (message: OutboxMessage) => Promise<void>,
  options: SqliteOutboxDispatchOptions = {}
) {
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? `outbox:${process.pid}:${randomUUID()}`;
  const claimed = claimDue(database, {
    workerId,
    now,
    leaseMs: options.leaseMs ?? 60_000,
    limit: options.limit ?? 25,
    channel: options.channel,
    excludedTypes: options.excludedTypes,
    createLeaseToken: options.createLeaseToken
  });
  let sent = 0;
  let failed = 0;
  for (const candidate of claimed) {
    try {
      await send(publicMessage(candidate.record));
      if (markSent(database, candidate, workerId, iso(new Date()))) sent += 1;
    } catch (error) {
      if (reschedule(database, candidate, workerId, error, now)) failed += 1;
    }
  }
  return { claimed: claimed.length, sent, failed };
}
