import { nanoid } from "nanoid";
import type { ScheduleDay, Shift, ShiftSwapRequest, UserStatus } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult, type IdempotentHttpResponse } from "./idempotency";
import type {
  AuditRepository,
  AuthorizationLookup,
  CreateResult,
  IdempotencyRepository,
  JsonObject,
  LocationsRepository,
  NotificationsRepository,
  OutboxRepository,
  RepositoryRecord,
  RepositoryShiftSwap,
  RolesRepository,
  ScheduleRepository,
  UtcTimestamp,
  WriteResult
} from "./repositories";

export type ScheduleParticipantsRepository = Readonly<{
  findStatus(userId: string): UserStatus | undefined;
}>;

export type ScheduleCommandRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  participants: ScheduleParticipantsRepository;
  locations: Pick<LocationsRepository, "findById">;
  schedule: Pick<ScheduleRepository,
    "findDay" | "hasBlockingShifts" | "saveDay" | "findShift" | "saveShift" |
    "findAssignmentConflicts" | "findSwap" | "saveSwap" | "listPendingSiblingSwaps">;
  notifications: Pick<NotificationsRepository, "append">;
  outbox: Pick<OutboxRepository, "enqueue">;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

export type SaveScheduleDayCommand = Readonly<{
  date: string;
  locationId: string;
  status: ScheduleDay["status"];
  comment?: string;
  expectedVersion: number | null;
}>;

export type SaveShiftCommand = Readonly<{
  id?: string;
  date: string;
  start: string;
  end: string;
  locationId: string;
  employeeIds: readonly string[];
  status: Shift["status"];
  comment?: string;
  expectedVersion: number | null;
}>;

export type CreateSwapCommand = Readonly<{
  shiftId: string;
  toUserId: string;
}>;

export type ResolveSwapCommand = Readonly<{
  swapId: string;
  action: "accept" | "decline" | "cancel";
}>;

export type ScheduleCommandResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403;
  body: JsonObject;
}>;

export type ScheduleSwapServiceOptions = Readonly<{
  processingTimeoutMs: number;
  idempotencyRetentionMs: number;
  outboxMaxAttempts: number;
  createId?: (kind: "day" | "shift" | "swap" | "audit" | "notification" | "outbox") => string;
}>;

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

function activeAuthorization(context: CommandContext<ScheduleCommandRepositories>): AuthorizationLookup | undefined {
  if (context.actor.kind !== "user") return undefined;
  return context.transaction.repositories.roles.getAuthorization(context.actor.userId);
}

function writeCreated<T>(result: CreateResult<T>, entity: string): void {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}

function writeMutated<T>(result: WriteResult<T>, entity: string, create: boolean): RepositoryRecord<T> {
  if (create && result.outcome === "created") return result.record;
  if (!create && result.outcome === "updated") return result.record;
  throw new Error(`${entity} conditional write failed inside immediate transaction`);
}

function canonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function expectedRevision(value: number): string | undefined {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
}

function uniqueEmployeeIds(values: readonly string[]): string[] | undefined {
  if (!Array.isArray(values) || values.length === 0 || values.length > 3) return undefined;
  const normalized = values.map((value) => typeof value === "string" ? value.trim() : "");
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) return undefined;
  return normalized;
}

const editableShiftStatuses = new Set<Shift["status"]>(["draft", "scheduled"]);
const allowedShiftTransitions: Readonly<Record<Shift["status"], readonly Shift["status"][]>> = {
  draft: ["draft", "scheduled", "cancelled"],
  scheduled: ["scheduled", "in_progress", "cancelled"],
  in_progress: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: []
};

export class ScheduleSwapService {
  private readonly createId: NonNullable<ScheduleSwapServiceOptions["createId"]>;

  constructor(
    private readonly executor: CommandExecutor<ScheduleCommandRepositories>,
    private readonly options: ScheduleSwapServiceOptions
  ) {
    this.createId = options.createId ?? (() => nanoid());
  }

