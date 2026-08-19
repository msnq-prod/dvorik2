import type { Permission, Role, ScheduleDay, Shift, UserStatus } from "../shared/types";
import type { DatabaseContext, SqlValue } from "./database";
import { locationMapper } from "./mappers/catalog";
import { rolePermissionMapper, userMapper, userRoleMapper } from "./mappers/identity";
import {
  scheduleDayMapper,
  shiftAssignmentMapper,
  shiftMapper,
  shiftSwapRequestMapper
} from "./mappers/schedule";
import {
  auditEntryFromRow,
  auditEntryToRow,
  outboxMessageFromRow,
  outboxMessageToRow,
  webappNotificationFromRow,
  webappNotificationToRow
} from "./mappers/workflows";
import type {
  CreateOptions,
  RepositoryAuditEntry,
  RepositoryNotification,
  RepositoryOutboxMessage,
  RepositoryRecord,
  RepositoryShiftSwap,
  WriteOptions,
  WriteResult
} from "./repositories";
import type { ScheduleCommandRepositories } from "./schedule-swap-service";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";

type Row = Readonly<Record<string, unknown>>;

function first<T extends Row>(database: DatabaseContext, sql: string, parameters: readonly SqlValue[]): T | undefined {
  return database.query<T>(sql, parameters)[0];
}

function values(row: Record<string, SqlValue>, columns: readonly string[]): SqlValue[] {
  return columns.map((column) => row[column]);
}

function revisionNumber(revision: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(revision)) return undefined;
  const value = Number(revision);
  return Number.isSafeInteger(value) ? value : undefined;
}

function assertCreateOptions(options: CreateOptions): void {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}

function locationRecord(database: DatabaseContext, locationId: string) {
  const row = first<Row>(database, "SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row) return undefined;
  const mapped = locationMapper.fromRow(row);
  const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision, ...location } = mapped;
  return { entity: location, revision };
}

function dayRecord(database: DatabaseContext, date: string, locationId: string): RepositoryRecord<ScheduleDay> | undefined {
  const row = first<Row>(database, "SELECT * FROM schedule_days WHERE local_date = ? AND location_id = ?", [date, locationId]);
  if (!row) return undefined;
  const mapped = scheduleDayMapper.fromRow(row);
  const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision, ...day } = mapped;
  return { entity: day, revision };
}

function dayRecordById(database: DatabaseContext, dayId: string): RepositoryRecord<ScheduleDay> | undefined {
  const row = first<Row>(database, "SELECT * FROM schedule_days WHERE id = ?", [dayId]);
  if (!row) return undefined;
  const mapped = scheduleDayMapper.fromRow(row);
  const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision, ...day } = mapped;
  return { entity: day, revision };
}

function shiftRecord(database: DatabaseContext, shiftId: string): RepositoryRecord<Shift> | undefined {
  const row = first<Row>(database, "SELECT * FROM shifts WHERE id = ?", [shiftId]);
  if (!row) return undefined;
  const mapped = shiftMapper.fromRow(row);
  const assignments = database.query<Row>(
    "SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id",
    [shiftId]
  ).map((assignment) => shiftAssignmentMapper.fromRow(assignment).userId);
  const {
    scheduleDayId: _scheduleDayId,
    version: _version,
    createdByUserId: _createdByUserId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    revision,
    ...shift
  } = mapped;
  return { entity: { ...shift, employeeIds: assignments }, revision };
}

function swapRecord(database: DatabaseContext, swapId: string): RepositoryRecord<RepositoryShiftSwap> | undefined {
  const row = first<Row>(database, "SELECT * FROM shift_swap_requests WHERE id = ?", [swapId]);
  if (!row) return undefined;
  const mapped = shiftSwapRequestMapper.fromRow(row);
  const { version: _version, updatedAt: _updatedAt, revision, ...swap } = mapped;
  return { entity: swap, revision };
}

function notificationRecord(database: DatabaseContext, notificationId: string): RepositoryRecord<RepositoryNotification> | undefined {
  const row = first<Row>(database, "SELECT * FROM webapp_notifications WHERE id = ?", [notificationId]);
  if (!row) return undefined;
  const mapped = webappNotificationFromRow(row);
  return { entity: mapped.entity.notification, revision: mapped.revision };
}

