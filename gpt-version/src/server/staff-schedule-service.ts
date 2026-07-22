import { nanoid } from "nanoid";
import type { EmployeeProfile, HrEvent, HrEventType, Permission, Shift, ShiftExchangeRequest, UserStatus } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import type { AuditRepository, IdempotencyRepository, JsonObject, NotificationsRepository, OutboxRepository, RepositoryRecord, RolesRepository, ScheduleRepository, WriteResult } from "./repositories";

export type PersistedExchange = ShiftExchangeRequest & Readonly<{ fromShiftRevision: string; toShiftRevision: string; resolvedByUserId?: string }>;
export type StaffScheduleRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  schedule: Pick<ScheduleRepository, "findShift" | "saveShift" | "findAssignmentConflicts">;
  staff: Readonly<{
    userStatus(userId: string): UserStatus | undefined;
    activeUserIds(): readonly string[];
    profile(userId: string): RepositoryRecord<EmployeeProfile> | undefined;
    saveProfile(profile: EmployeeProfile, expectedRevision: string | null, at: string): WriteResult<EmployeeProfile>;
    appendHrEvent(event: HrEvent, at: string): boolean;
    exchange(id: string): RepositoryRecord<PersistedExchange> | undefined;
    saveExchange(exchange: PersistedExchange, expectedRevision: string | null, at: string): WriteResult<PersistedExchange>;
    absenceWarnings(userId: string, shift: Shift): readonly string[];
  }>;
  notifications: Pick<NotificationsRepository, "append">;
  outbox: Pick<OutboxRepository, "enqueue">;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

