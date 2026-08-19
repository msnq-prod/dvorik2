import { createHash } from "node:crypto";
import type { CommandContext } from "./command-context";
import type { IdempotencyRecord, IdempotencyRepository, IdempotencyTerminal, JsonValue, UtcTimestamp } from "./repositories";

export type IdempotentHttpResponse<T extends JsonValue> = Readonly<{ status: number; body: T }>;
export type IdempotentExecution<T extends JsonValue> = IdempotentHttpResponse<T> & Readonly<{ outcome: "executed" | "replayed" }>;
export type IdempotencyRejection = Readonly<{
  outcome: "conflict" | "in_progress";
  status: 409;
  code: "IDEMPOTENCY_CONFLICT" | "IDEMPOTENCY_IN_PROGRESS";
}> | Readonly<{
  outcome: "invalid";
  status: 400;
  code: "INVALID_IDEMPOTENCY_SCOPE" | "INVALID_IDEMPOTENCY_PAYLOAD";
}>;
export type IdempotencyResult<T extends JsonValue> = IdempotentExecution<T> | IdempotencyRejection;
export type IdempotencyOptions = Readonly<{ processingTimeoutMs: number; retentionMs: number }>;

export class IdempotencyError extends Error {
  constructor(
    public readonly code: "INVALID_SCOPE" | "INVALID_PAYLOAD" | "INVALID_RESPONSE" | "CONFLICT" | "IN_PROGRESS" | "CORRUPT_RECORD" | "COMPLETION_FAILED",
    public readonly httpStatus: number
  ) {
    super(`Idempotency failed: ${code}`);
    this.name = "IdempotencyError";
  }
}

const scopePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new IdempotencyError("INVALID_PAYLOAD", 400);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new IdempotencyError("INVALID_PAYLOAD", 400);
  if (ancestors.has(value)) throw new IdempotencyError("INVALID_PAYLOAD", 400);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length
        || Object.keys(value).length !== value.length
        || Object.getOwnPropertyNames(value).length !== value.length + 1) {
        throw new IdempotencyError("INVALID_PAYLOAD", 400);
      }
      return `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length) {
      throw new IdempotencyError("INVALID_PAYLOAD", 400);
    }
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length
      || keys.some((key) => !("value" in Object.getOwnPropertyDescriptor(value, key)!))) {
      throw new IdempotencyError("INVALID_PAYLOAD", 400);
    }
    return `{${keys.sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: JsonValue): string {
  return canonicalJson(value, new Set());
}

export function canonicalRequestHash(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex")}`;
}

function timestampAfter(value: UtcTimestamp, milliseconds: number): UtcTimestamp {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) throw new RangeError("Idempotency duration must be a positive safe integer");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new RangeError("Idempotency clock must return canonical UTC");
  return new Date(parsed.getTime() + milliseconds).toISOString();
}

function validateResponse<T extends JsonValue>(response: IdempotentHttpResponse<T>) {
  if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new IdempotencyError("INVALID_RESPONSE", 500);
  }
  try {
    canonicalizeJson(response.body);
  } catch {
    throw new IdempotencyError("INVALID_RESPONSE", 500);
  }
}

function replay<T extends JsonValue>(record: IdempotencyRecord): IdempotentExecution<T> {
  if ((record.status !== "completed" && record.status !== "failed")
    || record.responseStatus === undefined || record.response === undefined || record.response.schemaVersion !== 1) {
    throw new IdempotencyError("CORRUPT_RECORD", 500);
  }
  return { outcome: "replayed", status: record.responseStatus, body: record.response.value as T };
}

export function executeIdempotently<Repositories extends { idempotency: IdempotencyRepository }, T extends JsonValue>(
  context: CommandContext<Repositories>,
  scope: string,
  request: JsonValue,
  options: IdempotencyOptions,
  run: () => IdempotentHttpResponse<T>
): IdempotencyResult<T> {
  if (!scopePattern.test(scope)) return { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_SCOPE" };
  let requestHash: string;
  try {
    requestHash = canonicalRequestHash(request);
  } catch (error) {
    if (error instanceof IdempotencyError && error.code === "INVALID_PAYLOAD") {
      return { outcome: "invalid", status: 400, code: "INVALID_IDEMPOTENCY_PAYLOAD" };
    }
    throw error;
  }
  const startedAt = context.clock.now();
  const reservation = context.transaction.repositories.idempotency.reserve({
    scope,
    key: context.idempotencyKey,
    requestHash,
    createdAt: startedAt,
    claimExpiresAt: timestampAfter(startedAt, options.processingTimeoutMs)
  }, startedAt);

  if (reservation.outcome === "conflict") return { outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" };
  if (reservation.outcome === "in_progress") return { outcome: "in_progress", status: 409, code: "IDEMPOTENCY_IN_PROGRESS" };
  if (reservation.outcome === "replay") return replay<T>(reservation.record.entity);

  const response = run();
  validateResponse(response);
  const completedAt = context.clock.now();
  const terminalBase = {
    scope,
    key: context.idempotencyKey,
    requestHash,
    responseStatus: response.status,
    response: { schemaVersion: 1, value: response.body },
    createdAt: reservation.record.entity.createdAt,
    completedAt,
    expiresAt: timestampAfter(completedAt, options.retentionMs)
  } as const;
  const updateOptions = { at: completedAt, expectedRevision: reservation.record.revision } as const;
  const completed = response.status >= 400
    ? context.transaction.repositories.idempotency.fail({ ...terminalBase, status: "failed" }, updateOptions)
    : context.transaction.repositories.idempotency.complete({ ...terminalBase, status: "completed" }, updateOptions);
  if (completed.outcome !== "updated" && completed.outcome !== "unchanged") {
    throw new IdempotencyError("COMPLETION_FAILED", 500);
  }
  return { outcome: "executed", status: response.status, body: response.body };
}