function outboxRecord(
  database: DatabaseContext,
  messageId: string,
  channel?: string,
  idempotencyKey?: string
): RepositoryRecord<RepositoryOutboxMessage> | undefined {
  const row = first<Row>(
    database,
    channel && idempotencyKey
      ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1"
      : "SELECT * FROM outbox_messages WHERE id = ?",
    channel && idempotencyKey ? [messageId, channel, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return undefined;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}

function auditRecord(database: DatabaseContext, entryId: string): RepositoryRecord<RepositoryAuditEntry> | undefined {
  const row = first<Row>(database, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return undefined;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}

function createRolesRepository(database: DatabaseContext): ScheduleCommandRepositories["roles"] {
  return {
    getAuthorization(userId) {
      const rawUser = first<Row>(database, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };

      const roles = database.query<Row>("SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id", [userId])
        .map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(roles)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };

      const role = distinctRoles[0] as Role;
      const permissions = database.query<Row>("SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id", [role])
        .map((row) => rolePermissionMapper.fromRow(row).permission) as Permission[];
      return { outcome: "found", snapshot: { userId, role, permissions, revision: user.revision } };
    }
  };
}

function createParticipantsRepository(database: DatabaseContext): ScheduleCommandRepositories["participants"] {
  return {
    findStatus(userId): UserStatus | undefined {
      const row = first<Row>(database, "SELECT * FROM users WHERE id = ?", [userId]);
      return row ? userMapper.fromRow(row).status : undefined;
    }
  };
}

function createScheduleRepository(database: DatabaseContext): ScheduleCommandRepositories["schedule"] {
  return {
    findDay: (date, locationId) => dayRecord(database, date, locationId),

    hasBlockingShifts(date, locationId) {
      return first<Row>(
        database,
        "SELECT 1 AS present FROM shifts WHERE local_date = ? AND location_id = ? AND status IN ('draft','scheduled','in_progress') LIMIT 1",
        [date, locationId]
      ) !== undefined;
    },

    saveDay(day, options): WriteResult<ScheduleDay> {
      const persisted = scheduleDayMapper.toRow({
        ...day,
        createdAt: options.at,
        updatedAt: options.at,
        revision: String(day.version)
      });
      const columns = [
        "id", "local_date", "location_id", "status", "comment", "version",
        "created_by_user_id", "created_at", "updated_at"
      ] as const;

      if (options.expectedRevision === null) {
        if (day.version !== 0) throw new TypeError("A new schedule day must start at version 0");
        const result = database.execute(
          `INSERT INTO schedule_days(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values(persisted, columns)
        );
        const current = dayRecord(database, day.date, day.locationId) ?? dayRecordById(database, day.id);
        if (!current) throw new Error("schedule day insert did not create or find a row");
        return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
      }

      const expected = revisionNumber(options.expectedRevision);
      if (expected === undefined) {
        const current = dayRecordById(database, day.id);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      if (!Number.isSafeInteger(expected + 1) || day.version !== expected + 1) {
        throw new TypeError("A schedule day update must increment version by exactly one");
      }
      const result = database.execute(
        `UPDATE schedule_days
         SET local_date = ?, location_id = ?, status = ?, comment = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [persisted.local_date, persisted.location_id, persisted.status, persisted.comment, persisted.version, persisted.updated_at, day.id, expected]
      );
      const current = dayRecordById(database, day.id);
      if (result.changes === 1) {
        if (!current) throw new Error("schedule day update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },

    findShift: (shiftId) => shiftRecord(database, shiftId),

    saveShift(shift, options): WriteResult<Shift> {
      if (new Set(shift.employeeIds).size !== shift.employeeIds.length) {
        throw new TypeError("Shift assignments must be unique");
      }
      const expected = options.expectedRevision === null ? null : revisionNumber(options.expectedRevision);
      if (options.expectedRevision !== null && expected === undefined) {
        const current = shiftRecord(database, shift.id);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      const version = expected === null ? 0 : expected! + 1;
      if (!Number.isSafeInteger(version)) throw new TypeError("Shift version exceeds safe integer range");
      const day = dayRecord(database, shift.date, shift.locationId);
      if (!day) throw new Error("Cannot save a shift without its schedule day");
      const existingRow = first<Row>(database, "SELECT * FROM shifts WHERE id = ?", [shift.id]);
      const existing = existingRow ? shiftMapper.fromRow(existingRow) : undefined;
      const persisted = shiftMapper.toRow({
        ...shift,
        scheduleDayId: day.entity.id,
        version,
        createdByUserId: existing?.createdByUserId ?? options.assignedByUserId,
        createdAt: existing?.createdAt ?? options.at,
        updatedAt: options.at,
        revision: String(version)
      });
      const columns = [
        "id", "schedule_day_id", "location_id", "local_date", "start_time", "end_time", "status", "comment",
        "version", "created_by_user_id", "created_at", "updated_at"
      ] as const;

      if (expected === null) {
        const result = database.execute(
          `INSERT INTO shifts(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values(persisted, columns)
        );
        if (result.changes !== 1) {
          const current = shiftRecord(database, shift.id);
          if (!current) throw new Error("shift insert collided without a readable row");
          return { outcome: "duplicate", current };
        }
      } else {
        const result = database.execute(
          `UPDATE shifts
           SET schedule_day_id = ?, location_id = ?, local_date = ?, start_time = ?, end_time = ?,
               status = ?, comment = ?, version = ?, updated_at = ?
           WHERE id = ? AND version = ?`,
          [
            persisted.schedule_day_id, persisted.location_id, persisted.local_date, persisted.start_time,
            persisted.end_time, persisted.status, persisted.comment, persisted.version, persisted.updated_at,
            shift.id, expected!
          ]
        );
        if (result.changes !== 1) {
          const current = shiftRecord(database, shift.id);
          return current ? { outcome: "stale", current } : { outcome: "missing" };
        }
      }

      const existingAssignments = new Set(database.query<Row>(
        "SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id",
        [shift.id]
      ).map((row) => shiftAssignmentMapper.fromRow(row).userId));
      const desiredAssignments = new Set(shift.employeeIds);
      for (const userId of existingAssignments) {
        if (desiredAssignments.has(userId)) continue;
        const deleted = database.execute("DELETE FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [shift.id, userId]);
        if (deleted.changes !== 1) throw new Error("shift assignment delete lost its row");
      }
      for (const userId of shift.employeeIds) {
        if (existingAssignments.has(userId)) continue;
        const assignment = shiftAssignmentMapper.toRow({
          shiftId: shift.id,
          userId,
          assignedByUserId: options.assignedByUserId,
          assignedAt: options.at
        });
        const inserted = database.execute(
          `INSERT INTO shift_assignments(shift_id, user_id, assigned_by_user_id, assigned_at)
           VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [assignment.shift_id, assignment.user_id, assignment.assigned_by_user_id, assignment.assigned_at]
        );
        if (inserted.changes !== 1) throw new Error("duplicate shift assignment in write input");
      }
      const record = shiftRecord(database, shift.id);
      if (!record) throw new Error("shift write lost its row");
      return expected === null ? { outcome: "created", record } : { outcome: "updated", record };
    },

    findAssignmentConflicts(input) {
      if (input.userIds.length === 0) return [];
      const placeholders = input.userIds.map(() => "?").join(", ");
      const rows = database.query<{ user_id: string }>(
        `SELECT DISTINCT sa.user_id
         FROM shift_assignments sa
         JOIN shifts s ON s.id = sa.shift_id
         WHERE s.local_date = ?
           AND s.status <> 'cancelled'
           AND s.start_time < ?
           AND s.end_time > ?
           AND sa.user_id IN (${placeholders})
           ${input.excludeShiftId ? "AND s.id <> ?" : ""}
         ORDER BY sa.user_id`,
        [input.date, input.end, input.start, ...input.userIds, ...(input.excludeShiftId ? [input.excludeShiftId] : [])]
      );
      return rows.map((row) => row.user_id);
    },

    findSwap: (swapId) => swapRecord(database, swapId),

    saveSwap(swap, options): WriteResult<RepositoryShiftSwap> {
      const expected = options.expectedRevision === null ? null : revisionNumber(options.expectedRevision);
      if (options.expectedRevision !== null && expected === undefined) {
        const current = swapRecord(database, swap.id);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      const version = expected === null ? 0 : expected! + 1;
      if (!Number.isSafeInteger(version)) throw new TypeError("Swap version exceeds safe integer range");
      const persisted = shiftSwapRequestMapper.toRow({ ...swap, version, updatedAt: options.at, revision: String(version) });
      const columns = [
        "id", "from_shift_id", "from_user_id", "to_user_id", "source_shift_version", "status", "created_at",
        "resolved_at", "resolved_by_user_id", "version", "updated_at"
      ] as const;

      if (expected === null) {
        const result = database.execute(
          `INSERT INTO shift_swap_requests(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          values(persisted, columns)
        );
        let current = swapRecord(database, swap.id);
        if (!current && swap.status === "pending") {
          const row = first<Row>(
            database,
            "SELECT id FROM shift_swap_requests WHERE from_shift_id = ? AND from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
            [swap.fromShiftId, swap.fromUserId, swap.toUserId]
          );
          if (typeof row?.id === "string") current = swapRecord(database, row.id);
        }
        if (!current) throw new Error("swap insert did not create or find a row");
        return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
      }

      const result = database.execute(
        `UPDATE shift_swap_requests
         SET status = ?, resolved_at = ?, resolved_by_user_id = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
        [persisted.status, persisted.resolved_at, persisted.resolved_by_user_id, persisted.version, persisted.updated_at, swap.id, expected!]
      );
      const current = swapRecord(database, swap.id);
      if (result.changes === 1) {
        if (!current) throw new Error("swap update lost its row");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },

    listPendingSiblingSwaps(input) {
      return database.query<Row>(
        `SELECT * FROM shift_swap_requests
         WHERE from_shift_id = ? AND from_user_id = ? AND status = 'pending' AND id <> ?
         ORDER BY created_at, id`,
        [input.fromShiftId, input.fromUserId, input.excludeSwapId]
      ).map((row) => {
        const mapped = shiftSwapRequestMapper.fromRow(row);
        const { version: _version, updatedAt: _updatedAt, revision, ...swap } = mapped;
        return { entity: swap, revision };
      });
    }
  };
}

function createNotificationsRepository(database: DatabaseContext): ScheduleCommandRepositories["notifications"] {
  return {
    append(notification, options) {
      assertCreateOptions(options);
      const mapped = webappNotificationToRow({ entity: { notification, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "recipient_user_id", "type", "payload_json", "is_read", "created_at", "read_at", "version", "updated_at"] as const;
      const result = database.execute(
        `INSERT INTO webapp_notifications(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = notificationRecord(database, notification.id);
      if (!current) throw new Error("notification insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

function createOutboxRepository(database: DatabaseContext): ScheduleCommandRepositories["outbox"] {
  return {
    enqueue(message, options) {
      assertCreateOptions(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id", "channel", "recipient_user_id", "type", "payload_json", "status", "idempotency_key",
        "attempt_count", "max_attempts", "available_at", "last_error", "last_error_code", "lease_owner",
        "lease_token", "lease_expires_at", "failed_at", "sent_at", "created_at", "version", "updated_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = outboxRecord(database, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

function createAuditRepository(database: DatabaseContext): ScheduleCommandRepositories["audit"] {
  return {
    append(entry, options) {
      assertCreateOptions(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = ["id", "actor_id", "entity_type", "entity_id", "action", "changes_json", "request_id", "created_at", "version", "updated_at"] as const;
      const result = database.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = auditRecord(database, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

export function createSqliteScheduleCommandRepositories(database: DatabaseContext): ScheduleCommandRepositories {
  return Object.freeze({
    roles: createRolesRepository(database),
    participants: createParticipantsRepository(database),
    locations: { findById: (locationId) => locationRecord(database, locationId) },
    schedule: createScheduleRepository(database),
    notifications: createNotificationsRepository(database),
    outbox: createOutboxRepository(database),
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}
