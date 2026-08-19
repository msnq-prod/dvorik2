import assert from "node:assert/strict";
import { validateScan } from "./scan-contract";
assert.deepEqual(validateScan("4006381333931", "EAN_13"), { ok: true, canonical: "4006381333931" });
assert.equal(validateScan("4006381333931 ", "EAN_13").ok, false);
assert.equal(validateScan("manual-code-01", "CODE_128").ok, true);
assert.deepEqual(validateScan("123", "UPC_A"), { ok: false, code: "SCAN_FORMAT_UNSUPPORTED" });
console.log("warehouse scan contract tests passed");
