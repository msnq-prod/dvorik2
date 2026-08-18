export type ScanFormat = "EAN_8" | "EAN_13" | "CODE_128";

export type ScanValidation =
  | Readonly<{ ok: true; canonical: string }>
  | Readonly<{ ok: false; code: "SCAN_FORMAT_UNSUPPORTED" | "SCAN_VALUE_INVALID" }>;

function validEan(value: string) {
  const digits = [...value].map(Number);
  const expected = digits.slice(0, -1).reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0);
  return (10 - expected % 10) % 10 === digits.at(-1);
}

/** Exact, non-normalising boundary for camera-decoded product identifiers. */
export function validateScan(rawValue: string, format: string): ScanValidation {
  if (format !== "EAN_8" && format !== "EAN_13" && format !== "CODE_128") return { ok: false, code: "SCAN_FORMAT_UNSUPPORTED" };
  if (format === "EAN_8" || format === "EAN_13") {
    if (!new RegExp(`^\\d{${format === "EAN_8" ? 8 : 13}}$`).test(rawValue) || !validEan(rawValue)) return { ok: false, code: "SCAN_VALUE_INVALID" };
    return { ok: true, canonical: rawValue };
  }
  return /^[\x20-\x7E]{1,80}$/.test(rawValue) ? { ok: true, canonical: rawValue } : { ok: false, code: "SCAN_VALUE_INVALID" };
}
