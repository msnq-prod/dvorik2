import assert from "node:assert/strict";
import { RowMappingError } from "./core";
import {
  rotationTemplateMapper,
  scheduleDayMapper,
  shiftAssignmentMapper,
  shiftMapper,
  shiftSwapRequestMapper
} from "./schedule";

const at = "2026-07-12T01:02:03.000Z";
const updatedAt = "2026-07-12T02:03:04.000Z";
const legacyAt = "2026-07-12 01:02:03";

const roundTrip = <T>(
  mapper: { fromRow(row: Record<string, unknown>): T; toRow(value: T): Record<string, unknown> },
  row: Record<string, unknown>
) => {
  const mapped = mapper.fromRow(row);
  assert.deepEqual(mapper.fromRow(mapper.toRow(mapped)), mapped);
  return mapped;
};

const day = roundTrip(scheduleDayMapper, {
  id: "day-1",
  local_date: "2028-02-29",
  location_id: "loc-1",
  status: "working",
  comment: "",
  version: 3,
  created_by_user_id: null,
  created_at: legacyAt,
  updated_at: updatedAt
});
assert.equal(day.date, "2028-02-29");
assert.equal(day.createdAt, at);
assert.equal(day.createdByUserId, undefined);
assert.equal(day.revision, "3");

const shift = roundTrip(shiftMapper, {
  id: "shift-1",
  schedule_day_id: "day-1",
  location_id: "loc-1",
  local_date: "2028-02-29",
  start_time: "09:15",
  end_time: "18:45",
  status: "scheduled",
  comment: "opening",
  version: 4,
  created_by_user_id: "user-admin",
  created_at: at,
  updated_at: updatedAt
});
assert.equal(shift.revision, "4");
assert.equal(shift.start, "09:15");
assert.equal(shift.end, "18:45");
assert.equal("employeeIds" in shift, false);
assert.equal(shiftMapper.toRow(shift).start_time, "09:15");
assert.equal(shiftMapper.toRow(shift).end_time, "18:45");

const assignment = roundTrip(shiftAssignmentMapper, {
  shift_id: "shift-1",
  user_id: "user-1",
  assigned_by_user_id: null,
  assigned_at: legacyAt
});
assert.equal(assignment.assignedByUserId, undefined);
assert.equal(assignment.assignedAt, at);

const pendingSwap = roundTrip(shiftSwapRequestMapper, {
  id: "swap-1",
  from_shift_id: "shift-1",
  from_user_id: "user-1",
  to_user_id: "user-2",
  source_shift_version: 4,
  status: "pending",
  created_at: legacyAt,
  resolved_at: null,
  resolved_by_user_id: null,
  version: 2,
  updated_at: updatedAt
});
assert.equal(pendingSwap.resolvedAt, undefined);
assert.equal(pendingSwap.sourceShiftRevision, "4");
assert.equal(pendingSwap.resolvedByUserId, undefined);
assert.equal(shiftSwapRequestMapper.toRow(pendingSwap).resolved_at, null);
assert.equal(shiftSwapRequestMapper.toRow(pendingSwap).resolved_by_user_id, null);
assert.equal(pendingSwap.version, 2);
assert.equal(pendingSwap.updatedAt, updatedAt);
assert.equal(pendingSwap.revision, "2");

const resolvedSwap = roundTrip(shiftSwapRequestMapper, {
  id: "swap-2",
  from_shift_id: "shift-1",
  from_user_id: "user-1",
  to_user_id: "user-2",
  source_shift_version: 4,
  status: "accepted",
  created_at: at,
  resolved_at: updatedAt,
  resolved_by_user_id: "user-admin",
  version: 7,
  updated_at: updatedAt
});
assert.equal(resolvedSwap.resolvedAt, updatedAt);
assert.equal(resolvedSwap.resolvedByUserId, "user-admin");

const template = roundTrip(rotationTemplateMapper, {
  id: "rotation-1",
  name: "Two by two",
  location_id: "loc-1",
  status: "active",
  cycle_json: JSON.stringify({ schemaVersion: 1, value: { days: ["work", "work", "off", "off"] } }),
  created_by_user_id: null,
  created_at: legacyAt,
  updated_at: updatedAt
});
assert.equal(template.cycle.schemaVersion, 1);
assert.deepEqual(template.cycle.value, { days: ["work", "work", "off", "off"] });
assert.equal(template.revision, updatedAt);

