import { nanoid } from "nanoid";
import type { MovementReportRow, OutboxMessage, User } from "../shared/types";
import { DomainError, listInventoryDiscrepancies, requirePermission } from "./domain";
import { db, stateTransaction } from "./store";
import { normalizeQuantity, type QuantityUnit } from "../shared/quantity";
import { isReportType, movementReportColumns, renderReportPdfRows, reportTitle, reportTypes, type ReportQuery, type ReportRow, type ReportType } from "./report-rendering";

export { isReportType, movementReportColumns, renderReportPdfRows, reportTitle, reportTypes } from "./report-rendering";
export type { ReportQuery, ReportRow, ReportType } from "./report-rendering";


function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableFiniteNumber(value: unknown, unit?: QuantityUnit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  try { return normalizeQuantity(value, unit); } catch { return null; }
}

export function movementReportRows(query: { from?: string; to?: string; productId?: string; locationId?: string } = {}): MovementReportRow[] {
  return db.operations.map((operation): MovementReportRow => {
    const raw = operation as unknown as Record<string, unknown>;
    const productId = nullableText(raw.productId);
    const fromLocationId = nullableText(raw.fromLocationId);
    const toLocationId = nullableText(raw.toLocationId);
    const actorId = nullableText(raw.actorId);
    const occurredAt = nullableText(raw.createdAt);
    const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata as Record<string, unknown> : {};
    const product = productId ? db.products.find((item) => item.id === productId) : undefined;
    const fromLocation = fromLocationId ? db.locations.find((item) => item.id === fromLocationId) : undefined;
    const toLocation = toLocationId ? db.locations.find((item) => item.id === toLocationId) : undefined;
    const actor = actorId ? db.users.find((item) => item.id === actorId) : undefined;
    const actorName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.id : actorId || "Неизвестный сотрудник";
    return {
      id: nullableText(raw.id) || "missing-operation-id", occurredAt, type: nullableText(raw.type) || "unknown",
      productId, productName: product?.localName || product?.officialName || productId || "Неизвестный товар",
      fromLocationId, fromLocationName: fromLocation?.name || fromLocationId,
      toLocationId, toLocationName: toLocation?.name || toLocationId,
      quantity: nullableFiniteNumber(raw.quantity, product?.unit), actorId, actorName, reason: nullableText(raw.reason) || "Не указано",
      reversedOperationId: nullableText(raw.reversedOperationId), inventoryExpected: nullableFiniteNumber(metadata.expected, product?.unit),
      inventoryActual: nullableFiniteNumber(metadata.actual, product?.unit), inventoryDelta: nullableFiniteNumber(metadata.delta, product?.unit)
    };
  }).filter((row) => {
    if (query.productId && row.productId !== query.productId) return false;
    if (query.locationId && row.fromLocationId !== query.locationId && row.toLocationId !== query.locationId) return false;
    if (!row.occurredAt) return !query.from && !query.to;
    const day = row.occurredAt.slice(0, 10);
    return (!query.from || day >= query.from) && (!query.to || day <= query.to);
  });
}

export function reportRows(user: User, type: ReportType, query: ReportQuery = {}): ReportRow[] {
  requirePermission(user, "reports:read");
  if (type === "discrepancies") return listInventoryDiscrepancies(user, query);
  if (type === "movements") return movementReportRows(query);
  return db.balances.map((balance) => {
    const product = db.products.find((item) => item.id === balance.productId);
    const location = db.locations.find((item) => item.id === balance.locationId);
    return { productName: product?.localName || product?.officialName || balance.productId, productStatus: product?.status || "deleted", locationName: location?.name || balance.locationId, quantity: normalizeQuantity(balance.quantity, product?.unit), threshold: normalizeQuantity(product?.lowStockThreshold || 0, product?.unit) };
  }).filter((row) => type === "all" || (type === "low" && row.quantity > 0 && row.quantity <= row.threshold) || (type === "zero" && row.quantity === 0) || (type === "archive" && row.productStatus === "archived"));
}

export async function renderReportPdf(user: User, type: ReportType, query: Parameters<typeof reportRows>[2] = {}) {
  return renderReportPdfRows(type, reportRows(user, type, query), query);
}

export async function queueReportTelegram(user: User, type: ReportType, query: Parameters<typeof reportRows>[2] = {}) {
  requirePermission(user, "reports:read");
  if (!user.telegramUserId) throw new DomainError("TELEGRAM_UNAVAILABLE", "У пользователя не указан Telegram", 422);
  const pdf = await renderReportPdf(user, type, query);
  const key = `telegram-report:${user.id}:${type}:${query.from || ""}:${query.to || ""}:${query.productId || ""}:${query.locationId || ""}`;
  return stateTransaction((state) => {
    const existing = state.outbox.find((item) => item.idempotencyKey === key && item.status !== "failed" && item.status !== "cancelled");
    if (existing) return existing;
    const message: OutboxMessage = {
      id: nanoid(), channel: "telegram", userId: user.id, type: "report_pdf",
      payload: { text: `Отчёт: ${reportTitle(type)}`, documentBase64: pdf.toString("base64"), fileName: `report-${type}.pdf` },
      status: "pending", attemptCount: 0, availableAt: new Date().toISOString(), createdAt: new Date().toISOString(), idempotencyKey: key
    };
    state.outbox.unshift(message);
    return message;
  });
}