type Result = IdempotencyResult<JsonObject> | Readonly<{ outcome: "rejected"; status: 403; body: JsonObject }>;
type Options = Readonly<{ processingTimeoutMs: number; idempotencyRetentionMs: number; outboxMaxAttempts: number; createId?: (kind: "profile" | "hr" | "exchange" | "audit" | "notification" | "outbox") => string }>;

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}
function date(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function json(value: unknown): JsonObject { return JSON.parse(JSON.stringify(value)) as JsonObject; }

export class StaffScheduleService {
  private readonly createId: NonNullable<Options["createId"]>;
  constructor(private readonly executor: CommandExecutor<StaffScheduleRepositories>, private readonly options: Options) {
    this.createId = options.createId ?? (() => nanoid());
  }

  saveProfile(metadata: CommandMetadata, userId: string, input: Readonly<{ personnelNumber?: string; position: string; hiredOn: string; dismissedOn?: string; status: EmployeeProfile["status"]; expectedVersion?: number }>): Result {
    return this.command(metadata, "staff.profile.save", "staff:manage", json({ userId, ...input }), (context, actorId) => {
      if (context.transaction.repositories.staff.userStatus(userId) === undefined) return response(404, "USER_NOT_FOUND", "Пользователь не найден");
      if (!input.position?.trim() || !date(input.hiredOn) || (input.dismissedOn && !date(input.dismissedOn))) return response(400, "BAD_PROFILE", "Некорректный профиль сотрудника");
      if ((input.status === "active" && input.dismissedOn) || (input.status === "dismissed" && !input.dismissedOn)) return response(400, "BAD_EMPLOYMENT_STATUS", "Статус увольнения не согласован с датой");
      const current = context.transaction.repositories.staff.profile(userId);
      const expected = current ? String(input.expectedVersion ?? -1) : null;
      if (current && expected !== current.revision) return response(409, "STALE_PROFILE", "Профиль уже изменён", { currentVersion: Number(current.revision) });
      const profile: EmployeeProfile = { userId, personnelNumber: input.personnelNumber?.trim() || undefined, position: input.position.trim(), hiredOn: input.hiredOn, dismissedOn: input.dismissedOn, status: input.status, version: current ? Number(current.revision) + 1 : 0 };
      const saved = context.transaction.repositories.staff.saveProfile(profile, expected, context.clock.now());
      if ((!current && saved.outcome !== "created") || (current && saved.outcome !== "updated")) throw new Error("employee profile conditional write failed");
      this.audit(context, actorId, "employee_profile", userId, current ? "update" : "create", json(profile));
      return { status: current ? 200 : 201, body: json(profile) };
    });
  }

  recordHrEvent(metadata: CommandMetadata, input: Readonly<{ userId: string; type: HrEventType; startDate: string; endDate?: string; shiftId?: string; minutesLate?: number; comment?: string }>): Result {
    return this.command(metadata, "staff.hr_event.create", "staff:manage", json(input), (context, actorId) => {
      const endDate = input.endDate || input.startDate;
      if (!date(input.startDate) || !date(endDate) || input.startDate > endDate || !["vacation","sick_leave","late","no_show","partial_shift"].includes(input.type)) return response(400, "BAD_HR_EVENT", "Некорректное кадровое событие");
      if (context.transaction.repositories.staff.userStatus(input.userId) === undefined) return response(404, "USER_NOT_FOUND", "Сотрудник не найден");
      if ((input.type === "late") !== (Number.isSafeInteger(input.minutesLate) && Number(input.minutesLate) > 0)) return response(400, "BAD_LATE_MINUTES", "Для опоздания укажите минуты");
      if (input.shiftId) {
        const shift = context.transaction.repositories.schedule.findShift(input.shiftId);
        if (!shift || !shift.entity.employeeIds.includes(input.userId)) return response(409, "SHIFT_ASSIGNMENT_REQUIRED", "Сотрудник не назначен на смену");
      }
      const at = context.clock.now();
      const event: HrEvent = { id: this.createId("hr"), userId: input.userId, type: input.type, startDate: input.startDate, endDate, shiftId: input.shiftId, minutesLate: input.type === "late" ? input.minutesLate : undefined, comment: input.comment?.trim() || "", createdByUserId: actorId, createdAt: at };
      if (!context.transaction.repositories.staff.appendHrEvent(event, at)) throw new Error("HR event insert collided");
      this.audit(context, actorId, "hr_event", event.id, "create", json(event));
      return { status: 201, body: json(event) };
    });
  }

  createExchange(metadata: CommandMetadata, input: Readonly<{ fromShiftId: string; toShiftId: string }>): Result {
    return this.command(metadata, "schedule.exchange.create", undefined, input as unknown as JsonObject, (context, actorId) => {
      const repositories = context.transaction.repositories;
      const from = repositories.schedule.findShift(input.fromShiftId);
      const to = repositories.schedule.findShift(input.toShiftId);
      if (!from || !to || from.entity.id === to.entity.id) return response(400, "BAD_EXCHANGE_SHIFTS", "Нужны две разные смены");
      if (from.entity.status !== "scheduled" || to.entity.status !== "scheduled") return response(409, "SHIFT_NOT_SCHEDULED", "Обмен возможен только для запланированных смен");
      if (!from.entity.employeeIds.includes(actorId)) return response(403, "SOURCE_ASSIGNMENT_REQUIRED", "Можно обменять только свою смену");
      const candidates = to.entity.employeeIds.filter((id) => id !== actorId && repositories.staff.userStatus(id) === "active");
      if (candidates.length !== 1) return response(409, "TARGET_ASSIGNMENT_AMBIGUOUS", "Во второй смене должен быть один другой активный сотрудник");
      const toUserId = candidates[0];
      const warnings = [
        ...repositories.staff.absenceWarnings(toUserId, from.entity),
        ...repositories.staff.absenceWarnings(actorId, to.entity),
        ...repositories.schedule.findAssignmentConflicts({ date: from.entity.date, start: from.entity.start, end: from.entity.end, userIds: [toUserId], excludeShiftId: to.entity.id }).map(() => "У получателя есть пересечение смен"),
        ...repositories.schedule.findAssignmentConflicts({ date: to.entity.date, start: to.entity.start, end: to.entity.end, userIds: [actorId], excludeShiftId: from.entity.id }).map(() => "У инициатора есть пересечение смен")
      ];
      const at = context.clock.now();
      const exchange: PersistedExchange = { id: this.createId("exchange"), fromShiftId: from.entity.id, toShiftId: to.entity.id, fromUserId: actorId, toUserId, fromShiftRevision: from.revision, toShiftRevision: to.revision, status: "pending", warnings: [...new Set(warnings)], createdAt: at };
      const saved = repositories.staff.saveExchange(exchange, null, at);
      if (saved.outcome !== "created") return response(409, "EXCHANGE_ALREADY_PENDING", "Такой обмен уже ожидает ответа");
      this.audit(context, actorId, "shift_exchange", exchange.id, "create", json(exchange));
      this.deliver(context, [toUserId], "exchange.requested", exchange.id, json(exchange));
      return { status: 201, body: json(exchange) };
    });
  }

  resolveExchange(metadata: CommandMetadata, exchangeId: string, action: "accept" | "decline" | "cancel"): Result {
    return this.command(metadata, "schedule.exchange.resolve", undefined, { exchangeId, action }, (context, actorId, permissions) => {
      const repositories = context.transaction.repositories;
      const current = repositories.staff.exchange(exchangeId);
      if (!current) return response(404, "EXCHANGE_NOT_FOUND", "Обмен не найден");
      if (current.entity.status === "accepted" && action === "cancel") {
        if (!permissions.includes("schedule:manage")) return response(403, "ADMIN_REQUIRED", "Принятый обмен отменяет администратор");
        return this.revertAccepted(context, actorId, current);
      }
      if (current.entity.status !== "pending") return response(409, "STALE_EXCHANGE", "Обмен уже обработан");
      if (action === "cancel" ? actorId !== current.entity.fromUserId : actorId !== current.entity.toUserId) return response(403, "EXCHANGE_ACTOR_MISMATCH", "Действие недоступно этому сотруднику");
      if (action !== "accept") return this.finishExchange(context, actorId, current, action === "decline" ? "declined" : "cancelled");
      const from = repositories.schedule.findShift(current.entity.fromShiftId);
      const to = repositories.schedule.findShift(current.entity.toShiftId);
      if (!from || !to || from.revision !== current.entity.fromShiftRevision || to.revision !== current.entity.toShiftRevision) return this.finishExchange(context, actorId, current, "expired", 409);
      if (!from.entity.employeeIds.includes(current.entity.fromUserId) || !to.entity.employeeIds.includes(current.entity.toUserId)) return this.finishExchange(context, actorId, current, "expired", 409);
      this.swapAssignments(context, actorId, from, to, current.entity.fromUserId, current.entity.toUserId);
      return this.finishExchange(context, actorId, current, "accepted");
    });
  }

  private swapAssignments(context: CommandContext<StaffScheduleRepositories>, actorId: string, from: RepositoryRecord<Shift>, to: RepositoryRecord<Shift>, fromUserId: string, toUserId: string) {
    const first = { ...from.entity, employeeIds: from.entity.employeeIds.map((id) => id === fromUserId ? toUserId : id) };
    const second = { ...to.entity, employeeIds: to.entity.employeeIds.map((id) => id === toUserId ? fromUserId : id) };
    if (context.transaction.repositories.schedule.saveShift(first, { at: context.clock.now(), expectedRevision: from.revision, assignedByUserId: actorId }).outcome !== "updated") throw new Error("exchange source shift CAS failed");
    if (context.transaction.repositories.schedule.saveShift(second, { at: context.clock.now(), expectedRevision: to.revision, assignedByUserId: actorId }).outcome !== "updated") throw new Error("exchange target shift CAS failed");
  }

  private revertAccepted(context: CommandContext<StaffScheduleRepositories>, actorId: string, current: RepositoryRecord<PersistedExchange>) {
    const from = context.transaction.repositories.schedule.findShift(current.entity.fromShiftId);
    const to = context.transaction.repositories.schedule.findShift(current.entity.toShiftId);
    if (!from || !to || !from.entity.employeeIds.includes(current.entity.toUserId) || !to.entity.employeeIds.includes(current.entity.fromUserId)) return response(409, "EXCHANGE_REVERT_CONFLICT", "Назначения уже изменились");
    this.swapAssignments(context, actorId, from, to, current.entity.toUserId, current.entity.fromUserId);
    return this.finishExchange(context, actorId, current, "cancelled");
  }

  private finishExchange(context: CommandContext<StaffScheduleRepositories>, actorId: string, current: RepositoryRecord<PersistedExchange>, status: PersistedExchange["status"], httpStatus = 200) {
    const at = context.clock.now();
    const next = { ...current.entity, status, resolvedAt: at, resolvedByUserId: actorId };
    if (context.transaction.repositories.staff.saveExchange(next, current.revision, at).outcome !== "updated") throw new Error("exchange CAS failed");
    this.audit(context, actorId, "shift_exchange", next.id, status, { exchangeId: next.id, status });
    this.deliver(context, context.transaction.repositories.staff.activeUserIds(), `exchange.${status}`, next.id, { exchangeId: next.id, status });
    return { status: httpStatus, body: json(next) };
  }

  private command(metadata: CommandMetadata, scope: string, permission: Permission | undefined, request: JsonObject, run: (context: CommandContext<StaffScheduleRepositories>, actorId: string, permissions: readonly Permission[]) => Readonly<{ status: number; body: JsonObject }>): Result {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") } as const;
      const auth = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (auth.outcome !== "found" || (permission && !auth.snapshot.permissions.includes(permission))) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") } as const;
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, auth.snapshot.userId, auth.snapshot.permissions));
    }, { transactionMode: "immediate" });
  }

  private audit(context: CommandContext<StaffScheduleRepositories>, actorId: string, entity: string, entityId: string, action: string, changes: JsonObject) {
    const at = context.clock.now();
    const result = context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("staff audit insert collided");
  }

  private deliver(context: CommandContext<StaffScheduleRepositories>, userIds: readonly string[], type: string, eventId: string, payload: JsonObject) {
    const at = context.clock.now();
    for (const userId of [...new Set(userIds)]) {
      const notification = context.transaction.repositories.notifications.append({ id: this.createId("notification"), channel: "webapp", userId, type, payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } }, read: false, createdAt: at }, { at, expectedRevision: null });
      if (notification.outcome !== "created") throw new Error("exchange notification insert collided");
      const outbox = context.transaction.repositories.outbox.enqueue({ id: this.createId("outbox"), channel: "telegram", userId, type, payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } }, status: "pending", attemptCount: 0, maxAttempts: this.options.outboxMaxAttempts, availableAt: at, createdAt: at, idempotencyKey: `exchange:${eventId}:${type}:${userId}` }, { at, expectedRevision: null });
      if (outbox.outcome !== "created") throw new Error("exchange outbox insert collided");
    }
  }
}
