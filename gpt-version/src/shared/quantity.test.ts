import assert from "node:assert/strict";
import { addQuantity, MAX_QUANTITY_MINOR, normalizeQuantity, QUANTITY_SCALE, QuantityError, quantityFromMinor, quantityToMinor, requireQuantity, subtractQuantity } from "./quantity";

assert.equal(QUANTITY_SCALE, 1_000);
assert.equal(quantityToMinor(18.5, "кг"), 18_500);
assert.equal(quantityFromMinor(18_500), 18.5);
assert.equal(normalizeQuantity(0.001, "кг"), 0.001);
assert.equal(requireQuantity(0, { unit: "кг" }), 0);
assert.throws(() => requireQuantity(0, { allowZero: false }), (error) => error instanceof QuantityError && error.code === "NOT_POSITIVE");
assert.throws(() => normalizeQuantity(1.5, "шт"), (error) => error instanceof QuantityError && error.code === "PIECES_FRACTION");
assert.throws(() => normalizeQuantity(0.0001, "кг"), (error) => error instanceof QuantityError && error.code === "PRECISION");
assert.throws(() => normalizeQuantity(Number.POSITIVE_INFINITY), (error) => error instanceof QuantityError && error.code === "NOT_FINITE");
assert.throws(() => quantityFromMinor(MAX_QUANTITY_MINOR + 1), (error) => error instanceof QuantityError && error.code === "OVERFLOW");
const largeMinor = 8_644_600_520_248;
assert.equal(quantityToMinor(quantityFromMinor(largeMinor)), largeMinor);

let quantity = 0;
for (let index = 0; index < 1_000; index += 1) quantity = addQuantity(quantity, 0.001, "кг");
assert.equal(quantity, 1);
for (let index = 0; index < 1_000; index += 1) quantity = subtractQuantity(quantity, 0.001, "кг");
assert.equal(quantity, 0);
console.log("quantity tests passed");