const legacyTemplate = rotationTemplateMapper.fromRow({
  id: "rotation-legacy",
  name: "Legacy",
  location_id: "loc-1",
  status: "archived",
  cycle_json: JSON.stringify({ days: [1, 0] }),
  created_by_user_id: null,
  created_at: legacyAt,
  updated_at: legacyAt
});
assert.equal(legacyTemplate.cycle.schemaVersion, 1);
assert.deepEqual(legacyTemplate.cycle.value, { days: [1, 0] });

assert.throws(() => scheduleDayMapper.fromRow({
  id: "day-bad-date", local_date: "2027-02-29", location_id: "loc-1", status: "working",
  comment: "", version: 0, created_by_user_id: null, created_at: at, updated_at: at
}), (error) => error instanceof RowMappingError
  && error.entity === "schedule_days" && error.entityId === "day-bad-date"
  && error.field === "local_date" && error.code === "DATE");

assert.throws(() => shiftMapper.fromRow({
  id: "shift-bad-status", schedule_day_id: "day-1", location_id: "loc-1", local_date: "2026-07-12",
  start_time: "09:00", end_time: "18:00", status: "unknown", comment: "", version: 0,
  created_by_user_id: null, created_at: at, updated_at: at
}), (error) => error instanceof RowMappingError
  && error.entity === "shifts" && error.entityId === "shift-bad-status"
  && error.field === "status" && error.code === "ENUM");

assert.throws(() => shiftMapper.fromRow({
  id: "shift-bad-time", schedule_day_id: "day-1", location_id: "loc-1", local_date: "2026-07-12",
  start_time: "24:00", end_time: "18:00", status: "scheduled", comment: "", version: 0,
  created_by_user_id: null, created_at: at, updated_at: at
}), (error) => error instanceof RowMappingError
  && error.entity === "shifts" && error.entityId === "shift-bad-time"
  && error.field === "start_time" && error.code === "DATE");

assert.throws(() => shiftSwapRequestMapper.fromRow({
  id: "swap-bad-version", from_shift_id: "shift-1", from_user_id: "user-1", to_user_id: "user-2",
  source_shift_version: 0, status: "pending", created_at: at, resolved_at: null, resolved_by_user_id: null, version: -1, updated_at: at
}), (error) => error instanceof RowMappingError
  && error.entity === "shift_swap_requests" && error.entityId === "swap-bad-version"
  && error.field === "version" && error.code === "INTEGER");

assert.throws(() => shiftAssignmentMapper.fromRow({
  shift_id: "shift-composite", user_id: "user-composite", assigned_by_user_id: null, assigned_at: "not-a-time"
}), (error) => error instanceof RowMappingError
  && error.entity === "shift_assignments" && error.entityId === "shift-composite/user-composite"
  && error.field === "assigned_at" && error.code === "TIMESTAMP");

const rotationBase = {
  name: "Broken",
  location_id: "loc-1",
  status: "active",
  created_by_user_id: null,
  created_at: at,
  updated_at: at
};
assert.throws(() => rotationTemplateMapper.fromRow({ id: "rotation-corrupt", ...rotationBase, cycle_json: "{" }),
  (error) => error instanceof RowMappingError && error.entityId === "rotation-corrupt" && error.field === "cycle_json" && error.code === "JSON");
assert.throws(() => rotationTemplateMapper.fromRow({
  id: "rotation-v2", ...rotationBase, cycle_json: JSON.stringify({ schemaVersion: 2, value: {} })
}), (error) => error instanceof RowMappingError && error.entityId === "rotation-v2" && error.field === "cycle_json" && error.code === "JSON_VERSION");
assert.throws(() => rotationTemplateMapper.fromRow({
  id: "rotation-array", ...rotationBase, cycle_json: JSON.stringify([1, 2])
}), (error) => error instanceof RowMappingError && error.entityId === "rotation-array" && error.field === "cycle_json" && error.code === "JSON");

assert.throws(() => shiftMapper.toRow({ ...shift, revision: "3" }), (error) => error instanceof RowMappingError && error.field === "version");
assert.throws(() => shiftSwapRequestMapper.toRow({ ...resolvedSwap, revision: "0" }), (error) => error instanceof RowMappingError && error.field === "version");
assert.throws(() => shiftSwapRequestMapper.toRow({ ...resolvedSwap, sourceShiftRevision: "01" }), (error) => error instanceof RowMappingError && error.field === "source_shift_version");
assert.throws(() => rotationTemplateMapper.toRow({ ...template, revision: at }), (error) => error instanceof RowMappingError && error.field === "revision");
assert.throws(() => shiftMapper.toRow({ ...shift, start: "24:00" }), (error) => error instanceof RowMappingError && error.field === "start_time");

console.log("schedule mapper tests passed");
