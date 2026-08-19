import crypto from "node:crypto";
import { isObject, type SabyOrder } from "../server/saby-client";

export type NormalizedCashLine = Readonly<{
  key: string; uuid: string; name: string; quantityMilli: number;
  totalKopecks: number; discountKopecks: number; refused: boolean;
}>;

export type NormalizedCashSale = Readonly<{
  key: string; pointId: number; state: "completed" | "deleted" | "nonfiscal"; isReturn: boolean;
  businessTime: string; externalUpdatedAt: string; totalKopecks: number; revision: string;
  raw: string; lines: readonly NormalizedCashLine[];
}>;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function integer(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined; }
function money(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) : 0; }
function quantity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  const result = Math.round((value + Number.EPSILON) * 1000);
  if (Math.abs(result / 1000 - value) > 1e-9) throw new Error("SABY_QUANTITY_PRECISION");
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export function normalizeCashOrder(order: SabyOrder, pointId: number): NormalizedCashSale {
  const key = text(order.Key) || (integer(order.Sale) === undefined ? "" : String(integer(order.Sale)));
  if (!key) throw new Error("SABY_ORDER_KEY_MISSING");
  const payments = Array.isArray(order.Payments) ? order.Payments.filter(isObject) : [];
  const fiscal = payments.some((payment) => payment.Nonfiscal !== true && Boolean(text(payment.ClosedWTZ) || text(payment.CarriedWTZ) || text(payment.FiscalNumber)));
  const state: NormalizedCashSale["state"] = order.Deleted === true ? "deleted" : fiscal ? "completed" : "nonfiscal";
  const isReturn = order.Return === true;
  const businessTime = text(order.ClosedWTZ) || text(order.DateWTZ);
  const externalUpdatedAt = text(order.Updated) || businessTime;
  if (!businessTime || !externalUpdatedAt) throw new Error("SABY_ORDER_TIME_MISSING");
  const lines = (Array.isArray(order.SaleNomenclatures) ? order.SaleNomenclatures.filter(isObject) : []).flatMap((line, index): NormalizedCashLine[] => {
    const uuid = text(line.NomenclatureUUID);
    const quantityMilli = quantity(line.Quantity);
    if (!uuid || !quantityMilli) return [];
    return [{ key: text(line.Key) || `${uuid}:${integer(line.Number) ?? index}`, uuid, name: text(line.Name) || text(line.ShortName), quantityMilli, totalKopecks: money(line.TotalPrice), discountKopecks: money(line.TotalDiscount), refused: line.Refused === true }];
  });
  const unsigned = { key, pointId, state, isReturn, businessTime, externalUpdatedAt, totalKopecks: state === "completed" ? (isReturn ? -Math.abs(money(order.TotalPrice)) : Math.abs(money(order.TotalPrice))) : 0, lines };
  return { ...unsigned, revision: crypto.createHash("sha256").update(canonical(unsigned)).digest("hex"), raw: canonical(order) };
}

export function formatCashDateTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
