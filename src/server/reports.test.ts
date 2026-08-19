import assert from "node:assert/strict";
import { db } from "./store";
import { movementReportColumns, reportRows } from "./reports";

const admin = db.users.find((user) => user.role === "super_admin");
if (!admin) throw new Error("Expected seeded super admin");
db.operations.unshift({ id: "report-movement-valid", type: "transfer", productId: "p-1", fromLocationId: "loc-main", toLocationId: "loc-counter", quantity: 3, actorId: admin.id, reason: "contract row", idempotencyKey: "report-movement-valid", createdAt: "2026-07-11T12:34:56.000Z" });
db.operations.unshift({ id: "report-movement-corrupt" } as unknown as typeof db.operations[number]);

const rows = reportRows(admin, "movements", { productId: "p-1", locationId: "loc-main" });
const row = rows.find((item) => item.id === "report-movement-valid");
assert.ok(row);
assert.deepEqual(Object.keys(row), movementReportColumns);
assert.equal(row.productName, db.products.find((product) => product.id === "p-1")?.localName);
assert.equal(row.occurredAt, "2026-07-11T12:34:56.000Z");
assert.equal(row.fromLocationName, db.locations.find((location) => location.id === "loc-main")?.name);
assert.equal(row.toLocationName, db.locations.find((location) => location.id === "loc-counter")?.name);

const corrupt = reportRows(admin, "movements").find((row) => row.id === "report-movement-corrupt");
assert.deepEqual(corrupt, { id: "report-movement-corrupt", occurredAt: null, type: "unknown", productId: null, productName: "Неизвестный товар", fromLocationId: null, fromLocationName: null, toLocationId: null, toLocationName: null, quantity: null, actorId: null, actorName: "Неизвестный сотрудник", reason: "Не указано", reversedOperationId: null, inventoryExpected: null, inventoryActual: null, inventoryDelta: null });
console.log("reports tests passed");
