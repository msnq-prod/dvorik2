import type { EmployeeProfile, HrEvent } from "../shared/types";
import type { DatabaseContext } from "./database";
import type { RepositoryRecord, WriteResult } from "./repositories";
import type { PersistedExchange, StaffScheduleRepositories } from "./staff-schedule-service";
import { createSqliteScheduleCommandRepositories } from "./sqlite-schedule-command-repositories";

type Row = Readonly<Record<string, unknown>>;
function profile(row: Row): RepositoryRecord<EmployeeProfile> {
  const version = Number(row.version);
  return { entity: { userId: String(row.user_id), personnelNumber: row.personnel_number === null ? undefined : String(row.personnel_number), position: String(row.position), hiredOn: String(row.hired_on), dismissedOn: row.dismissed_on === null ? undefined : String(row.dismissed_on), status: row.status as EmployeeProfile["status"], version }, revision: String(version) };
}
function exchange(row: Row): RepositoryRecord<PersistedExchange> {
  const parsed = JSON.parse(String(row.warning_json)) as { value?: { warnings?: string[]; conflicts?: string[] } };
  return { entity: { id: String(row.id), fromShiftId: String(row.from_shift_id), toShiftId: String(row.to_shift_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), fromShiftRevision: String(row.from_shift_version), toShiftRevision: String(row.to_shift_version), status: row.status as PersistedExchange["status"], warnings: parsed.value?.warnings ?? parsed.value?.conflicts ?? [], createdAt: String(row.created_at), resolvedAt: row.resolved_at === null ? undefined : String(row.resolved_at), resolvedByUserId: row.resolved_by_user_id === null ? undefined : String(row.resolved_by_user_id) }, revision: String(row.version) };
}

export function createSqliteStaffScheduleRepositories(database: DatabaseContext): StaffScheduleRepositories {
  const schedule = createSqliteScheduleCommandRepositories(database);
  const currentProfile = (userId: string) => {
    const row = database.query<Row>("SELECT * FROM employee_profiles WHERE user_id=?", [userId])[0];
    return row ? profile(row) : undefined;
  };
  const currentExchange = (id: string) => {
    const row = database.query<Row>("SELECT * FROM shift_exchange_requests WHERE id=?", [id])[0];
    return row ? exchange(row) : undefined;
  };
  return {
    ...schedule,
    staff: {
      userStatus(userId) {
        return database.query<{ status: string }>("SELECT status FROM staff_user_snapshots WHERE platform_user_id=?", [userId])[0]?.status as ReturnType<StaffScheduleRepositories["staff"]["userStatus"]>;
      },
      activeUserIds() {
        return database.query<{ platform_user_id: string }>("SELECT platform_user_id FROM staff_user_snapshots WHERE status='active' ORDER BY platform_user_id").map((row) => row.platform_user_id);
      },
      profile: currentProfile,
      saveProfile(value, expectedRevision, at): WriteResult<EmployeeProfile> {
        if (expectedRevision === null) {
          const inserted = database.execute("INSERT INTO employee_profiles(user_id,personnel_number,position,hired_on,dismissed_on,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT DO NOTHING", [value.userId, value.personnelNumber ?? null, value.position, value.hiredOn, value.dismissedOn ?? null, value.status, at, at]);
          const current = currentProfile(value.userId);
          if (!current) throw new Error("employee profile insert collision");
          return inserted.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
        }
        const expected = Number(expectedRevision);
        const updated = database.execute("UPDATE employee_profiles SET personnel_number=?,position=?,hired_on=?,dismissed_on=?,status=?,version=version+1,updated_at=? WHERE user_id=? AND version=?", [value.personnelNumber ?? null, value.position, value.hiredOn, value.dismissedOn ?? null, value.status, at, value.userId, expected]);
        const current = currentProfile(value.userId);
        if (updated.changes === 1 && current) return { outcome: "updated", record: current };
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      },
      appendHrEvent(value: HrEvent, at) {
        return database.execute("INSERT INTO hr_events(id,user_id,type,start_date,end_date,shift_id,minutes_late,comment,created_by_user_id,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?) ON CONFLICT DO NOTHING", [value.id, value.userId, value.type, value.startDate, value.endDate, value.shiftId ?? null, value.minutesLate ?? null, value.comment, value.createdByUserId, value.createdAt, at]).changes === 1;
      },
      exchange: currentExchange,
      saveExchange(value, expectedRevision, at): WriteResult<PersistedExchange> {
        const warningJson = JSON.stringify({ schemaVersion: 1, value: { warnings: value.warnings } });
        if (expectedRevision === null) {
          const inserted = database.execute("INSERT INTO shift_exchange_requests(id,from_shift_id,to_shift_id,from_user_id,to_user_id,from_shift_version,to_shift_version,status,warning_json,created_at,resolved_at,resolved_by_user_id,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT DO NOTHING", [value.id, value.fromShiftId, value.toShiftId, value.fromUserId, value.toUserId, Number(value.fromShiftRevision), Number(value.toShiftRevision), value.status, warningJson, value.createdAt, value.resolvedAt ?? null, value.resolvedByUserId ?? null, at]);
          const current = currentExchange(value.id) ?? database.query<Row>("SELECT * FROM shift_exchange_requests WHERE from_shift_id=? AND to_shift_id=? AND from_user_id=? AND to_user_id=? AND status='pending'", [value.fromShiftId, value.toShiftId, value.fromUserId, value.toUserId]).map(exchange)[0];
          if (!current) throw new Error("exchange insert collision");
          return inserted.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
        }
        const expected = Number(expectedRevision);
        const updated = database.execute("UPDATE shift_exchange_requests SET status=?,warning_json=?,resolved_at=?,resolved_by_user_id=?,version=version+1,updated_at=? WHERE id=? AND version=?", [value.status, warningJson, value.resolvedAt ?? null, value.resolvedByUserId ?? null, at, value.id, expected]);
        const current = currentExchange(value.id);
        if (updated.changes === 1 && current) return { outcome: "updated", record: current };
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      },
      absenceWarnings(userId, value) {
        return database.query<{ type: string }>("SELECT DISTINCT type FROM hr_events WHERE user_id=? AND start_date<=? AND end_date>=? AND type IN ('vacation','sick_leave','no_show') ORDER BY type", [userId, value.date, value.date]).map((row) => `Кадровое событие: ${row.type}`);
      }
    }
  };
}
