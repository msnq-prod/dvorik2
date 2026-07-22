import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandMetadata } from "./command-context";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { createSqliteStaffScheduleRepositories } from "./sqlite-staff-schedule-repositories";
import { StaffScheduleService } from "./staff-schedule-service";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-staff-schedule-"));
const database = openDatabase(path.join(directory, "staff.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller'),('admin','admin');
  INSERT OR IGNORE INTO permissions(id,code) VALUES ('schedule:manage','schedule:manage'),('staff:manage','staff:manage');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','schedule:manage'),('admin','staff:manage');
  INSERT INTO users(id,status) VALUES ('u-admin','active'),('u-a','active'),('u-b','active'),('u-other','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin'),('u-a','seller'),('u-b','seller'),('u-other','seller');
  INSERT INTO locations(id,code,name,type,status) VALUES ('loc','LOC','Точка','other','active');
  INSERT INTO schedule_days(id,local_date,location_id,status,version) VALUES ('day-a','2026-08-01','loc','working',0),('day-b','2026-08-02','loc','working',0);
  INSERT INTO shifts(id,schedule_day_id,location_id,local_date,start_time,end_time,status,version) VALUES
    ('shift-a','day-a','loc','2026-08-01','10:00','21:00','scheduled',0),
    ('shift-b','day-b','loc','2026-08-02','10:00','21:00','scheduled',0);
  INSERT INTO shift_assignments(shift_id,user_id) VALUES ('shift-a','u-a'),('shift-b','u-b');
`);

let sequence = 0;
const service = new StaffScheduleService(
  new CommandExecutor(new UnitOfWork(database, createSqliteStaffScheduleRepositories), { now: () => "2026-07-21T01:00:00.000Z" }, { resolve: (reference) => reference }),
  { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, outboxMaxAttempts: 8, createId: (kind) => `${kind}-${++sequence}` }
);
function metadata(key: string, userId: string): CommandMetadata {
  return { actorReference: { kind: "user", userId, authenticatedBy: "web_session" }, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
function body(result: ReturnType<StaffScheduleService["createExchange"]>) { return (result as { body: Record<string, any> }).body; }

assert.equal(service.saveProfile(metadata("profile-forbidden", "u-a"), "u-a", { position: "Продавец", hiredOn: "2026-01-01", status: "active" }).status, 403);
const profile = service.saveProfile(metadata("profile", "u-admin"), "u-a", { personnelNumber: "001", position: "Продавец", hiredOn: "2026-01-01", status: "active" });
assert.equal(profile.status, 201);
assert.deepEqual(service.saveProfile(metadata("profile", "u-admin"), "u-a", { personnelNumber: "001", position: "Продавец", hiredOn: "2026-01-01", status: "active" }), { ...profile, outcome: "replayed" });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM employee_profiles")[0].count, 1);

assert.equal(service.recordHrEvent(metadata("late-bad", "u-admin"), { userId: "u-b", type: "late", startDate: "2026-08-01" }).status, 400);
const hr = service.recordHrEvent(metadata("absence", "u-admin"), { userId: "u-b", type: "vacation", startDate: "2026-08-01", comment: "Согласовано" });
assert.equal(hr.status, 201);
assert.deepEqual(service.recordHrEvent(metadata("absence", "u-admin"), { userId: "u-b", type: "vacation", startDate: "2026-08-01", comment: "Согласовано" }), { ...hr, outcome: "replayed" });

const created = service.createExchange(metadata("exchange", "u-a"), { fromShiftId: "shift-a", toShiftId: "shift-b" });
assert.equal(created.status, 201);
assert.equal(body(created).toUserId, "u-b");
assert.equal(body(created).warnings.length, 1);
const exchangeId = String(body(created).id);
assert.equal(service.resolveExchange(metadata("wrong-accept", "u-other"), exchangeId, "accept").status, 403);
const accepted = service.resolveExchange(metadata("accept", "u-b"), exchangeId, "accept");
assert.equal(accepted.status, 200);
assert.deepEqual(service.resolveExchange(metadata("accept", "u-b"), exchangeId, "accept"), { ...accepted, outcome: "replayed" });
assert.deepEqual(database.query<{ shift_id: string; user_id: string }>("SELECT shift_id,user_id FROM shift_assignments ORDER BY shift_id"), [
  { shift_id: "shift-a", user_id: "u-b" }, { shift_id: "shift-b", user_id: "u-a" }
]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE type='exchange.accepted'")[0].count, 4);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM webapp_notifications WHERE type='exchange.accepted'")[0].count, 4);

assert.equal(service.resolveExchange(metadata("seller-revert", "u-a"), exchangeId, "cancel").status, 403);
assert.equal(service.resolveExchange(metadata("admin-revert", "u-admin"), exchangeId, "cancel").status, 200);
assert.deepEqual(database.query<{ shift_id: string; user_id: string }>("SELECT shift_id,user_id FROM shift_assignments ORDER BY shift_id"), [
  { shift_id: "shift-a", user_id: "u-a" }, { shift_id: "shift-b", user_id: "u-b" }
]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE entity_type IN ('employee_profile','hr_event','shift_exchange')")[0].count >= 5, true);

const faultService = new StaffScheduleService(
  new CommandExecutor(new UnitOfWork(database, (connection) => {
    const real = createSqliteStaffScheduleRepositories(connection);
    return { ...real, audit: { append(value, options) { real.audit.append(value, options); throw new Error("audit fault"); } } };
  }), { now: () => "2026-07-21T01:10:00.000Z" }, { resolve: (reference) => reference }),
  { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, outboxMaxAttempts: 8 }
);
assert.throws(() => faultService.recordHrEvent(metadata("fault-hr", "u-admin"), { userId: "u-a", type: "no_show", startDate: "2026-08-03" }), /transaction failed/i);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM hr_events WHERE user_id='u-a' AND start_date='2026-08-03'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='fault-hr'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("staff schedule service tests passed");
await import("./staff-schedule-concurrency.test");
