import assert from "node:assert/strict";
import { localDate, quantity, quantityColumns, RowMappingError, serializeVersionedJson, utcTimestamp, versionedJson } from "./core";

assert.equal(localDate("schedule_days", { id: "d-1", local_date: "2024-02-29" }, "local_date"), "2024-02-29");
assert.throws(() => localDate("schedule_days", { id: "d-bad", local_date: "2026-02-29" }, "local_date"), (error) => error instanceof RowMappingError && error.entityId === "d-bad" && error.code === "DATE");
assert.equal(utcTimestamp("audit_entries", { id: "a-1", created_at: "2026-07-12 00:00:00" }, "created_at"), "2026-07-12T00:00:00.000Z");
assert.throws(() => utcTimestamp("audit_entries", { id: "a-bad", created_at: "2026-07-12T10:00:00+10:00" }, "created_at"), (error) => error instanceof RowMappingError && error.code === "TIMESTAMP");

const legacy = versionedJson("imports", { id: "i-1", preview_json: JSON.stringify({ rows: [] }) }, "preview_json");
assert.deepEqual(legacy, { schemaVersion: 1, value: { rows: [] } });
const encoded = serializeVersionedJson({ schemaVersion: 1, value: { rows: [] } });
assert.deepEqual(versionedJson("imports", { id: "i-2", preview_json: encoded }, "preview_json"), { schemaVersion: 1, value: { rows: [] } });
assert.throws(() => versionedJson("imports", { id: "i-bad", preview_json: "{" }, "preview_json"), (error) => error instanceof RowMappingError && error.entityId === "i-bad" && error.code === "JSON");
assert.throws(() => versionedJson("imports", { id: "i-v2", preview_json: JSON.stringify({ schemaVersion: 2, value: {} }) }, "preview_json"), (error) => error instanceof RowMappingError && error.code === "JSON_VERSION");

assert.deepEqual(quantityColumns(1.25, "кг"), { real: 1.25, minor: 1250 });
assert.equal(quantity("stock_balances", { product_id: "p-1", location_id: "l-1", quantity: 1.25, quantity_minor: 1250 }, { realField: "quantity", minorField: "quantity_minor", unit: "кг" }, ["product_id", "location_id"]), 1.25);
assert.throws(() => quantity("stock_balances", { product_id: "p-1", location_id: "l-1", quantity: 1.251, quantity_minor: 1250 }, { realField: "quantity", minorField: "quantity_minor", unit: "кг" }, ["product_id", "location_id"]), (error) => error instanceof RowMappingError && error.entityId === "p-1/l-1" && error.code === "QUANTITY");
console.log("mapper core tests passed");
