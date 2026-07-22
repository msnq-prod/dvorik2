import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandExecutor, type CommandActorResolver, type CommandMetadata } from "./command-context";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import {
  ScheduleSwapService,
  type SaveShiftCommand,
  type ScheduleCommandRepositories,
  type ScheduleCommandResult
} from "./schedule-swap-service";
import { createSqliteScheduleCommandRepositories } from "./sqlite-schedule-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-schedule-service-"));
const database = openDatabase(path.join(directory, "schedule.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin'),('seller','seller');
  INSERT INTO permissions(id,code) VALUES ('schedule:manage','schedule:manage');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','schedule:manage');
  INSERT INTO users(id,status) VALUES
    ('u-admin','active'),('u-source','active'),('u-target','active'),('u-sibling','active'),
    ('u-other','active'),('u-blocked','blocked');
  INSERT INTO user_roles(user_id,role_id) VALUES
    ('u-admin','admin'),('u-source','seller'),('u-target','seller'),('u-sibling','seller'),
    ('u-other','seller'),('u-blocked','seller');
  INSERT INTO locations(id,code,name,type,status) VALUES
    ('loc-a','A','A','warehouse','active'),('loc-b','B','B','counter','active'),
    ('loc-old','OLD','Old','other','archived');
`);

const references = {
  admin: Object.freeze({ session: "admin" }),
  source: Object.freeze({ session: "source" }),
  target: Object.freeze({ session: "target" }),
  sibling: Object.freeze({ session: "sibling" }),
  other: Object.freeze({ session: "other" }),
  blocked: Object.freeze({ session: "blocked" })
} as const;
const referenceUsers = new Map<unknown, string>([
  [references.admin, "u-admin"], [references.source, "u-source"], [references.target, "u-target"],
  [references.sibling, "u-sibling"], [references.other, "u-other"], [references.blocked, "u-blocked"]
]);
const actorResolver: CommandActorResolver = {
  resolve(reference, channel) {
    if (channel !== "web") throw new Error("bad channel");
    const userId = referenceUsers.get(reference);
    if (!userId) throw new Error("untrusted");
    return { kind: "user", userId, authenticatedBy: "web_session" };
  }
};

let idSequence = 0;
function makeService(
  factory: (connection: DatabaseContext) => ScheduleCommandRepositories = createSqliteScheduleCommandRepositories,
  prefix = "main"
) {
  return new ScheduleSwapService(
    new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-12T06:00:00.000Z" }, actorResolver),
    {
      processingTimeoutMs: 60_000,
      idempotencyRetentionMs: 86_400_000,
      outboxMaxAttempts: 8,
      createId: (kind) => `${prefix}-${kind}-${++idSequence}`
    }
  );
}

const service = makeService();
function metadata(key: string, actorReference: unknown = references.admin): CommandMetadata {
  return { actorReference, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
function body(result: ScheduleCommandResult) {
  if (!("body" in result)) throw new Error("response body required");
  return result.body;
}
function code(result: ScheduleCommandResult) {
  return String(body(result).code ?? "");
}
function expectCode(result: ScheduleCommandResult, status: number, expectedCode: string) {
  assert.equal(result.status, status);
  assert.equal(code(result), expectedCode);
}
function shiftId(result: ScheduleCommandResult) {
  const id = body(result).id;
  assert.equal(typeof id, "string");
  return String(id);
}
function swapId(result: ScheduleCommandResult) {
  const id = body(result).id;
  assert.equal(typeof id, "string");
  return String(id);
}

const dayInput = { date: "2026-08-01", locationId: "loc-a", status: "working", comment: " open ", expectedVersion: null } as const;
assert.deepEqual(service.saveDay(metadata("day-forbidden", references.source), dayInput), {
  outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" }
});
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='day-forbidden'")[0].count, 0);
expectCode(service.saveDay(metadata("day-bad-date"), { ...dayInput, date: "2026-02-30" }), 400, "BAD_DATE");
expectCode(service.saveDay(metadata("day-bad-status"), { ...dayInput, status: "holiday" as never }), 400, "BAD_DAY_STATUS");
expectCode(service.saveDay(metadata("day-bad-location"), { ...dayInput, locationId: "loc-old" }), 404, "LOCATION_NOT_FOUND");

const createdDay = service.saveDay(metadata("day-create"), dayInput);
assert.equal(createdDay.status, 201);
assert.equal(body(createdDay).version, 0);
assert.equal(body(createdDay).comment, "open");
const updatedDay = service.saveDay(metadata("day-update"), { ...dayInput, status: "closed", comment: " closed ", expectedVersion: 0 });
assert.equal(updatedDay.status, 200);
assert.equal(body(updatedDay).version, 1);
expectCode(service.saveDay(metadata("day-stale"), { ...dayInput, expectedVersion: 0 }), 409, "STALE_DAY");

const baseShift: SaveShiftCommand = {
  date: "2026-08-02", start: "09:00", end: "17:00", locationId: "loc-a",
  employeeIds: ["u-source"], status: "scheduled", comment: "base", expectedVersion: null
};
expectCode(service.saveShift(metadata("shift-forbidden", references.source), baseShift), 403, "FORBIDDEN");
expectCode(service.saveShift(metadata("shift-bad-date"), { ...baseShift, date: "2026-13-01" }), 400, "BAD_DATE");
expectCode(service.saveShift(metadata("shift-bad-time"), { ...baseShift, start: "17:00", end: "09:00" }), 400, "BAD_SHIFT_INTERVAL");
expectCode(service.saveShift(metadata("shift-empty-employees"), { ...baseShift, employeeIds: [] }), 400, "BAD_ASSIGNMENTS");
expectCode(service.saveShift(metadata("shift-bad-employees"), { ...baseShift, employeeIds: ["u-source", "u-source"] }), 400, "BAD_ASSIGNMENTS");
expectCode(service.saveShift(metadata("shift-bad-status"), { ...baseShift, status: "completed" }), 400, "BAD_INITIAL_SHIFT_STATUS");
expectCode(service.saveShift(metadata("shift-blocked"), { ...baseShift, employeeIds: ["u-blocked"] }), 409, "INACTIVE_EMPLOYEE");
expectCode(service.saveShift(metadata("shift-old-location"), { ...baseShift, locationId: "loc-old" }), 404, "LOCATION_NOT_FOUND");

service.saveDay(metadata("closed-day"), { date: "2026-08-03", locationId: "loc-a", status: "closed", expectedVersion: null });
expectCode(service.saveShift(metadata("shift-closed-day"), { ...baseShift, date: "2026-08-03" }), 409, "DAY_CLOSED");

const createdShift = service.saveShift(metadata("shift-create"), baseShift);
assert.equal(createdShift.status, 201);
assert.equal(body(createdShift).version, 0);
const mainShiftId = shiftId(createdShift);
assert.deepEqual(database.query<{ version: number }>("SELECT version FROM shifts WHERE id=?", [mainShiftId]), [{ version: 0 }]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM schedule_days WHERE local_date='2026-08-02' AND location_id='loc-a'")[0].count, 1);

const updatedShift = service.saveShift(metadata("shift-update"), {
  ...baseShift, id: mainShiftId, comment: "changed", expectedVersion: 0
});
assert.equal(updatedShift.status, 200);
assert.equal(body(updatedShift).version, 1);
expectCode(service.saveShift(metadata("shift-stale"), { ...baseShift, id: mainShiftId, expectedVersion: 0 }), 409, "STALE_SHIFT");
expectCode(service.saveShift(metadata("shift-transition"), { ...baseShift, id: mainShiftId, status: "completed", expectedVersion: 1 }), 409, "INVALID_SHIFT_TRANSITION");
expectCode(service.saveShift(metadata("shift-conflict"), {
  ...baseShift, date: "2026-08-02", start: "16:00", end: "18:00", locationId: "loc-b"
}), 409, "SHIFT_CONFLICT");
assert.equal(service.saveShift(metadata("shift-boundary"), {
  ...baseShift, date: "2026-08-02", start: "17:00", end: "18:00", locationId: "loc-b"
}).status, 201);
expectCode(service.saveDay(metadata("day-close-active"), {
  date: "2026-08-02", locationId: "loc-a", status: "closed", expectedVersion: 0
}), 409, "DAY_HAS_ACTIVE_SHIFTS");

const firstSwap = service.createSwap(metadata("swap-create", references.source), { shiftId: mainShiftId, toUserId: "u-target" });
assert.equal(firstSwap.status, 201);
const firstSwapId = swapId(firstSwap);
assert.deepEqual(service.createSwap(metadata("swap-create", references.source), { shiftId: mainShiftId, toUserId: "u-target" }), {
  ...firstSwap, outcome: "replayed"
});
assert.deepEqual(service.createSwap(metadata("swap-create", references.source), { shiftId: mainShiftId, toUserId: "u-sibling" }), {
  outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
});
expectCode(service.createSwap(metadata("swap-blocked", references.source), { shiftId: mainShiftId, toUserId: "u-blocked" }), 409, "TARGET_USER_INACTIVE");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=? ORDER BY user_id", [mainShiftId]), [{ user_id: "u-source" }]);

const siblingSwap = service.createSwap(metadata("swap-sibling", references.source), { shiftId: mainShiftId, toUserId: "u-sibling" });
assert.equal(siblingSwap.status, 201);
const siblingSwapId = swapId(siblingSwap);
expectCode(service.resolveSwap(metadata("swap-foreign", references.sibling), { swapId: firstSwapId, action: "decline" }), 403, "SWAP_ACTOR_MISMATCH");

const countsBeforeAccept = database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0];
const accepted = service.resolveSwap(metadata("swap-accept", references.target), { swapId: firstSwapId, action: "accept" });
assert.equal(accepted.status, 200);
assert.equal(body(accepted).status, "accepted");
assert.equal(body(accepted).shiftVersion, 2);
assert.deepEqual(body(accepted).cancelledSiblingIds, [siblingSwapId]);
assert.deepEqual(service.resolveSwap(metadata("swap-accept", references.target), { swapId: firstSwapId, action: "accept" }), {
  ...accepted, outcome: "replayed"
});
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [mainShiftId]), [{ user_id: "u-target" }]);
assert.deepEqual(database.query<{ id: string; status: string }>("SELECT id,status FROM shift_swap_requests WHERE id IN (?,?) ORDER BY id", [firstSwapId, siblingSwapId]),
  [{ id: firstSwapId, status: "accepted" }, { id: siblingSwapId, status: "cancelled" }].sort((left, right) => left.id.localeCompare(right.id)));
const countsAfterAccept = database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0];
assert.deepEqual(countsAfterAccept, {
  audits: countsBeforeAccept.audits + 2,
  notifications: countsBeforeAccept.notifications + 2,
  outbox: countsBeforeAccept.outbox + 2
});
assert.deepEqual(database.query<{ type: string; recipient_user_id: string }>(
  "SELECT type,recipient_user_id FROM webapp_notifications WHERE type IN ('swap.accepted','swap.cancelled') ORDER BY type"
), [{ type: "swap.accepted", recipient_user_id: "u-source" }, { type: "swap.cancelled", recipient_user_id: "u-sibling" }]);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE request_id='http:swap-accept'")[0].count, 2);
expectCode(service.resolveSwap(metadata("swap-stale", references.target), { swapId: firstSwapId, action: "decline" }), 409, "STALE_SWAP");
assert.deepEqual(database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0], countsAfterAccept);

const blockedShift = service.saveShift(metadata("blocked-shift"), { ...baseShift, date: "2026-08-04" });
const blockedShiftId = shiftId(blockedShift);
const pendingBlocked = service.createSwap(metadata("blocked-pending", references.source), { shiftId: blockedShiftId, toUserId: "u-other" });
const pendingBlockedId = swapId(pendingBlocked);
database.execute("UPDATE users SET status='blocked' WHERE id='u-other'");
expectCode(service.resolveSwap(metadata("blocked-accept", references.other), { swapId: pendingBlockedId, action: "accept" }), 403, "FORBIDDEN");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [blockedShiftId]), [{ user_id: "u-source" }]);
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [pendingBlockedId]), [{ status: "pending" }]);
database.execute("UPDATE users SET status='active' WHERE id='u-other'");

const closedAfterPreviewShift = service.saveShift(metadata("closed-after-preview-shift"), { ...baseShift, date: "2026-08-05" });
const closedAfterPreviewShiftId = shiftId(closedAfterPreviewShift);
const closedAfterPreviewSwap = service.createSwap(metadata("closed-after-preview-swap", references.source), {
  shiftId: closedAfterPreviewShiftId, toUserId: "u-other"
});
const closedAfterPreviewSwapId = swapId(closedAfterPreviewSwap);
database.execute("UPDATE schedule_days SET status='closed', version=version+1 WHERE local_date='2026-08-05' AND location_id='loc-a'");
expectCode(service.resolveSwap(metadata("closed-after-preview-accept", references.other), {
  swapId: closedAfterPreviewSwapId, action: "accept"
}), 409, "DAY_CLOSED");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [closedAfterPreviewShiftId]), [{ user_id: "u-source" }]);
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [closedAfterPreviewSwapId]), [{ status: "pending" }]);

const conflictAfterPreviewShift = service.saveShift(metadata("conflict-after-preview-shift"), { ...baseShift, date: "2026-08-06" });
const conflictAfterPreviewShiftId = shiftId(conflictAfterPreviewShift);
const conflictAfterPreviewSwap = service.createSwap(metadata("conflict-after-preview-swap", references.source), {
  shiftId: conflictAfterPreviewShiftId, toUserId: "u-sibling"
});
const conflictAfterPreviewSwapId = swapId(conflictAfterPreviewSwap);
assert.equal(service.saveShift(metadata("conflict-after-preview-new-shift"), {
  ...baseShift, date: "2026-08-06", start: "12:00", end: "18:00", locationId: "loc-b", employeeIds: ["u-sibling"]
}).status, 201);
expectCode(service.resolveSwap(metadata("conflict-after-preview-accept", references.sibling), {
  swapId: conflictAfterPreviewSwapId, action: "accept"
}), 409, "TARGET_SHIFT_CONFLICT");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [conflictAfterPreviewShiftId]), [{ user_id: "u-source" }]);
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [conflictAfterPreviewSwapId]), [{ status: "pending" }]);

const staleSourceShift = service.saveShift(metadata("stale-source-shift"), { ...baseShift, date: "2026-08-07" });
const staleSourceShiftId = shiftId(staleSourceShift);
const staleSourceSwap = service.createSwap(metadata("stale-source-swap", references.source), {
  shiftId: staleSourceShiftId, toUserId: "u-target"
});
const staleSourceSwapId = swapId(staleSourceSwap);
assert.equal(service.saveShift(metadata("stale-source-edit"), {
  ...baseShift, id: staleSourceShiftId, date: "2026-08-07", employeeIds: ["u-other"], expectedVersion: 0
}).status, 200);
const staleSourceEventCounts = database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0];
expectCode(service.resolveSwap(metadata("stale-source-accept", references.target), {
  swapId: staleSourceSwapId, action: "accept"
}), 409, "STALE_SWAP");
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM shift_assignments WHERE shift_id=? AND user_id='u-target'", [staleSourceShiftId])[0].count, 0);
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [staleSourceSwapId]), [{ status: "expired" }]);
assert.deepEqual(database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0], {
  audits: staleSourceEventCounts.audits + 1,
  notifications: staleSourceEventCounts.notifications + 1,
  outbox: staleSourceEventCounts.outbox + 1
});

const cancelledAfterPreviewShift = service.saveShift(metadata("cancelled-preview-shift"), { ...baseShift, date: "2026-09-02" });
const cancelledAfterPreviewShiftId = shiftId(cancelledAfterPreviewShift);
const cancelledAfterPreviewSwapId = swapId(service.createSwap(metadata("cancelled-preview-swap", references.source), {
  shiftId: cancelledAfterPreviewShiftId, toUserId: "u-target"
}));
assert.equal(service.saveShift(metadata("cancelled-preview-edit"), {
  ...baseShift, id: cancelledAfterPreviewShiftId, date: "2026-09-02", status: "cancelled", expectedVersion: 0
}).status, 200);
const cancelledEventCounts = database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0];
expectCode(service.resolveSwap(metadata("cancelled-preview-accept", references.target), {
  swapId: cancelledAfterPreviewSwapId, action: "accept"
}), 409, "STALE_SWAP");
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [cancelledAfterPreviewSwapId]), [{ status: "expired" }]);
assert.deepEqual(database.query<{ audits: number; notifications: number; outbox: number }>(`
  SELECT (SELECT count(*) FROM audit_entries) audits,
         (SELECT count(*) FROM webapp_notifications) notifications,
         (SELECT count(*) FROM outbox_messages) outbox
`)[0], {
  audits: cancelledEventCounts.audits + 1,
  notifications: cancelledEventCounts.notifications + 1,
  outbox: cancelledEventCounts.outbox + 1
});

const staleVersionShift = service.saveShift(metadata("stale-version-shift"), { ...baseShift, date: "2026-08-08" });
const staleVersionShiftId = shiftId(staleVersionShift);
const staleVersionSwap = service.createSwap(metadata("stale-version-swap", references.source), {
  shiftId: staleVersionShiftId, toUserId: "u-target"
});
const staleVersionSwapId = swapId(staleVersionSwap);
assert.equal(service.saveShift(metadata("stale-version-edit"), {
  ...baseShift, id: staleVersionShiftId, date: "2026-08-08", comment: "changed after preview", expectedVersion: 0
}).status, 200);
const staleVersionAccept = service.resolveSwap(metadata("stale-version-accept", references.target), {
  swapId: staleVersionSwapId, action: "accept"
});
expectCode(staleVersionAccept, 409, "STALE_SWAP");
assert.deepEqual(body(staleVersionAccept).details, {
  swapId: staleVersionSwapId, expectedShiftVersion: 0, currentShiftVersion: 1, currentStatus: "expired"
});
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [staleVersionShiftId]), [{ user_id: "u-source" }]);
assert.deepEqual(database.query<{ status: string }>("SELECT status FROM shift_swap_requests WHERE id=?", [staleVersionSwapId]), [{ status: "expired" }]);
const freshAfterStale = service.createSwap(metadata("fresh-after-stale", references.source), {
  shiftId: staleVersionShiftId, toUserId: "u-target"
});
assert.equal(freshAfterStale.status, 201);
assert.notEqual(swapId(freshAfterStale), staleVersionSwapId);
assert.equal(body(freshAfterStale).sourceShiftRevision, "1");

const refreshShift = service.saveShift(metadata("refresh-shift"), { ...baseShift, date: "2026-09-01" });
const refreshShiftId = shiftId(refreshShift);
const obsoleteSwapId = swapId(service.createSwap(metadata("refresh-obsolete-swap", references.source), {
  shiftId: refreshShiftId, toUserId: "u-sibling"
}));
assert.equal(service.saveShift(metadata("refresh-shift-edit"), {
  ...baseShift, id: refreshShiftId, date: "2026-09-01", comment: "new preview", expectedVersion: 0
}).status, 200);
const replacementSwap = service.createSwap(metadata("refresh-replacement-swap", references.source), {
  shiftId: refreshShiftId, toUserId: "u-sibling"
});
assert.equal(replacementSwap.status, 201);
assert.notEqual(swapId(replacementSwap), obsoleteSwapId);
assert.deepEqual(database.query<{ id: string; status: string }>(
  "SELECT id,status FROM shift_swap_requests WHERE id IN (?,?) ORDER BY id",
  [obsoleteSwapId, swapId(replacementSwap)]
), [
  { id: obsoleteSwapId, status: "expired" },
  { id: swapId(replacementSwap), status: "pending" }
].sort((left, right) => left.id.localeCompare(right.id)));

const sourceBlockedShift = service.saveShift(metadata("source-blocked-shift"), { ...baseShift, date: "2026-08-09" });
const sourceBlockedShiftId = shiftId(sourceBlockedShift);
const sourceBlockedSwapId = swapId(service.createSwap(metadata("source-blocked-swap", references.source), {
  shiftId: sourceBlockedShiftId, toUserId: "u-target"
}));
database.execute("UPDATE users SET status='blocked' WHERE id='u-source'");
expectCode(service.resolveSwap(metadata("source-blocked-accept", references.target), {
  swapId: sourceBlockedSwapId, action: "accept"
}), 409, "SOURCE_USER_INACTIVE");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [sourceBlockedShiftId]), [{ user_id: "u-source" }]);
database.execute("UPDATE users SET status='active' WHERE id='u-source'");

const inactiveLocationShift = service.saveShift(metadata("inactive-location-shift"), { ...baseShift, date: "2026-08-30", locationId: "loc-b" });
const inactiveLocationShiftId = shiftId(inactiveLocationShift);
const inactiveLocationSwapId = swapId(service.createSwap(metadata("inactive-location-swap", references.source), {
  shiftId: inactiveLocationShiftId, toUserId: "u-target"
}));
database.execute("UPDATE locations SET status='archived' WHERE id='loc-b'");
expectCode(service.resolveSwap(metadata("inactive-location-accept", references.target), {
  swapId: inactiveLocationSwapId, action: "accept"
}), 409, "LOCATION_INACTIVE");
assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [inactiveLocationShiftId]), [{ user_id: "u-source" }]);
database.execute("UPDATE locations SET status='active' WHERE id='loc-b'");

const provenanceShift = service.saveShift(metadata("provenance-shift"), {
  ...baseShift, date: "2026-08-31", employeeIds: ["u-source", "u-other"]
});
const provenanceShiftId = shiftId(provenanceShift);
const unchangedProvenance = database.query<{ assigned_by_user_id: string; assigned_at: string }>(
  "SELECT assigned_by_user_id,assigned_at FROM shift_assignments WHERE shift_id=? AND user_id='u-other'",
  [provenanceShiftId]
)[0];
assert.equal(service.saveShift(metadata("provenance-comment"), {
  ...baseShift, id: provenanceShiftId, date: "2026-08-31", employeeIds: ["u-source", "u-other"],
  comment: "comment only", expectedVersion: 0
}).status, 200);
assert.deepEqual(database.query<{ assigned_by_user_id: string; assigned_at: string }>(
  "SELECT assigned_by_user_id,assigned_at FROM shift_assignments WHERE shift_id=? AND user_id='u-other'",
  [provenanceShiftId]
)[0], unchangedProvenance);
const provenanceSwapId = swapId(service.createSwap(metadata("provenance-swap", references.source), {
  shiftId: provenanceShiftId, toUserId: "u-target"
}));
assert.equal(service.resolveSwap(metadata("provenance-accept", references.target), {
  swapId: provenanceSwapId, action: "accept"
}).status, 200);
assert.deepEqual(database.query<{ assigned_by_user_id: string; assigned_at: string }>(
  "SELECT assigned_by_user_id,assigned_at FROM shift_assignments WHERE shift_id=? AND user_id='u-other'",
  [provenanceShiftId]
)[0], unchangedProvenance);
assert.deepEqual(database.query<{ assigned_by_user_id: string }>(
  "SELECT assigned_by_user_id FROM shift_assignments WHERE shift_id=? AND user_id='u-target'",
  [provenanceShiftId]
), [{ assigned_by_user_id: "u-target" }]);

type FaultStage = "shift" | "assignment" | "saveSwap" | "sibling" | "audit" | "notification" | "outbox" | "completion";
function faultFactory(stage: FaultStage) {
  return (connection: DatabaseContext): ScheduleCommandRepositories => {
    let assignmentWrites = 0;
    const guardedConnection: DatabaseContext = stage === "assignment" ? {
      query: connection.query.bind(connection),
      execute(sql, parameters) {
        const result = connection.execute(sql, parameters);
        if (/^\s*INSERT INTO shift_assignments\b/.test(sql) && ++assignmentWrites === 1) throw new Error(stage);
        return result;
      }
    } : connection;
    const real = createSqliteScheduleCommandRepositories(guardedConnection);
    let swapWrites = 0;
    return {
      ...real,
      schedule: {
        ...real.schedule,
        saveShift(shift, options) {
          const result = real.schedule.saveShift(shift, options);
          if (stage === "shift") throw new Error(stage);
          return result;
        },
        saveSwap(swap, options) {
          const result = real.schedule.saveSwap(swap, options);
          swapWrites += 1;
          if (stage === "saveSwap" && swapWrites === 1) throw new Error(stage);
          if (stage === "sibling" && swapWrites === 2) throw new Error(stage);
          return result;
        }
      },
      audit: {
        append(entry, options) {
          const result = real.audit.append(entry, options);
          if (stage === "audit") throw new Error(stage);
          return result;
        }
      },
      notifications: {
        append(notification, options) {
          const result = real.notifications.append(notification, options);
          if (stage === "notification") throw new Error(stage);
          return result;
        }
      },
      outbox: {
        enqueue(message, options) {
          const result = real.outbox.enqueue(message, options);
          if (stage === "outbox") throw new Error(stage);
          return result;
        }
      },
      idempotency: stage === "completion" ? {
        ...real.idempotency,
        find: real.idempotency.find.bind(real.idempotency),
        reserve: real.idempotency.reserve.bind(real.idempotency),
        complete(record) {
          return { outcome: "stale", current: real.idempotency.find(record.scope, record.key)! };
        },
        fail: real.idempotency.fail.bind(real.idempotency),
        deleteExpired: real.idempotency.deleteExpired.bind(real.idempotency)
      } : real.idempotency
    };
  };
}

type Counts = { assignments: number; accepted: number; cancelled: number; audits: number; notifications: number; outbox: number };
function acceptanceCounts(shift: string) {
  return database.query<Counts>(`
    SELECT (SELECT count(*) FROM shift_assignments WHERE shift_id=?) assignments,
           (SELECT count(*) FROM shift_swap_requests WHERE from_shift_id=? AND status='accepted') accepted,
           (SELECT count(*) FROM shift_swap_requests WHERE from_shift_id=? AND status='cancelled') cancelled,
           (SELECT count(*) FROM audit_entries) audits,
           (SELECT count(*) FROM webapp_notifications) notifications,
           (SELECT count(*) FROM outbox_messages) outbox
  `, [shift, shift, shift])[0];
}

let faultDay = 10;
for (const stage of ["shift", "assignment", "saveSwap", "sibling", "audit", "notification", "outbox", "completion"] as const) {
  const date = `2026-08-${String(faultDay++).padStart(2, "0")}`;
  const preparedShift = service.saveShift(metadata(`prepare-shift-${stage}`), {
    ...baseShift, date, ...(stage === "assignment" ? { employeeIds: ["u-source", "u-other"] } : {})
  });
  const preparedShiftId = shiftId(preparedShift);
  const preparedSwap = service.createSwap(metadata(`prepare-swap-${stage}`, references.source), { shiftId: preparedShiftId, toUserId: "u-target" });
  const preparedSwapId = swapId(preparedSwap);
  service.createSwap(metadata(`prepare-sibling-${stage}`, references.source), { shiftId: preparedShiftId, toUserId: "u-sibling" });
  const beforeCounts = acceptanceCounts(preparedShiftId);
  const beforeAssignment = database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [preparedShiftId]);
  const faultService = makeService(faultFactory(stage), `fault-${stage}`);
  const key = `accept-fault-${stage}`;
  assert.throws(
    () => faultService.resolveSwap(metadata(key, references.target), { swapId: preparedSwapId, action: "accept" }),
    (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED"
  );
  assert.deepEqual(database.query<{ user_id: string }>("SELECT user_id FROM shift_assignments WHERE shift_id=?", [preparedShiftId]), beforeAssignment);
  assert.deepEqual(acceptanceCounts(preparedShiftId), beforeCounts);
  assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key=?", [key])[0].count, 0);
}

const dayAndShiftFaultService = makeService(faultFactory("shift"), "fault-day-shift");
assert.throws(
  () => dayAndShiftFaultService.saveShift(metadata("fault-day-shift-create"), { ...baseShift, date: "2026-08-29" }),
  (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED"
);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM schedule_days WHERE local_date='2026-08-29'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM shifts WHERE local_date='2026-08-29'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='fault-day-shift-create'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("schedule swap service focused tests passed");
