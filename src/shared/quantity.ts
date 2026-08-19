export const QUANTITY_SCALE = 1_000;
export const MAX_QUANTITY_MINOR = 9_000_000_000_000;
export type QuantityUnit = "шт" | "кг" | "л" | "м";

export class QuantityError extends Error {
  constructor(public readonly code: "NOT_FINITE" | "PRECISION" | "PIECES_FRACTION" | "OVERFLOW" | "NEGATIVE" | "NOT_POSITIVE") {
    super(`Invalid quantity: ${code}`);
    this.name = "QuantityError";
  }
}

export function quantityToMinor(value: number, unit?: QuantityUnit) {
  if (!Number.isFinite(value)) throw new QuantityError("NOT_FINITE");
  const scaled = value * QUANTITY_SCALE;
  const minor = Math.round(scaled);
  const floatingTolerance = Math.max(1e-7, Math.abs(scaled) * Number.EPSILON * 2);
  if (Math.abs(scaled - minor) > floatingTolerance) throw new QuantityError("PRECISION");
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_QUANTITY_MINOR) throw new QuantityError("OVERFLOW");
  if (unit === "шт" && minor % QUANTITY_SCALE !== 0) throw new QuantityError("PIECES_FRACTION");
  return minor;
}

export function quantityFromMinor(minor: number) {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_QUANTITY_MINOR) throw new QuantityError("OVERFLOW");
  return minor / QUANTITY_SCALE;
}

export function normalizeQuantity(value: number, unit?: QuantityUnit) {
  return quantityFromMinor(quantityToMinor(value, unit));
}

export function requireQuantity(value: number, options: { unit?: QuantityUnit; allowZero?: boolean } = {}) {
  const normalized = normalizeQuantity(value, options.unit);
  if (normalized < 0) throw new QuantityError("NEGATIVE");
  if (options.allowZero === false && normalized === 0) throw new QuantityError("NOT_POSITIVE");
  return normalized;
}

export function addQuantity(left: number, right: number, unit?: QuantityUnit) {
  return quantityFromMinor(quantityToMinor(left, unit) + quantityToMinor(right, unit));
}

export function subtractQuantity(left: number, right: number, unit?: QuantityUnit) {
  return quantityFromMinor(quantityToMinor(left, unit) - quantityToMinor(right, unit));
}
