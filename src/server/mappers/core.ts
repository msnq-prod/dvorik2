import { quantityFromMinor, quantityToMinor, requireQuantity, type QuantityUnit } from "../../shared/quantity";
import type { JsonValue, VersionedPayload } from "../repositories";
import type { SqlValue } from "../database";

export type DatabaseRow = Readonly<Record<string, unknown>>;
export type PersistedRow = Record<string, SqlValue>;

export class RowMappingError extends Error {
  constructor(
    public readonly entity: string,
    public readonly entityId: string,
    public readonly field: string,
    public readonly code: "MISSING" | "TYPE" | "ENUM" | "INTEGER" | "DATE" | "TIMESTAMP" | "JSON" | "JSON_VERSION" | "QUANTITY"
  ) {
    super(`Cannot map ${entity} ${entityId}: ${field} (${code})`);
    this.name = "RowMappingError";
  }
}

export function rowIdentity(row: DatabaseRow, fields: readonly string[] = ["id"]) {
  const values = fields.map((field) => row[field]).filter((value) => value !== null && value !== undefined);
  return values.length ? values.map(String).join("/") : "<unknown>";
}

function fail(entity: string, row: DatabaseRow, field: string, code: RowMappingError["code"], identityFields?: readonly string[]): never {
  throw new RowMappingError(entity, rowIdentity(row, identityFields), field, code);
}

export function requiredString(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = row[field];
  if (typeof value !== "string") fail(entity, row, field, value === null || value === undefined ? "MISSING" : "TYPE", identityFields);
  return value;
}

export function nullableString(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = row[field];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") fail(entity, row, field, "TYPE", identityFields);
  return value;
}

export function integer(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(entity, row, field, "INTEGER", identityFields);
  return value;
}

export function enumValue<T extends string>(entity: string, row: DatabaseRow, field: string, values: readonly T[], identityFields?: readonly string[]): T {
  const value = requiredString(entity, row, field, identityFields);
  if (!values.includes(value as T)) fail(entity, row, field, "ENUM", identityFields);
  return value as T;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

export function versionedJson<T extends JsonValue>(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]): VersionedPayload<T> {
  const raw = requiredString(entity, row, field, identityFields);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail(entity, row, field, "JSON", identityFields); }
  if (!isJsonValue(parsed)) fail(entity, row, field, "JSON", identityFields);
  if (parsed && !Array.isArray(parsed) && typeof parsed === "object" && "schemaVersion" in parsed && "value" in parsed) {
    const envelope = parsed as { schemaVersion: unknown; value: unknown };
    if (envelope.schemaVersion !== 1) fail(entity, row, field, "JSON_VERSION", identityFields);
    if (!isJsonValue(envelope.value)) fail(entity, row, field, "JSON", identityFields);
    return { schemaVersion: 1, value: envelope.value as T };
  }
  return { schemaVersion: 1, value: parsed as T };
}

export function serializeVersionedJson<T extends JsonValue>(payload: VersionedPayload<T>) {
  if (payload.schemaVersion !== 1 || !isJsonValue(payload.value)) throw new TypeError("Invalid versioned JSON payload");
  return JSON.stringify(payload);
}

export function utcTimestamp(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = requiredString(entity, row, field, identityFields);
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(candidate)) fail(entity, row, field, "TIMESTAMP", identityFields);
  const date = new Date(candidate);
  if (!Number.isFinite(date.getTime())) fail(entity, row, field, "TIMESTAMP", identityFields);
  const canonical = candidate.includes(".") ? candidate : candidate.replace("Z", ".000Z");
  if (date.toISOString() !== canonical) fail(entity, row, field, "TIMESTAMP", identityFields);
  return date.toISOString();
}

export function nullableUtcTimestamp(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  if (row[field] === null || row[field] === undefined) return undefined;
  return utcTimestamp(entity, row, field, identityFields);
}

export function localDate(entity: string, row: DatabaseRow, field: string, identityFields?: readonly string[]) {
  const value = requiredString(entity, row, field, identityFields);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(entity, row, field, "DATE", identityFields);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail(entity, row, field, "DATE", identityFields);
  return value;
}

export function quantity(entity: string, row: DatabaseRow, input: { minorField: string; realField: string; unit: QuantityUnit; allowZero?: boolean }, identityFields?: readonly string[]) {
  try {
    const minor = integer(entity, row, input.minorField, identityFields);
    const value = quantityFromMinor(minor);
    requireQuantity(value, { unit: input.unit, allowZero: input.allowZero });
    const transitional = row[input.realField];
    if (typeof transitional !== "number" || quantityToMinor(transitional, input.unit) !== minor) fail(entity, row, input.realField, "QUANTITY", identityFields);
    return value;
  } catch (error) {
    if (error instanceof RowMappingError) throw error;
    fail(entity, row, input.minorField, "QUANTITY", identityFields);
  }
}

export function quantityColumns(value: number, unit: QuantityUnit, allowZero = true) {
  const normalized = requireQuantity(value, { unit, allowZero });
  return { real: normalized, minor: quantityToMinor(normalized, unit) };
}

export const toNullable = (value: string | undefined): string | null => value ?? null;
