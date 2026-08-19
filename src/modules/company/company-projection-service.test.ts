import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../../server/database";
import { applyMigrations } from "../../server/migrations";
import { CompanyOutboxBridge } from "./company-outbox-bridge";
import { CompanyProjectionService } from "./company-projection-service";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-company-module-"));
const database = openDatabase(path.join(root, "company.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1,datetime('now')); ");
applyMigrations(database);
database.execute(`INSERT INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
  VALUES ('profit-1','warehouse','ProductProfitabilityUpdated',1,'product-1',?,'pending','2026-07-27T00:00:00.000Z','2026-07-27T00:00:00.000Z')`, [JSON.stringify({ productId: "product-1", actualRevenueKopecks: 90000, actualCostKopecks: 50000, completeness: "complete", sourceUpdatedAt: "2026-07-27T00:00:00.000Z" })]);
database.execute(`INSERT INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
  VALUES ('stock-1','warehouse','StockChanged',1,'product-1',?,'pending','2026-07-27T00:00:00.000Z','2026-07-27T00:00:00.000Z')`, [JSON.stringify({ productId:"product-1",quantityPackageMilliDelta:1000,accountingQuantityMinorDelta:1000,reason:"supply" })]);
const company = new CompanyProjectionService(database, () => "2026-07-27T00:00:01.000Z");
const bridge = new CompanyOutboxBridge(database, company, () => "2026-07-27T00:00:01.000Z");
assert.equal(bridge.dispatchPending(), 2);
assert.deepEqual(company.productProfitability("product-1"), { productId: "product-1", actualRevenueKopecks: 90000, actualCostKopecks: 50000, marginKopecks: 40000, completeness: "complete", sourceUpdatedAt: "2026-07-27T00:00:00.000Z" });
company.applyCashEvent({ eventId:"cash-1",eventType:"SaleRevenueDelta",eventVersion:1,producer:"cash",aggregateId:"sale-1",occurredAt:"2026-07-27T01:00:00.000Z",payload:{externalSaleKey:"sale-1",revision:"1",revenueDeltaKopecks:12000,completeness:"complete"} });
company.applyStaffEvent({ eventId:"staff-1",eventType:"StaffSnapshotUpdated",eventVersion:1,producer:"staff",aggregateId:"staff",occurredAt:"2026-07-27T02:00:00.000Z",payload:{activeEmployees:3,scheduledShifts:4,pendingExchanges:1,sourceUpdatedAt:"2026-07-27T02:00:00.000Z"} });
assert.deepEqual(company.overview(), {
  cash:{eventCount:1,revenueDeltaKopecks:12000,exceptionCount:0,completeness:"available",sourceUpdatedAt:"2026-07-27T01:00:00.000Z"},
  staff:{activeEmployees:3,scheduledShifts:4,pendingExchanges:1,completeness:"available",sourceUpdatedAt:"2026-07-27T02:00:00.000Z"},
  warehouse:{projectedProducts:1,completeness:"available",sourceUpdatedAt:"2026-07-27T00:00:00.000Z"}
});
assert.deepEqual(company.status(), {availability:"unavailable",worker:{overdue:true},outbox:{pending:0,failed:0}});
company.recordWorkerHeartbeat();
assert.deepEqual(company.status(), {availability:"connected",worker:{lastHeartbeatAt:"2026-07-27T00:00:01.000Z",overdue:false},outbox:{pending:0,failed:0}});
assert.equal(bridge.dispatchPending(), 0);
assert.equal(database.query<{ status: string }>("SELECT status FROM domain_outbox WHERE event_id='profit-1'")[0].status, "sent");
assert.equal(database.query<{ status: string }>("SELECT status FROM domain_outbox WHERE event_id='stock-1'")[0].status, "sent");
company.enqueue({eventId:"cash-outbox-1",eventType:"SaleRevenueDelta",eventVersion:1,producer:"cash",aggregateId:"sale-2",occurredAt:"2026-07-27T03:00:00.000Z",payload:{externalSaleKey:"sale-2",revision:"1",revenueDeltaKopecks:3000,completeness:"complete"}});
company.enqueue({eventId:"staff-outbox-1",eventType:"StaffSnapshotUpdated",eventVersion:1,producer:"staff",aggregateId:"staff",occurredAt:"2026-07-27T04:00:00.000Z",payload:{activeEmployees:4,scheduledShifts:5,pendingExchanges:0,sourceUpdatedAt:"2026-07-27T04:00:00.000Z"}});
assert.equal(company.status().outbox.pending,2);
assert.equal(bridge.dispatchPending(),2);
assert.equal(company.overview().cash.revenueDeltaKopecks,15000);
assert.equal(company.overview().staff.activeEmployees,4);
database.execute(`INSERT INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
  VALUES ('invalid-1','warehouse','StockChanged',1,'product-2','not-json','pending','2026-07-27T00:00:00.000Z','2026-07-27T00:00:00.000Z')`);
assert.equal(bridge.dispatchPending(), 0);
assert.deepEqual(database.query<{ status: string; attempt_count: number; available_at: string }>("SELECT status,attempt_count,available_at FROM domain_outbox WHERE event_id='invalid-1'")[0], { status: "failed", attempt_count: 1, available_at: "2026-07-27T00:00:02.000Z" });
database.close();
console.log("company projection tests passed");