  saveDay(metadata: CommandMetadata, input: SaveScheduleDayCommand): ScheduleCommandResult {
    return this.executor.execute(metadata, (context) => {
      const authorization = activeAuthorization(context);
      if (!authorization || authorization.outcome !== "found" || !authorization.snapshot.permissions.includes("schedule:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      return executeIdempotently(context, "schedule.day.save", {
        date: input.date,
        locationId: input.locationId,
        status: input.status,
        comment: input.comment ?? "",
        expectedVersion: input.expectedVersion
      }, this.idempotencyOptions(), () => this.applySaveDay(context, authorization.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }

  saveShift(metadata: CommandMetadata, input: SaveShiftCommand): ScheduleCommandResult {
    return this.executor.execute(metadata, (context) => {
      const authorization = activeAuthorization(context);
      if (!authorization || authorization.outcome !== "found" || !authorization.snapshot.permissions.includes("schedule:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      return executeIdempotently(context, "schedule.shift.save", {
        id: input.id ?? null,
        date: input.date,
        start: input.start,
        end: input.end,
        locationId: input.locationId,
        employeeIds: [...input.employeeIds],
        status: input.status,
        comment: input.comment ?? "",
        expectedVersion: input.expectedVersion
      }, this.idempotencyOptions(), () => this.applySaveShift(context, authorization.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }

  createSwap(metadata: CommandMetadata, input: CreateSwapCommand): ScheduleCommandResult {
    return this.executor.execute(metadata, (context) => {
      const authorization = activeAuthorization(context);
      if (!authorization || authorization.outcome !== "found") {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      return executeIdempotently(context, "schedule.swap.create", {
        shiftId: input.shiftId,
        toUserId: input.toUserId
      }, this.idempotencyOptions(), () => this.applyCreateSwap(context, authorization.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }

  resolveSwap(metadata: CommandMetadata, input: ResolveSwapCommand): ScheduleCommandResult {
    return this.executor.execute(metadata, (context) => {
      const authorization = activeAuthorization(context);
      if (!authorization || authorization.outcome !== "found") {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      return executeIdempotently(context, "schedule.swap.resolve", {
        swapId: input.swapId,
        action: input.action
      }, this.idempotencyOptions(), () => this.applyResolveSwap(context, authorization.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }

  private idempotencyOptions() {
    return { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs };
  }

  private applySaveDay(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    input: SaveScheduleDayCommand
  ): IdempotentHttpResponse<JsonObject> {
    if (!canonicalDate(input.date)) return response(400, "BAD_DATE", "Некорректная дата");
    if (!input.locationId.trim()) return response(400, "BAD_LOCATION_ID", "Локация не указана");
    if (input.status !== "working" && input.status !== "closed") return response(400, "BAD_DAY_STATUS", "Некорректный статус дня");
    const expected = input.expectedVersion === null ? null : expectedRevision(input.expectedVersion);
    if (input.expectedVersion !== null && expected === undefined) return response(400, "BAD_EXPECTED_VERSION", "Некорректная версия");

    const repositories = context.transaction.repositories;
    const location = repositories.locations.findById(input.locationId);
    if (!location || location.entity.status !== "active") return response(404, "LOCATION_NOT_FOUND", "Локация не найдена");
    const current = repositories.schedule.findDay(input.date, input.locationId);
    if (expected === null && current) return response(409, "DAY_EXISTS", "День уже существует", { currentVersion: current.entity.version });
    if (expected !== null && !current) return response(404, "DAY_NOT_FOUND", "День не найден");
    if (expected !== null && current?.revision !== expected) {
      return response(409, "STALE_DAY", "День уже изменён", { currentVersion: current?.entity.version ?? null });
    }
    if (input.status === "closed" && repositories.schedule.hasBlockingShifts(input.date, input.locationId)) {
      return response(409, "DAY_HAS_ACTIVE_SHIFTS", "Нельзя закрыть день с активными сменами");
    }

    const at = context.clock.now();
    const next: ScheduleDay = {
      id: current?.entity.id ?? this.createId("day"),
      date: input.date,
      locationId: input.locationId,
      status: input.status,
      comment: input.comment?.trim() ?? "",
      version: current ? current.entity.version + 1 : 0
    };
    const saved = writeMutated(repositories.schedule.saveDay(next, expected === null
      ? { at, expectedRevision: null }
      : { at, expectedRevision: expected! }), "schedule day", expected === null);
    this.audit(context, actorId, "schedule_day", next.id, current ? "update" : "create", {
      date: next.date, locationId: next.locationId, status: next.status, comment: next.comment,
      version: Number(saved.revision), correlationId: context.correlationId
    }, at);
    return { status: current ? 200 : 201, body: { ...next, version: Number(saved.revision) } };
  }

  private applySaveShift(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    input: SaveShiftCommand
  ): IdempotentHttpResponse<JsonObject> {
    if (!canonicalDate(input.date)) return response(400, "BAD_DATE", "Некорректная дата");
    if (!canonicalTime(input.start) || !canonicalTime(input.end) || input.start >= input.end) {
      return response(400, "BAD_SHIFT_INTERVAL", "Некорректный интервал смены");
    }
    const employeeIds = uniqueEmployeeIds(input.employeeIds);
    if (!employeeIds) return response(400, "BAD_ASSIGNMENTS", "В смене должен быть список от одного до трёх уникальных сотрудников");
    const expected = input.expectedVersion === null ? null : expectedRevision(input.expectedVersion);
    if (input.expectedVersion !== null && expected === undefined) return response(400, "BAD_EXPECTED_VERSION", "Некорректная версия");
    if (expected === null && input.id) return response(400, "CREATE_SHIFT_ID_FORBIDDEN", "ID новой смены назначается сервером");
    if (expected !== null && !input.id) return response(400, "SHIFT_ID_REQUIRED", "ID смены обязателен");
    if (expected === null && !editableShiftStatuses.has(input.status)) {
      return response(400, "BAD_INITIAL_SHIFT_STATUS", "Новую смену можно создать только как draft или scheduled");
    }

    const repositories = context.transaction.repositories;
    const location = repositories.locations.findById(input.locationId);
    if (!location || location.entity.status !== "active") return response(404, "LOCATION_NOT_FOUND", "Локация не найдена");
    for (const userId of employeeIds) {
      if (repositories.participants.findStatus(userId) !== "active") {
        return response(409, "INACTIVE_EMPLOYEE", "Сотрудник недоступен", { userId });
      }
    }

    const current = input.id ? repositories.schedule.findShift(input.id) : undefined;
    if (expected !== null && !current) return response(404, "SHIFT_NOT_FOUND", "Смена не найдена");
    if (expected !== null && current?.revision !== expected) {
      return response(409, "STALE_SHIFT", "Смена уже изменена", { currentVersion: current ? Number(current.revision) : null });
    }
    if (current && !allowedShiftTransitions[current.entity.status].includes(input.status)) {
      return response(409, "INVALID_SHIFT_TRANSITION", "Недопустимый переход статуса", { currentStatus: current.entity.status });
    }

    const day = repositories.schedule.findDay(input.date, input.locationId);
    if (day?.entity.status === "closed") return response(409, "DAY_CLOSED", "День закрыт");
    const conflicts = input.status === "cancelled" ? [] : repositories.schedule.findAssignmentConflicts({
      date: input.date, start: input.start, end: input.end, userIds: employeeIds,
      ...(current ? { excludeShiftId: current.entity.id } : {})
    });
    if (conflicts.length) return response(409, "SHIFT_CONFLICT", "Смена пересекается с другой", { userIds: [...conflicts] });

    const at = context.clock.now();
    let usableDay = day;
    if (!usableDay) {
      const createdDay: ScheduleDay = {
        id: this.createId("day"), date: input.date, locationId: input.locationId,
        status: "working", comment: "", version: 0
      };
      usableDay = writeMutated(repositories.schedule.saveDay(createdDay, { at, expectedRevision: null }), "schedule day", true);
    }
    const next: Shift = {
      id: current?.entity.id ?? this.createId("shift"),
      date: input.date,
      start: input.start,
      end: input.end,
      locationId: input.locationId,
      employeeIds,
      status: input.status,
      comment: input.comment?.trim() ?? ""
    };
    const saved = writeMutated(repositories.schedule.saveShift(next, expected === null
      ? { at, expectedRevision: null, assignedByUserId: actorId }
      : { at, expectedRevision: expected!, assignedByUserId: actorId }), "shift", expected === null);
    this.audit(context, actorId, "shift", next.id, current ? "update" : "create", {
      date: next.date, start: next.start, end: next.end, locationId: next.locationId,
      employeeIds: [...next.employeeIds], status: next.status, comment: next.comment,
      version: Number(saved.revision), scheduleDayId: usableDay.entity.id, correlationId: context.correlationId
    }, at);
    return { status: current ? 200 : 201, body: { ...next, employeeIds: [...next.employeeIds], version: Number(saved.revision) } };
  }

  private applyCreateSwap(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    input: CreateSwapCommand
  ): IdempotentHttpResponse<JsonObject> {
    if (!input.shiftId.trim() || !input.toUserId.trim()) return response(400, "BAD_SWAP_INPUT", "Смена и получатель обязательны");
    if (actorId === input.toUserId) return response(400, "SAME_SWAP_USER", "Нельзя передать смену себе");
    const repositories = context.transaction.repositories;
    const validation = this.validateSwapAssignment(repositories, input.shiftId, actorId, input.toUserId);
    if (validation.error) return validation.error;
    const pending = repositories.schedule.listPendingSiblingSwaps({ fromShiftId: input.shiftId, fromUserId: actorId, excludeSwapId: "" });
    const at = context.clock.now();
    const stale = pending.filter((record) => record.entity.sourceShiftRevision !== validation.shift.revision);
    if (stale.length) this.expireStaleSwaps(context, actorId, stale, validation.shift.revision, at);
    const duplicate = pending
      .filter((record) => record.entity.sourceShiftRevision === validation.shift.revision)
      .find((record) => record.entity.toUserId === input.toUserId);
    if (duplicate) return response(409, "SWAP_ALREADY_PENDING", "Запрос уже ожидает ответа", { swapId: duplicate.entity.id });

    const swap: RepositoryShiftSwap = {
      id: this.createId("swap"), fromShiftId: input.shiftId, fromUserId: actorId,
      toUserId: input.toUserId, sourceShiftRevision: validation.shift.revision,
      status: "pending", createdAt: at
    };
    writeMutated(repositories.schedule.saveSwap(swap, { at, expectedRevision: null }), "swap", true);
    this.audit(context, actorId, "shift_swap", swap.id, "create", {
      shiftId: input.shiftId, fromUserId: actorId, toUserId: input.toUserId,
      status: "pending", correlationId: context.correlationId
    }, at);
    this.deliver(context, input.toUserId, "swap.requested", swap.id, {
      swapId: swap.id, shiftId: input.shiftId, fromUserId: actorId, toUserId: input.toUserId,
      status: "pending", correlationId: context.correlationId
    }, at);
    return { status: 201, body: { ...swap } };
  }

  private applyResolveSwap(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    input: ResolveSwapCommand
  ): IdempotentHttpResponse<JsonObject> {
    if (!input.swapId.trim() || !["accept", "decline", "cancel"].includes(input.action)) {
      return response(400, "BAD_SWAP_RESOLUTION", "Некорректное действие");
    }
    const repositories = context.transaction.repositories;
    const current = repositories.schedule.findSwap(input.swapId);
    if (!current) return response(404, "SWAP_NOT_FOUND", "Запрос обмена не найден");
    if (current.entity.status !== "pending") {
      return response(409, "STALE_SWAP", "Запрос уже обработан", { currentStatus: current.entity.status, swapId: current.entity.id });
    }
    const isSource = actorId === current.entity.fromUserId;
    const isTarget = actorId === current.entity.toUserId;
    if ((input.action === "cancel" && !isSource) || (input.action !== "cancel" && !isTarget)) {
      return response(403, "SWAP_ACTOR_MISMATCH", "Этот запрос предназначен другому пользователю");
    }
    const at = context.clock.now();
    if (input.action === "accept") return this.acceptSwap(context, actorId, current, at);

    const nextStatus: ShiftSwapRequest["status"] = input.action === "decline" ? "declined" : "cancelled";
    const next: RepositoryShiftSwap = { ...current.entity, status: nextStatus, resolvedAt: at, resolvedByUserId: actorId };
    writeMutated(repositories.schedule.saveSwap(next, { at, expectedRevision: current.revision }), "swap", false);
    this.audit(context, actorId, "shift_swap", next.id, input.action, {
      swapId: next.id, shiftId: next.fromShiftId, status: nextStatus, correlationId: context.correlationId
    }, at);
    const recipientId = input.action === "decline" ? next.fromUserId : next.toUserId;
    this.deliver(context, recipientId, `swap.${nextStatus}`, next.id, {
      swapId: next.id, shiftId: next.fromShiftId, status: nextStatus, correlationId: context.correlationId
    }, at);
    return { status: 200, body: { swapId: next.id, status: nextStatus, resolvedAt: at } };
  }

  private acceptSwap(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    current: RepositoryRecord<RepositoryShiftSwap>,
    at: UtcTimestamp
  ): IdempotentHttpResponse<JsonObject> {
    const repositories = context.transaction.repositories;
    const latestShift = repositories.schedule.findShift(current.entity.fromShiftId);
    if (!latestShift) return response(404, "SHIFT_NOT_FOUND", "Смена не найдена");
    if (latestShift.revision !== current.entity.sourceShiftRevision) {
      const stale = [current, ...repositories.schedule.listPendingSiblingSwaps({
        fromShiftId: current.entity.fromShiftId,
        fromUserId: current.entity.fromUserId,
        excludeSwapId: current.entity.id
      })].filter((record) => record.entity.sourceShiftRevision !== latestShift.revision);
      this.expireStaleSwaps(context, actorId, stale, latestShift.revision, at);
      return response(409, "STALE_SWAP", "Смена изменилась после создания запроса", {
        swapId: current.entity.id,
        expectedShiftVersion: Number(current.entity.sourceShiftRevision),
        currentShiftVersion: Number(latestShift.revision),
        currentStatus: "expired"
      });
    }
    const validation = this.validateSwapAssignment(
      repositories, current.entity.fromShiftId, current.entity.fromUserId, current.entity.toUserId
    );
    if (validation.error) return validation.error;
    const shiftRecord = validation.shift;
    const nextShift: Shift = {
      ...shiftRecord.entity,
      employeeIds: shiftRecord.entity.employeeIds.map((userId) => userId === current.entity.fromUserId ? current.entity.toUserId : userId)
    };
    const savedShift = writeMutated(repositories.schedule.saveShift(nextShift, {
      at, expectedRevision: shiftRecord.revision, assignedByUserId: actorId
    }), "shift assignment", false);
    const accepted: RepositoryShiftSwap = {
      ...current.entity, status: "accepted", resolvedAt: at, resolvedByUserId: actorId
    };
    writeMutated(repositories.schedule.saveSwap(accepted, { at, expectedRevision: current.revision }), "swap", false);

    const siblings = repositories.schedule.listPendingSiblingSwaps({
      fromShiftId: current.entity.fromShiftId,
      fromUserId: current.entity.fromUserId,
      excludeSwapId: current.entity.id
    });
    for (const sibling of siblings) {
      const cancelled: RepositoryShiftSwap = {
        ...sibling.entity, status: "cancelled", resolvedAt: at, resolvedByUserId: actorId
      };
      writeMutated(repositories.schedule.saveSwap(cancelled, { at, expectedRevision: sibling.revision }), "sibling swap", false);
      this.deliver(context, sibling.entity.toUserId, "swap.cancelled", sibling.entity.id, {
        swapId: sibling.entity.id, acceptedSwapId: current.entity.id, shiftId: current.entity.fromShiftId,
        status: "cancelled", correlationId: context.correlationId
      }, at);
    }

    this.audit(context, actorId, "shift", shiftRecord.entity.id, "swap_assignment", {
      shiftId: shiftRecord.entity.id,
      fromUserId: current.entity.fromUserId,
      toUserId: current.entity.toUserId,
      version: Number(savedShift.revision), correlationId: context.correlationId
    }, at);
    this.audit(context, actorId, "shift_swap", accepted.id, "accept", {
      swapId: accepted.id, shiftId: accepted.fromShiftId, status: "accepted",
      cancelledSiblingIds: siblings.map((item) => item.entity.id), correlationId: context.correlationId
    }, at);
    this.deliver(context, accepted.fromUserId, "swap.accepted", accepted.id, {
      swapId: accepted.id, shiftId: accepted.fromShiftId, fromUserId: accepted.fromUserId,
      toUserId: accepted.toUserId, status: "accepted", correlationId: context.correlationId
    }, at);
    return {
      status: 200,
      body: {
        swapId: accepted.id, status: "accepted", shiftId: accepted.fromShiftId,
        employeeIds: [...nextShift.employeeIds], shiftVersion: Number(savedShift.revision),
        cancelledSiblingIds: siblings.map((item) => item.entity.id), resolvedAt: at
      }
    };
  }

  private validateSwapAssignment(
    repositories: ScheduleCommandRepositories,
    shiftId: string,
    fromUserId: string,
    toUserId: string
  ): Readonly<{ shift: RepositoryRecord<Shift>; error?: undefined }> | Readonly<{ shift?: undefined; error: IdempotentHttpResponse<JsonObject> }> {
    const shift = repositories.schedule.findShift(shiftId);
    if (!shift) return { error: response(404, "SHIFT_NOT_FOUND", "Смена не найдена") };
    if (shift.entity.status !== "scheduled") return { error: response(409, "SHIFT_NOT_SCHEDULED", "Обмен доступен только для запланированной смены") };
    const day = repositories.schedule.findDay(shift.entity.date, shift.entity.locationId);
    if (!day || day.entity.status !== "working") return { error: response(409, "DAY_CLOSED", "День закрыт") };
    const location = repositories.locations.findById(shift.entity.locationId);
    if (!location || location.entity.status !== "active") return { error: response(409, "LOCATION_INACTIVE", "Локация недоступна") };
    if (repositories.participants.findStatus(fromUserId) !== "active") {
      return { error: response(409, "SOURCE_USER_INACTIVE", "Инициатор недоступен") };
    }
    if (repositories.participants.findStatus(toUserId) !== "active") {
      return { error: response(409, "TARGET_USER_INACTIVE", "Получатель недоступен") };
    }
    if (shift.entity.employeeIds.filter((userId) => userId === fromUserId).length !== 1) {
      return { error: response(409, "SOURCE_ASSIGNMENT_STALE", "Инициатор больше не назначен на смену") };
    }
    if (shift.entity.employeeIds.includes(toUserId)) {
      return { error: response(409, "TARGET_ALREADY_ASSIGNED", "Получатель уже назначен на смену") };
    }
    const conflicts = repositories.schedule.findAssignmentConflicts({
      date: shift.entity.date, start: shift.entity.start, end: shift.entity.end,
      userIds: [toUserId], excludeShiftId: shift.entity.id
    });
    if (conflicts.includes(toUserId)) return { error: response(409, "TARGET_SHIFT_CONFLICT", "У получателя пересекается смена") };
    return { shift };
  }

  private expireStaleSwaps(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    records: readonly RepositoryRecord<RepositoryShiftSwap>[],
    currentShiftRevision: string,
    at: UtcTimestamp
  ) {
    const repositories = context.transaction.repositories;
    for (const record of records) {
      const expired: RepositoryShiftSwap = {
        ...record.entity,
        status: "expired",
        resolvedAt: at,
        resolvedByUserId: actorId
      };
      writeMutated(repositories.schedule.saveSwap(expired, { at, expectedRevision: record.revision }), "stale swap", false);
      this.audit(context, actorId, "shift_swap", expired.id, "expire", {
        swapId: expired.id,
        shiftId: expired.fromShiftId,
        expectedShiftVersion: Number(expired.sourceShiftRevision),
        currentShiftVersion: Number(currentShiftRevision),
        status: "expired",
        correlationId: context.correlationId
      }, at);
      this.deliver(context, expired.toUserId, "swap.expired", expired.id, {
        swapId: expired.id,
        shiftId: expired.fromShiftId,
        status: "expired",
        correlationId: context.correlationId
      }, at);
    }
  }

  private audit(
    context: CommandContext<ScheduleCommandRepositories>,
    actorId: string,
    entity: string,
    entityId: string,
    action: string,
    changes: JsonObject,
    at: UtcTimestamp
  ) {
    writeCreated(context.transaction.repositories.audit.append({
      id: this.createId("audit"), actorId, entity, entityId, action,
      changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null }), "audit");
  }

  private deliver(
    context: CommandContext<ScheduleCommandRepositories>,
    userId: string,
    type: string,
    eventId: string,
    payload: JsonObject,
    at: UtcTimestamp
  ) {
    const repositories = context.transaction.repositories;
    writeCreated(repositories.notifications.append({
      id: this.createId("notification"), channel: "webapp", userId, type,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } },
      read: false, createdAt: at
    }, { at, expectedRevision: null }), "notification");
    writeCreated(repositories.outbox.enqueue({
      id: this.createId("outbox"), channel: "telegram", userId, type,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...payload } },
      status: "pending", attemptCount: 0, maxAttempts: this.options.outboxMaxAttempts,
      availableAt: at, createdAt: at, idempotencyKey: `schedule:${eventId}:${type}:${userId}`
    }, { at, expectedRevision: null }), "outbox");
  }
}
