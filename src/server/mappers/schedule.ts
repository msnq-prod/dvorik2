import type { ScheduleDay, Shift, ShiftSwapRequest } from "../../shared/types";
import type { JsonObject, RotationTemplate } from "../repositories";
import {
  enumValue,
  integer,
  localDate,
  nullableString,
  nullableUtcTimestamp,
  requiredString,
  RowMappingError,
  rowIdentity,
  serializeVersionedJson,
  toNullable,
  utcTimestamp,
  versionedJson,
  type DatabaseRow,
  type PersistedRow
} from "./core";

const scheduleDayStatuses = ["working", "closed"] as const satisfies readonly ScheduleDay["status"][];
const shiftStatuses = ["draft", "scheduled", "in_progress", "completed", "cancelled"] as const satisfies readonly Shift["status"][];
const swapStatuses = ["pending", "accepted", "declined", "cancelled", "expired"] as const satisfies readonly ShiftSwapRequest["status"][];
const rotationTemplateStatuses = ["active", "archived"] as const satisfies readonly RotationTemplate["status"][];

export type MappedScheduleDay = ScheduleDay & {
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
};

/** A persisted shift row. Assignment aggregation remains a repository concern. */
export type MappedShift = {
  id: string;
  scheduleDayId: string;
  locationId: string;
  date: string;
  start: string;
  end: string;
  status: Shift["status"];
  comment: string;
  version: number;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
};

export type MappedShiftAssignment = {
  shiftId: string;
  userId: string;
  assignedByUserId?: string;
  assignedAt: string;
};

export type MappedShiftSwapRequest = ShiftSwapRequest & {
  sourceShiftRevision: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
  version: number;
  updatedAt: string;
  revision: string;
};

export type MappedRotationTemplate = RotationTemplate & {
  createdAt: string;
  updatedAt: string;
  revision: string;
};

function version(entity: "schedule_days" | "shifts" | "shift_swap_requests", row: DatabaseRow) {
  const value = integer(entity, row, "version");
  if (value < 0) throw new RowMappingError(entity, rowIdentity(row), "version", "INTEGER");
  return value;
}

function versionForWrite(entity: "schedule_days" | "shifts" | "shift_swap_requests", id: string, value: number, revision: string) {
  if (!Number.isSafeInteger(value) || value < 0 || revision !== String(value)) {
    throw new RowMappingError(entity, id, "version", "INTEGER");
  }
  return value;
}

function sourceShiftRevision(row: DatabaseRow) {
  const value = integer("shift_swap_requests", row, "source_shift_version");
  if (value < 0) throw new RowMappingError("shift_swap_requests", rowIdentity(row), "source_shift_version", "INTEGER");
  return String(value);
}

function sourceShiftRevisionForWrite(id: string, revision: string) {
  if (!/^(?:0|[1-9]\d*)$/.test(revision)) {
    throw new RowMappingError("shift_swap_requests", id, "source_shift_version", "INTEGER");
  }
  const value = Number(revision);
  if (!Number.isSafeInteger(value)) throw new RowMappingError("shift_swap_requests", id, "source_shift_version", "INTEGER");
  return value;
}

function timestampRevision(entity: string, id: string, revision: string, updatedAt: string) {
  if (revision !== updatedAt) throw new RowMappingError(entity, id, "revision", "TIMESTAMP");
  return updatedAt;
}

function localTime(row: DatabaseRow, field: "start_time" | "end_time") {
  const value = requiredString("shifts", row, field);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RowMappingError("shifts", rowIdentity(row), field, "DATE");
  }
  return value;
}

function rotationCycle(row: DatabaseRow): RotationTemplate["cycle"] {
  const cycle = versionedJson<JsonObject>("rotation_templates", row, "cycle_json");
  if (cycle.value === null || Array.isArray(cycle.value) || typeof cycle.value !== "object") {
    throw new RowMappingError("rotation_templates", rowIdentity(row), "cycle_json", "JSON");
  }
  return cycle;
}

export const scheduleDayMapper = {
  fromRow(row: DatabaseRow): MappedScheduleDay {
    const mappedVersion = version("schedule_days", row);
    const updatedAt = utcTimestamp("schedule_days", row, "updated_at");
    return {
      id: requiredString("schedule_days", row, "id"),
      date: localDate("schedule_days", row, "local_date"),
      locationId: requiredString("schedule_days", row, "location_id"),
      status: enumValue("schedule_days", row, "status", scheduleDayStatuses),
      comment: requiredString("schedule_days", row, "comment"),
      version: mappedVersion,
      createdByUserId: nullableString("schedule_days", row, "created_by_user_id"),
      createdAt: utcTimestamp("schedule_days", row, "created_at"),
      updatedAt,
      revision: String(mappedVersion)
    };
  },
  toRow(value: MappedScheduleDay): PersistedRow {
    return {
      id: value.id,
      local_date: value.date,
      location_id: value.locationId,
      status: value.status,
      comment: value.comment,
      version: versionForWrite("schedule_days", value.id, value.version, value.revision),
      created_by_user_id: toNullable(value.createdByUserId),
      created_at: value.createdAt,
      updated_at: value.updatedAt
    };
  }
};

