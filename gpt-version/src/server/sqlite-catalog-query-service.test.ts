import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { buildNormalizedStateSql } from "./state-migration";
import { createSeedState } from "./store";
import { SqlCatalogQueryService } from "./sqlite-catalog-query-service";
import { SqlStaffQueryService } from "./sqlite-staff-query-service";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-catalog-query-"));
const file = path.join(root, "catalog.sqlite");
const database = openDatabase(file);
try {
  database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); CREATE TABLE app_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,datetime('now')); ");
  applyMigrations(database);
  const state = createSeedState();
  database.executeScript(buildNormalizedStateSql(state));
  database.execute(
    "INSERT INTO audit_entries(id, actor_id, entity_type, entity_id, action, changes_json, created_at, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["query-audit", "u-admin", "query", "query-audit", "read", '{"schemaVersion":1,"value":{"source":"test"}}', "2026-07-15T00:00:00.000Z", 0, "2026-07-15T00:00:00.000Z"]
  );
  const queries = new SqlCatalogQueryService(database);
  const staffQueries = new SqlStaffQueryService(database);
  const all = queries.products({ status: "all", page: 1, limit: 100 });
  assert.ok(all.items.length > 1);
  assert.deepEqual(all.items.map((item) => item.id), [...all.items].sort((left, right) => `${left.localName}\u0000${left.id}`.localeCompare(`${right.localName}\u0000${right.id}`, "ru")) .map((item) => item.id));
  const first = queries.products({ status: "active", page: 1, limit: 1 });
  const second = queries.products({ status: "active", page: 2, limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.equal(queries.products({ status: "active", search: "no-such-product", page: 1, limit: 10 }).total, 0);
  const searchableProductId = all.items[0].id;
  const barcode = all.items.flatMap((item) => item.identifiers).find((identifier) => identifier.type === "barcode");
  assert.ok(barcode);
  assert.equal(queries.productByBarcode(` ${barcode.value} `)?.id, barcode.productId);
  assert.equal(queries.productByBarcode("no-such-barcode"), undefined);
  database.execute("UPDATE products SET local_name = ? WHERE id = ?", ["Ёж-молоко", searchableProductId]);
  assert.deepEqual(queries.products({ status: "all", search: "еж молоко", page: 1, limit: 10 }).items.map((item) => item.id), [searchableProductId]);
  assert.ok(queries.locations().length > 0);
  assert.ok(queries.balances().length > 0);
  assert.equal(queries.inventorySnapshot("loc-main").every((row) => row.locationId === "loc-main"), true);
  assert.ok(queries.operations().length > 0);
  assert.ok(queries.reportRows("all", {}).length > 0);
  assert.ok(queries.reportRows("movements", {}).length > 0);
  assert.equal(queries.reportRows("movements", { productId: "no-such-product" }).length, 0);
  const sellerSummary = queries.summary({ userId: "u-seller", includeAllNotifications: false, today: "2026-07-12" });
  assert.ok(sellerSummary.activeProducts > 0);
  assert.equal(sellerSummary.notifications.every((item) => item.userId === "u-seller"), true);
  const managerSummary = queries.summary({ userId: "u-admin", includeAllNotifications: true, today: "2026-07-12" });
  assert.ok(managerSummary.latestOperations.length > 0);
  assert.ok(managerSummary.notifications.length >= sellerSummary.notifications.length);
  assert.ok(queries.audit().length > 0);
  assert.deepEqual(queries.audit().map((entry) => entry.id), [...queries.audit()]
    .sort((left, right) => `${right.createdAt}\u0000${right.id}`.localeCompare(`${left.createdAt}\u0000${left.id}`))
    .map((entry) => entry.id));
  const adminShifts = staffQueries.shifts({ userId: "u-admin" });
  assert.ok(adminShifts.length > 0);
  assert.equal(adminShifts.every((shift) => shift.employeeIds.includes("u-admin")), true);
  assert.equal(staffQueries.days({ userId: "u-admin" }).every((day) => adminShifts.some((shift) => shift.date === day.date && shift.locationId === day.locationId)), true);
  assert.deepEqual(staffQueries.shifts({}).map((shift) => shift.id), [...staffQueries.shifts({})]
    .sort((left, right) => `${left.date}\u0000${left.start}\u0000${left.id}`.localeCompare(`${right.date}\u0000${right.start}\u0000${right.id}`))
    .map((shift) => shift.id));
  database.execute(
    "INSERT INTO audit_entries(id, entity_type, entity_id, action, changes_json, created_at, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ["corrupt-audit", "query", "corrupt-audit", "read", "{}", "not-a-timestamp", 0, "2026-07-15T00:00:00.000Z"]
  );
  assert.throws(() => queries.audit());
  database.execute("DELETE FROM audit_entries WHERE id = ?", ["corrupt-audit"]);
  console.log("sqlite catalog query service tests passed");
} finally {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
}