export const shiftMapper = {
  fromRow(row: DatabaseRow): MappedShift {
    const mappedVersion = version("shifts", row);
    const updatedAt = utcTimestamp("shifts", row, "updated_at");
    return {
      id: requiredString("shifts", row, "id"),
      scheduleDayId: requiredString("shifts", row, "schedule_day_id"),
      locationId: requiredString("shifts", row, "location_id"),
      date: localDate("shifts", row, "local_date"),
      start: localTime(row, "start_time"),
      end: localTime(row, "end_time"),
      status: enumValue("shifts", row, "status", shiftStatuses),
      comment: requiredString("shifts", row, "comment"),
      version: mappedVersion,
      createdByUserId: nullableString("shifts", row, "created_by_user_id"),
      createdAt: utcTimestamp("shifts", row, "created_at"),
      updatedAt,
      revision: String(mappedVersion)
    };
  },
  toRow(value: MappedShift): PersistedRow {
    return {
      id: value.id,
      schedule_day_id: value.scheduleDayId,
      location_id: value.locationId,
      local_date: localDate("shifts", { id: value.id, local_date: value.date }, "local_date"),
      start_time: localTime({ id: value.id, start_time: value.start }, "start_time"),
      end_time: localTime({ id: value.id, end_time: value.end }, "end_time"),
      status: value.status,
      comment: value.comment,
      version: versionForWrite("shifts", value.id, value.version, value.revision),
      created_by_user_id: toNullable(value.createdByUserId),
      created_at: value.createdAt,
      updated_at: value.updatedAt
    };
  }
};

const assignmentIdentity = ["shift_id", "user_id"] as const;

export const shiftAssignmentMapper = {
  fromRow(row: DatabaseRow): MappedShiftAssignment {
    return {
      shiftId: requiredString("shift_assignments", row, "shift_id", assignmentIdentity),
      userId: requiredString("shift_assignments", row, "user_id", assignmentIdentity),
      assignedByUserId: nullableString("shift_assignments", row, "assigned_by_user_id", assignmentIdentity),
      assignedAt: utcTimestamp("shift_assignments", row, "assigned_at", assignmentIdentity)
    };
  },
  toRow(value: MappedShiftAssignment): PersistedRow {
    return {
      shift_id: value.shiftId,
      user_id: value.userId,
      assigned_by_user_id: toNullable(value.assignedByUserId),
      assigned_at: value.assignedAt
    };
  }
};

export const shiftSwapRequestMapper = {
  fromRow(row: DatabaseRow): MappedShiftSwapRequest {
    const mappedVersion = version("shift_swap_requests", row);
    return {
      id: requiredString("shift_swap_requests", row, "id"),
      fromShiftId: requiredString("shift_swap_requests", row, "from_shift_id"),
      fromUserId: requiredString("shift_swap_requests", row, "from_user_id"),
      toUserId: requiredString("shift_swap_requests", row, "to_user_id"),
      sourceShiftRevision: sourceShiftRevision(row),
      status: enumValue("shift_swap_requests", row, "status", swapStatuses),
      createdAt: utcTimestamp("shift_swap_requests", row, "created_at"),
      resolvedAt: nullableUtcTimestamp("shift_swap_requests", row, "resolved_at"),
      resolvedByUserId: nullableString("shift_swap_requests", row, "resolved_by_user_id"),
      version: mappedVersion,
      updatedAt: utcTimestamp("shift_swap_requests", row, "updated_at"),
      revision: String(mappedVersion)
    };
  },
  toRow(value: MappedShiftSwapRequest): PersistedRow {
    return {
      id: value.id,
      from_shift_id: value.fromShiftId,
      from_user_id: value.fromUserId,
      to_user_id: value.toUserId,
      source_shift_version: sourceShiftRevisionForWrite(value.id, value.sourceShiftRevision),
      status: value.status,
      created_at: value.createdAt,
      resolved_at: toNullable(value.resolvedAt),
      resolved_by_user_id: toNullable(value.resolvedByUserId),
      version: versionForWrite("shift_swap_requests", value.id, value.version, value.revision),
      updated_at: value.updatedAt
    };
  }
};

export const rotationTemplateMapper = {
  fromRow(row: DatabaseRow): MappedRotationTemplate {
    const updatedAt = utcTimestamp("rotation_templates", row, "updated_at");
    return {
      id: requiredString("rotation_templates", row, "id"),
      name: requiredString("rotation_templates", row, "name"),
      locationId: requiredString("rotation_templates", row, "location_id"),
      status: enumValue("rotation_templates", row, "status", rotationTemplateStatuses),
      cycle: rotationCycle(row),
      createdByUserId: nullableString("rotation_templates", row, "created_by_user_id"),
      createdAt: utcTimestamp("rotation_templates", row, "created_at"),
      updatedAt,
      revision: updatedAt
    };
  },
  toRow(value: MappedRotationTemplate): PersistedRow {
    return {
      id: value.id,
      name: value.name,
      location_id: value.locationId,
      status: value.status,
      cycle_json: serializeVersionedJson(value.cycle),
      created_by_user_id: toNullable(value.createdByUserId),
      created_at: value.createdAt,
      updated_at: timestampRevision("rotation_templates", value.id, value.revision, value.updatedAt)
    };
  }
};
