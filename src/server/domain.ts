import { nanoid } from "nanoid";
import crypto from "node:crypto";
import zlib from "node:zlib";
import type { AppState, InventorySnapshotRow, OutboxMessage, ProductMerge, ScheduleDay, SellerShiftSwapRequest, Shift, ShiftSwapRequest, StockOperation, StockOperationType, SupplyImport, User } from "../shared/types";
import { hasPermission } from "./permissions";
import { appendAudit, audit, db, findBalance, findBalanceIn, stateTransaction } from "./store";
import { addQuantity, normalizeQuantity, QuantityError, requireQuantity, subtractQuantity, type QuantityUnit } from "../shared/quantity";
import { DomainError, requirePermission } from "./domain-core";

export { DomainError, requirePermission } from "./domain-core";

const now = () => new Date().toISOString();

/** Active employees share one non-financial calendar. */
export function listVisibleScheduleShifts(user: User) {
  if (user.status !== "active") return [];
  return db.shifts;
}

export function listVisibleScheduleSwaps(user: User): Array<ShiftSwapRequest | SellerShiftSwapRequest> {
  if (hasPermission(user, "schedule:manage")) return db.swaps;
  return db.swaps
    .filter((swap) => swap.fromUserId === user.id || swap.toUserId === user.id)
    .map(({ fromShiftId: _fromShiftId, ...swap }) => swap);
}

function domainQuantity(quantity: number, unit?: QuantityUnit, allowZero = false) {
  try {
    return requireQuantity(quantity, { unit, allowZero });
  } catch (error) {
    if (!(error instanceof QuantityError)) throw error;
    throw new DomainError("BAD_QUANTITY", "Количество должно быть больше нуля");
  }
}

function requireIdempotencyKey(idempotencyKey: string) {
  if (!idempotencyKey.trim()) throw new DomainError("IDEMPOTENCY_REQUIRED", "Нужен idempotency key");
}

function requireProduct(productId: string, state: AppState = db) {
  const product = state.products.find((item) => item.id === productId && item.status !== "deleted");
  if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "Товар не найден", 404, { productId });
  return product;
}

function requireLocation(locationId: string | undefined, role: "source" | "target", state: AppState = db) {
  if (!locationId) return undefined;
  const location = state.locations.find((item) => item.id === locationId && item.status === "active");
  if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Локация не найдена", 404, { locationId, role });
  return location;
}

function minutesFromTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new DomainError("BAD_SHIFT_TIME", "Время смены должно быть в формате HH:MM");
  return Number(match[1]) * 60 + Number(match[2]);
}

function requireDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new DomainError("BAD_SHIFT_DATE", "Дата смены должна быть в формате YYYY-MM-DD");
  }
  return value;
}

const shiftStatuses: Shift["status"][] = ["draft", "scheduled", "in_progress", "completed", "cancelled"];
const DAY_SHIFT_START = "10:00";
const DAY_SHIFT_END = "21:00";

function requireShiftStatus(value: unknown): Shift["status"] {
  const status = String(value || "scheduled") as Shift["status"];
  if (!shiftStatuses.includes(status)) throw new DomainError("BAD_SHIFT_STATUS", "Недопустимый статус смены");
  return status;
}

function vladivostokNow(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Vladivostok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function nextAutomaticShiftStatus(shift: Shift, current: ReturnType<typeof vladivostokNow>): Shift["status"] {
  if (shift.status === "draft" || shift.status === "completed" || shift.status === "cancelled") return shift.status;
  if (shift.date < current.date) return "completed";
  if (shift.date > current.date) return shift.status;
  const end = minutesFromTime(shift.end);
  if (current.minutes >= end) return "completed";
  const start = minutesFromTime(shift.start);
  if (current.minutes >= start && shift.status === "scheduled") return "in_progress";
  return shift.status;
}

export function refreshScheduleState(date = new Date(), actorId = "system") {
  const current = vladivostokNow(date);
  const changed: Array<{ entity: "shift" | "shift_swap"; id: string; from: string; to: string }> = [];
  for (const shift of db.shifts) {
    const nextStatus = nextAutomaticShiftStatus(shift, current);
    if (nextStatus !== shift.status) {
      const previousStatus = shift.status;
      shift.status = nextStatus;
      changed.push({ entity: "shift", id: shift.id, from: previousStatus, to: nextStatus });
    }
  }
  for (const swap of db.swaps) {
    const shift = db.shifts.find((item) => item.id === swap.fromShiftId);
    if (swap.status === "pending" && (!shift || shift.status !== "scheduled")) {
      swap.status = "expired";
      changed.push({ entity: "shift_swap", id: swap.id, from: "pending", to: "expired" });
    }
  }
  for (const item of changed) {
    audit(actorId, item.entity, item.id, "auto_status", { from: item.from, to: item.to });
  }
  return changed;
}

function requireShiftEmployee(employeeIds: unknown, state: AppState = db) {
  const ids = Array.isArray(employeeIds) ? [...new Set(employeeIds.map(String).filter(Boolean))] : [];
  if (!ids.length) throw new DomainError("BAD_SHIFT_EMPLOYEES", "Нужно назначить хотя бы одного сотрудника");
  const missing = ids.filter((id) => !state.users.some((user) => user.id === id && user.status === "active"));
  if (missing.length) throw new DomainError("BAD_SHIFT_EMPLOYEES", "Сотрудник не найден или не активен", 400, missing);
  return ids;
}

function assertNoShiftOverlap(input: { date: string; start: string; end: string; employeeIds: string[]; excludeShiftId?: string }, state: AppState = db) {
  const start = minutesFromTime(input.start);
  const end = minutesFromTime(input.end);
  if (end <= start) throw new DomainError("BAD_SHIFT_TIME", "Окончание смены должно быть позже начала");
  const conflicts = state.shifts.filter((shift) => {
    if (shift.id === input.excludeShiftId || shift.date !== input.date || shift.status === "cancelled") return false;
    if (!shift.employeeIds.some((id) => input.employeeIds.includes(id))) return false;
    return start < minutesFromTime(shift.end) && end > minutesFromTime(shift.start);
  });
  if (conflicts.length) {
    throw new DomainError("SHIFT_OVERLAP", "У сотрудника уже есть смена в этот день", 409, conflicts.map((shift) => shift.id));
  }
}

function getScheduleDay(state: AppState, date: string, locationId: string) {
  return state.scheduleDays.find((day) => day.date === date && day.locationId === locationId);
}

function requireWorkingScheduleDay(state: AppState, date: string, locationId: string) {
  const day = getScheduleDay(state, date, locationId);
  if (day?.status === "closed") throw new DomainError("SCHEDULE_DAY_CLOSED", "Локация закрыта в эту дату", 409, { date, locationId });
  return day;
}

export function setScheduleDay(user: User, input: { date: string; locationId: string; status: ScheduleDay["status"]; comment?: string }) {
  requirePermission(user, "schedule:manage");
  return stateTransaction((state) => {
    const date = requireDate(input.date);
    requireLocation(input.locationId, "target", state);
    if (input.status !== "working" && input.status !== "closed") throw new DomainError("BAD_SCHEDULE_DAY_STATUS", "Недопустимый статус дня");
    const affected = state.shifts.filter((shift) => shift.date === date && shift.locationId === input.locationId && (shift.status === "draft" || shift.status === "scheduled"));
    if (input.status === "closed" && affected.length) throw new DomainError("SCHEDULE_DAY_HAS_SHIFTS", "Нельзя закрыть день с назначенными сменами", 409, affected.map((shift) => shift.id));
    const existing = getScheduleDay(state, date, input.locationId);
    const day: ScheduleDay = existing || { id: nanoid(), date, locationId: input.locationId, status: input.status, comment: "", version: 0 };
    day.status = input.status;
    day.comment = String(input.comment || "");
    day.version += existing ? 1 : 0;
    if (!existing) state.scheduleDays.unshift(day);
    appendAudit(state, user.id, "schedule_day", day.id, existing ? "update" : "create", { date, locationId: input.locationId, status: day.status });
    return day;
  });
}

export type RotationPreview = {
  shifts: Array<Pick<Shift, "date" | "locationId" | "employeeIds" | "status" | "comment">>;
  skippedClosedDays: string[];
  conflicts: Array<{ date: string; employeeId: string; shiftIds: string[] }>;
};

function rotationDates(startDate: string, endDate: string) {
  const start = requireDate(startDate);
  const end = requireDate(endDate);
  if (start > end) throw new DomainError("BAD_ROTATION_RANGE", "Дата начала должна быть раньше даты окончания");
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const limit = new Date(`${end}T00:00:00.000Z`).getTime();
  while (cursor.getTime() <= limit) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length > 370) throw new DomainError("BAD_ROTATION_RANGE", "Период генерации не может превышать 370 дней");
  return dates;
}

function previewRotationIn(state: AppState, input: { startDate: string; endDate: string; locationId: string; employeeIds: string[]; comment?: string }): RotationPreview {
  requireLocation(input.locationId, "target", state);
  const employees = requireShiftEmployee(input.employeeIds, state);
  const preview: RotationPreview = { shifts: [], skippedClosedDays: [], conflicts: [] };
  rotationDates(input.startDate, input.endDate).forEach((date, index) => {
    if (getScheduleDay(state, date, input.locationId)?.status === "closed") {
      preview.skippedClosedDays.push(date);
      return;
    }
    const employeeId = employees[index % employees.length];
    const conflicts = state.shifts.filter((shift) => shift.date === date && shift.status !== "cancelled" && shift.employeeIds.includes(employeeId)).map((shift) => shift.id);
    if (conflicts.length) {
      preview.conflicts.push({ date, employeeId, shiftIds: conflicts });
      return;
    }
    preview.shifts.push({ date, locationId: input.locationId, employeeIds: [employeeId], status: "scheduled", comment: String(input.comment || "") });
  });
  return preview;
}

export function previewRotation(user: User, input: { startDate: string; endDate: string; locationId: string; employeeIds: string[]; comment?: string }) {
  requirePermission(user, "schedule:manage");
  return previewRotationIn(db, input);
}

export function commitRotation(user: User, input: { startDate: string; endDate: string; locationId: string; employeeIds: string[]; comment?: string; idempotencyKey: string }) {
  requirePermission(user, "schedule:manage");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `rotation:${input.idempotencyKey}`;
    const cached = state.idempotency[cacheKey];
    if (cached) return cached as RotationPreview & { shiftIds: string[] };
    const preview = previewRotationIn(state, input);
    if (preview.conflicts.length) throw new DomainError("ROTATION_CONFLICT", "Генерация содержит конфликты", 409, preview);
    const shiftIds = preview.shifts.map((item) => {
      const shift: Shift = { id: nanoid(), start: DAY_SHIFT_START, end: DAY_SHIFT_END, ...item };
      state.shifts.unshift(shift);
      return shift.id;
    });
    const result = { ...preview, shiftIds };
    state.idempotency[cacheKey] = result;
    appendAudit(state, user.id, "schedule_rotation", input.idempotencyKey, "commit", { shifts: shiftIds, skippedClosedDays: preview.skippedClosedDays });
    return result;
  });
}

export type FutureReplacementPreview = {
  replacements: Array<{ shiftId: string; date: string; locationId: string }>;
  conflicts: Array<{ shiftId: string; date: string; conflictShiftIds: string[] }>;
};

function previewFutureReplacementIn(state: AppState, input: { fromUserId: string; toUserId: string; startDate: string; endDate: string }) {
  const dates = new Set(rotationDates(input.startDate, input.endDate));
  const target = state.users.find((user) => user.id === input.toUserId && user.status === "active");
  if (!target || input.fromUserId === input.toUserId) throw new DomainError("BAD_REPLACEMENT_TARGET", "Нужен другой активный сотрудник");
  const preview: FutureReplacementPreview = { replacements: [], conflicts: [] };
  for (const shift of state.shifts.filter((shift) => dates.has(shift.date) && (shift.status === "draft" || shift.status === "scheduled") && shift.employeeIds.includes(input.fromUserId))) {
    const conflictShiftIds = state.shifts.filter((candidate) => candidate.id !== shift.id && candidate.date === shift.date && candidate.status !== "cancelled" && candidate.employeeIds.includes(input.toUserId)).map((candidate) => candidate.id);
    if (conflictShiftIds.length) preview.conflicts.push({ shiftId: shift.id, date: shift.date, conflictShiftIds });
    else preview.replacements.push({ shiftId: shift.id, date: shift.date, locationId: shift.locationId });
  }
  return preview;
}

export function previewFutureReplacement(user: User, input: { fromUserId: string; toUserId: string; startDate: string; endDate: string }) {
  requirePermission(user, "schedule:manage");
  return previewFutureReplacementIn(db, input);
}

export function commitFutureReplacement(user: User, input: { fromUserId: string; toUserId: string; startDate: string; endDate: string; idempotencyKey: string }) {
  requirePermission(user, "schedule:manage");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `future-replacement:${input.idempotencyKey}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey] as FutureReplacementPreview;
    const preview = previewFutureReplacementIn(state, input);
    if (preview.conflicts.length) throw new DomainError("FUTURE_REPLACEMENT_CONFLICT", "Замена содержит конфликты", 409, preview);
    for (const replacement of preview.replacements) {
      const shift = state.shifts.find((item) => item.id === replacement.shiftId)!;
      shift.employeeIds = shift.employeeIds.map((id) => id === input.fromUserId ? input.toUserId : id);
    }
    state.idempotency[cacheKey] = preview;
    appendAudit(state, user.id, "schedule_future_replacement", input.idempotencyKey, "commit", { fromUserId: input.fromUserId, toUserId: input.toUserId, shifts: preview.replacements.map((item) => item.shiftId) });
    return preview;
  });
}

export function previewArchiveCandidates(user: User, inactiveDays: number, nowDate = new Date()) {
  requirePermission(user, "products:write");
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1) throw new DomainError("BAD_ARCHIVE_DAYS", "Количество дней должно быть положительным целым");
  const cutoff = nowDate.getTime() - inactiveDays * 86_400_000;
  return db.products.filter((product) => product.status === "active").filter((product) => {
    if (db.balances.some((balance) => balance.productId === product.id && balance.quantity !== 0)) return false;
    const lastReceipt = db.operations.filter((operation) => operation.productId === product.id && operation.type === "receipt").map((operation) => new Date(operation.createdAt).getTime()).sort((a, b) => b - a)[0];
    return !lastReceipt || lastReceipt < cutoff;
  }).map((product) => ({ id: product.id, name: product.localName || product.officialName }));
}

export function commitArchiveCandidates(user: User, input: { inactiveDays: number; productIds: string[]; idempotencyKey: string }) {
  requirePermission(user, "products:write");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `archive:${input.idempotencyKey}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey] as string[];
    const candidates = new Set(previewArchiveCandidates(user, input.inactiveDays).map((item) => item.id));
    const ids = [...new Set(input.productIds)].filter((id) => candidates.has(id));
    if (ids.length !== input.productIds.length) throw new DomainError("ARCHIVE_CANDIDATE_CHANGED", "Список кандидатов изменился", 409);
    for (const product of state.products.filter((product) => ids.includes(product.id))) product.status = "archived";
    state.idempotency[cacheKey] = ids;
    appendAudit(state, user.id, "product_archive", input.idempotencyKey, "commit", { productIds: ids, inactiveDays: input.inactiveDays });
    return ids;
  });
}

export function applyStockOperation(input: {
  user: User;
  type: StockOperationType;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}) {
  requirePermission(input.user, "stock:move");
  requireIdempotencyKey(input.idempotencyKey);
  return stateTransaction((state) => {
    const cacheKey = `stock:${input.idempotencyKey}`;
    const cached = state.idempotency[cacheKey];
    if (cached) return cached as StockOperation;
    const product = requireProduct(input.productId, state);
    const quantity = domainQuantity(input.quantity, product.unit, false);
    requireLocation(input.fromLocationId, "source", state);
    requireLocation(input.toLocationId, "target", state);
    const from = input.fromLocationId ? findBalanceIn(state, input.productId, input.fromLocationId) : undefined;
    const to = input.toLocationId ? findBalanceIn(state, input.productId, input.toLocationId) : undefined;
    if (input.type === "transfer") {
      if (!from || !to) throw new DomainError("BAD_TRANSFER", "Нужны источник и назначение");
      if (input.fromLocationId === input.toLocationId) throw new DomainError("BAD_TRANSFER", "Источник и назначение должны отличаться");
      if (from.quantity < quantity) throw new DomainError("NEGATIVE_STOCK_BLOCKED", "Остаток не может стать отрицательным");
      from.quantity = subtractQuantity(from.quantity, quantity, product.unit);
      from.version += 1;
      to.quantity = addQuantity(to.quantity, quantity, product.unit);
      to.version += 1;
    } else if (input.type === "write_off") {
      if (!from) throw new DomainError("BAD_WRITE_OFF", "Нужен источник списания");
      if (from.quantity < quantity) throw new DomainError("NEGATIVE_STOCK_BLOCKED", "Остаток не может стать отрицательным");
      from.quantity = subtractQuantity(from.quantity, quantity, product.unit);
      from.version += 1;
    } else if (input.type === "receipt" || input.type === "correction") {
      if (!to) throw new DomainError("BAD_RECEIPT", "Нужно назначение прихода");
      to.quantity = addQuantity(to.quantity, quantity, product.unit);
      to.version += 1;
    } else {
      throw new DomainError("UNSUPPORTED_OPERATION", "Операция не поддержана этим endpoint");
    }
    const operation: StockOperation = { id: nanoid(), type: input.type, productId: input.productId, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, quantity, actorId: input.user.id, reason: input.reason || "Без комментария", idempotencyKey: input.idempotencyKey, createdAt: now() };
    state.operations.unshift(operation);
    state.idempotency[cacheKey] = operation;
    appendAudit(state, input.user.id, "stock_operation", operation.id, "create", operation);
    return operation;
  });
}

export type BufferedStockOperationInput = {
  id: string;
  type: "transfer" | "write_off" | "inventory";
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity?: number;
  actual?: number;
  reason: string;
};

export type BufferedStockOperationResult = {
  id: string;
  status: "applied" | "failed";
  operationIds?: string[];
  error?: string;
};

/**
 * Applies tablet-buffer entries one by one. A failed entry stops the run so
 * the operator can correct it without accidentally applying later actions.
 */
export function applyBufferedStockOperations(user: User, entries: BufferedStockOperationInput[], idempotencyKey: string) {
  requireIdempotencyKey(idempotencyKey);
  if (!entries.length) throw new DomainError("EMPTY_BUFFER", "Буфер операций пуст", 400);
  const results: BufferedStockOperationResult[] = [];
  for (const [index, entry] of entries.entries()) {
    const key = `${idempotencyKey}:${entry.id || index}`;
    try {
      if (!entry.reason?.trim()) throw new DomainError("COMMENT_REQUIRED", "Укажите основание операции", 400);
      if (entry.type === "inventory") {
        if (!entry.toLocationId) throw new DomainError("BAD_INVENTORY_LOCATION", "Выберите локацию инвентаризации", 400);
        if (!Number.isFinite(entry.actual) || (entry.actual ?? 0) < 0) {
          throw new DomainError("BAD_INVENTORY_ACTUAL", "Фактический остаток должен быть нулём или больше", 400);
        }
        const snapshot = inventorySnapshot(entry.toLocationId);
        const row = snapshot.find((item) => item.productId === entry.productId);
        if (!row) throw new DomainError("NOT_FOUND", "Товар не найден в выбранной локации", 404);
        const operations = applyInventory(user, [{ ...row, actual: entry.actual }], entry.reason, key);
        results.push({ id: entry.id, status: "applied", operationIds: operations.map((operation) => operation.id) });
      } else {
        const operation = applyStockOperation({
          user,
          type: entry.type,
          productId: entry.productId,
          fromLocationId: entry.fromLocationId,
          toLocationId: entry.toLocationId,
          quantity: entry.quantity ?? 0,
          reason: entry.reason,
          idempotencyKey: key
        });
        results.push({ id: entry.id, status: "applied", operationIds: [operation.id] });
      }
    } catch (error) {
      results.push({ id: entry.id, status: "failed", error: error instanceof Error ? error.message : "Не удалось применить операцию" });
      break;
    }
  }
  audit(user.id, "stock_buffer", idempotencyKey, "apply", { total: entries.length, applied: results.filter((item) => item.status === "applied").length });
  return results;
}

export function reverseOperation(user: User, operationId: string, idempotencyKey: string) {
  requirePermission(user, "techlog:read");
  requireIdempotencyKey(idempotencyKey);
  const cacheKey = `reversal:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached as StockOperation;
  const original = db.operations.find((item) => item.id === operationId);
  if (!original) throw new DomainError("NOT_FOUND", "Операция не найдена", 404);
  if (original.type === "reversal") throw new DomainError("BAD_REVERSAL_TARGET", "Нельзя отменить операцию отмены");
  if (db.operations.some((item) => item.reversedOperationId === operationId)) {
    throw new DomainError("ALREADY_REVERSED", "Операция уже отменена");
  }

  const reverseType: StockOperationType = "reversal";
  const product = requireProduct(original.productId);
  const from = original.toLocationId ? findBalance(original.productId, original.toLocationId) : undefined;
  const to = original.fromLocationId ? findBalance(original.productId, original.fromLocationId) : undefined;
  if (from && from.quantity < original.quantity) {
    throw new DomainError("NEGATIVE_STOCK_BLOCKED", "Отмена приведёт к отрицательному остатку");
  }
  if (from) {
    from.quantity = subtractQuantity(from.quantity, original.quantity, product.unit);
    from.version += 1;
  }
  if (to) {
    to.quantity = addQuantity(to.quantity, original.quantity, product.unit);
    to.version += 1;
  }
  const reversal: StockOperation = {
    id: nanoid(),
    type: reverseType,
    productId: original.productId,
    fromLocationId: original.toLocationId,
    toLocationId: original.fromLocationId,
    quantity: original.quantity,
    actorId: user.id,
    reason: `Отмена ${original.id}`,
    idempotencyKey,
    reversedOperationId: original.id,
    createdAt: now()
  };
  db.operations.unshift(reversal);
  db.idempotency[cacheKey] = reversal;
  audit(user.id, "stock_operation", reversal.id, "reverse", { originalId: original.id });
  return reversal;
}

export function inventorySnapshot(locationId: string): InventorySnapshotRow[] {
  requireLocation(locationId, "target");
  return db.balances
    .filter((balance) => balance.locationId === locationId)
    .map((balance) => ({
      productId: balance.productId,
      locationId,
      expected: balance.quantity,
      version: balance.version
    }));
}

export function applyInventory(user: User, rows: InventorySnapshotRow[], comment: string, idempotencyKey: string) {
  requirePermission(user, "inventory:write");
  requireIdempotencyKey(idempotencyKey);
  if (!comment.trim()) throw new DomainError("COMMENT_REQUIRED", "Для инвентаризации обязателен комментарий");
  const cacheKey = `inventory:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached as StockOperation[];
  const normalizedRows = rows.map((row) => {
    const product = requireProduct(row.productId);
    requireLocation(row.locationId, "target");
    if (row.actual === undefined) return { row, invalid: true as const };
    try {
      return { row: { ...row, actual: requireQuantity(row.actual, { unit: product.unit }) }, invalid: false as const };
    } catch {
      return { row, invalid: true as const };
    }
  });
  const invalidRows = normalizedRows.filter((item) => item.invalid).map((item) => item.row);
  if (invalidRows.length) {
    throw new DomainError("BAD_INVENTORY_ACTUAL", "Фактический остаток должен быть нулём или больше", 400, invalidRows);
  }
  const validRows = normalizedRows.filter((item) => !item.invalid).map((item) => item.row);
  const conflicts = validRows.filter((row) => findBalance(row.productId, row.locationId).version !== row.version);
  if (conflicts.length) {
    throw new DomainError("INVENTORY_CONFLICT", "Остатки изменились после snapshot", 409, conflicts);
  }
  const operations: StockOperation[] = [];
  for (const row of validRows) {
    const balance = findBalance(row.productId, row.locationId);
    const product = requireProduct(row.productId);
    const actual = row.actual ?? 0;
    const delta = subtractQuantity(actual, balance.quantity, product.unit);
    if (delta === 0) continue;
    balance.quantity = normalizeQuantity(actual, product.unit);
    balance.version += 1;
    const operation: StockOperation = {
      id: nanoid(),
      type: "inventory_adjustment",
      productId: row.productId,
      toLocationId: row.locationId,
      quantity: Math.abs(delta),
      actorId: user.id,
      reason: comment,
      idempotencyKey: `${idempotencyKey}:${row.productId}:${row.locationId}`,
      metadata: { expected: balance.quantity - delta, actual, delta },
      createdAt: now()
    };
    db.operations.unshift(operation);
    operations.push(operation);
  }
  db.idempotency[cacheKey] = operations;
  audit(user.id, "inventory", idempotencyKey, "apply", { rows: operations.length, comment });
  return operations;
}

export type InventoryDiscrepancyRow = {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  locationId: string;
  locationName: string;
  actorId: string;
  actorName: string;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  quantity: number;
  reason: string;
};

/** Lists inventory-count variances, including the expected and counted values. */
export function listInventoryDiscrepancies(user: User, input: {
  from?: string;
  to?: string;
  productId?: string;
  locationId?: string;
} = {}): InventoryDiscrepancyRow[] {
  requirePermission(user, "reports:read");
  const from = input.from || "0000-01-01";
  const to = input.to || "9999-12-31";
  return db.operations
    .filter((operation) => operation.type === "inventory_adjustment")
    .filter((operation) => operation.createdAt.slice(0, 10) >= from && operation.createdAt.slice(0, 10) <= to)
    .filter((operation) => !input.productId || operation.productId === input.productId)
    .filter((operation) => !input.locationId || operation.toLocationId === input.locationId)
    .map((operation) => {
      const metadata = operation.metadata || {};
      const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
      const product = db.products.find((item) => item.id === operation.productId);
      const location = db.locations.find((item) => item.id === operation.toLocationId);
      const actor = db.users.find((item) => item.id === operation.actorId);
      return {
        id: operation.id,
        createdAt: operation.createdAt,
        productId: operation.productId,
        productName: product?.localName || product?.officialName || operation.productId,
        locationId: operation.toLocationId || "",
        locationName: location?.name || operation.toLocationId || "",
        actorId: operation.actorId,
        actorName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || actor?.username || operation.actorId,
        expected: numberOrNull(metadata.expected),
        actual: numberOrNull(metadata.actual),
        delta: numberOrNull(metadata.delta),
        quantity: operation.quantity,
        reason: operation.reason
      };
    });
}

export function createShift(user: User, input: {
  date: string;
  start: string;
  end: string;
  locationId: string;
  employeeIds: string[];
  status?: Shift["status"];
  comment?: string;
}) {
  requirePermission(user, "schedule:manage");
  return stateTransaction((state) => {
    const shift: Shift = {
      id: nanoid(), date: requireDate(String(input.date || "")), start: DAY_SHIFT_START, end: DAY_SHIFT_END,
      locationId: String(input.locationId || ""), employeeIds: requireShiftEmployee(input.employeeIds, state),
      status: requireShiftStatus(input.status), comment: String(input.comment || "")
    };
    requireLocation(shift.locationId, "target", state);
    requireWorkingScheduleDay(state, shift.date, shift.locationId);
    assertNoShiftOverlap(shift, state);
    state.shifts.unshift(shift);
    appendAudit(state, user.id, "shift", shift.id, "create", shift);
    return shift;
  });
}

export function updateShift(user: User, shiftId: string, input: Partial<Shift>) {
  requirePermission(user, "schedule:manage");
  const shift = db.shifts.find((item) => item.id === shiftId);
  if (!shift) throw new DomainError("NOT_FOUND", "Смена не найдена", 404);
  const next: Shift = {
    ...shift,
    date: input.date !== undefined ? requireDate(String(input.date)) : shift.date,
    start: DAY_SHIFT_START,
    end: DAY_SHIFT_END,
    locationId: input.locationId !== undefined ? String(input.locationId) : shift.locationId,
    employeeIds: input.employeeIds !== undefined ? requireShiftEmployee(input.employeeIds) : requireShiftEmployee(shift.employeeIds),
    status: input.status !== undefined ? requireShiftStatus(input.status) : shift.status,
    comment: input.comment !== undefined ? String(input.comment) : shift.comment
  };
  requireLocation(next.locationId, "target");
  requireWorkingScheduleDay(db, next.date, next.locationId);
  assertNoShiftOverlap({ ...next, excludeShiftId: shift.id });
  Object.assign(shift, next);
  audit(user.id, "shift", shift.id, "update", input);
  return shift;
}

export function copyShift(user: User, shiftId: string, date: string) {
  requirePermission(user, "schedule:manage");
  const source = db.shifts.find((item) => item.id === shiftId);
  if (!source) throw new DomainError("NOT_FOUND", "Смена не найдена", 404);
  return createShift(user, {
    date,
    start: source.start,
    end: source.end,
    locationId: source.locationId,
    employeeIds: source.employeeIds,
    status: source.status === "cancelled" ? "draft" : source.status,
    comment: source.comment
  });
}

export function createSwapRequest(user: User, fromShiftId: string, toUserId: string) {
  return stateTransaction((state) => {
    const shift = state.shifts.find((item) => item.id === fromShiftId);
    if (!shift || !shift.employeeIds.includes(user.id)) throw new DomainError("FORBIDDEN", "Можно обменивать только свою смену", 403);
    if (shift.status !== "scheduled") throw new DomainError("BAD_SWAP_SHIFT", "Обмен доступен только для запланированной смены");
    if (toUserId === user.id) throw new DomainError("BAD_SWAP_TARGET", "Нельзя предложить обмен самому себе");
    const target = state.users.find((item) => item.id === toUserId && item.status === "active");
    if (!target) throw new DomainError("BAD_SWAP_TARGET", "Получатель обмена не найден или не активен", 400, { toUserId });
    const swap = { id: nanoid(), fromShiftId: shift.id, fromUserId: user.id, toUserId, status: "pending" as const, createdAt: now() };
    state.swaps.unshift(swap);
    const idempotencyKey = `tg-swap-request:${swap.id}`;
    const message: OutboxMessage = {
      id: nanoid(), channel: "telegram", userId: target.id, type: "telegram_swap_request", status: "pending", attemptCount: 0,
      availableAt: now(), createdAt: now(), idempotencyKey,
      payload: {
        text: `${user.firstName || "Сотрудник"} предлагает подмену на ${shift.date}, ${shift.start}–${shift.end}.`,
        reply_markup: { inline_keyboard: [[
          { text: "Принять", callback_data: `swap:accept:${swap.id}` },
          { text: "Отклонить", callback_data: `swap:decline:${swap.id}` }
        ]] }
      }
    };
    if (!state.outbox.some((item) => item.channel === "telegram" && item.idempotencyKey === idempotencyKey)) state.outbox.unshift(message);
    appendAudit(state, user.id, "shift_swap", swap.id, "create", swap);
    return swap;
  });
}

export function cancelSwap(user: User, swapId: string) {
  const swap = db.swaps.find((item) => item.id === swapId);
  if (!swap) throw new DomainError("NOT_FOUND", "Заявка не найдена", 404);
  if (swap.fromUserId !== user.id) throw new DomainError("FORBIDDEN", "Отменить заявку может только инициатор", 403);
  if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "Заявка уже обработана");
  swap.status = "cancelled";
  audit(user.id, "shift_swap", swap.id, "cancel", { fromShiftId: swap.fromShiftId });
  return swap;
}

export function declineSwap(user: User, swapId: string) {
  const swap = db.swaps.find((item) => item.id === swapId);
  if (!swap) throw new DomainError("NOT_FOUND", "Заявка не найдена", 404);
  if (swap.toUserId !== user.id) throw new DomainError("FORBIDDEN", "Отклонить заявку может только выбранный сотрудник", 403);
  if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "Заявка уже обработана");
  swap.status = "declined";
  audit(user.id, "shift_swap", swap.id, "decline", { fromShiftId: swap.fromShiftId });
  return swap;
}

type ImportColumn = "name" | "quantity" | "sku" | "unit" | "category";
type ImportColumnMapping = Partial<Record<ImportColumn, string>>;

function validateImportRow(row: Record<string, string>) {
  const name = String(row.name || row.officialName || row["название"] || "").trim();
  if (!name) return { error: "Нет названия товара" } as const;
  const unit = String(row.unit || row["ед"] || "шт").trim() as "шт" | "кг" | "л" | "м";
  if (!["шт", "кг", "л", "м"].includes(unit)) return { error: "Недопустимая единица измерения" } as const;
  let quantity: number;
  try {
    quantity = requireQuantity(Number(row.quantity || row.qty || row["количество"] || 0), { unit });
  } catch {
    return { error: unit === "шт" ? "Количество в штуках должно быть целым" : "Количество должно быть нулём или больше с точностью до 0.001" } as const;
  }
  const warnings: string[] = [];
  if (!String(row.sku || "").trim()) warnings.push("Нет SKU: товар будет создан без артикульного поиска");
  if (quantity === 0) warnings.push("Нулевое количество: приход не будет создан");
  return { value: { name, quantity, unit, localName: String(row.localName || name), sku: String(row.sku || "").trim() || undefined, category: String(row.category || "Импорт") }, warnings } as const;
}

function supplierIdentifier(supplierName?: string) {
  if (!supplierName) return undefined;
  return `supplier:${crypto.createHash("sha256").update(supplierName.trim().toLocaleLowerCase("ru")).digest("hex").slice(0, 16)}`;
}

export function previewCsvImport(user: User, fileName: string, csv: string, metadata: { supplierName?: string; invoiceNumber?: string; columnMapping?: ImportColumnMapping } = {}) {
  requirePermission(user, "imports:write");
  const parsed = parseImportTable(fileName, csv);
  const rawRows = parsed.rows;
  // A manually selected mapping always wins over the detected supplier format.
  const mapping = { ...parsed.columnMapping, ...metadata.columnMapping };
  const rows = rawRows.map((row) => ({ ...row, ...Object.fromEntries(Object.entries(mapping).flatMap(([target, source]) => source && row[source] !== undefined ? [[target, row[source]]] : [])) }));
  if (!rows.length) throw new DomainError("EMPTY_IMPORT", "Файл не содержит строк");
  const warnings: Array<{ row: number; message: string }> = [];
  const rejectedRows: Array<{ row: number; message: string; values: Record<string, string> }> = [];
  rows.forEach((row, index) => {
    const validation = validateImportRow(row);
    if ("error" in validation) rejectedRows.push({ row: index + 1, message: validation.error || "Некорректная строка", values: row });
    else validation.warnings.forEach((message) => warnings.push({ row: index + 1, message }));
  });
  const hash = crypto.createHash("sha256").update(csv).digest("hex");
  const existing = db.imports.find((item) => item.hash === hash && item.status === "committed");
  if (existing) throw new DomainError("DUPLICATE_IMPORT", "Такой файл уже импортирован", 409, { importId: existing.id });
  const draft = {
    id: nanoid(),
    status: "previewed" as const,
    fileName,
    hash,
    supplierName: metadata.supplierName?.trim() || undefined,
    invoiceNumber: metadata.invoiceNumber?.trim() || undefined,
    columnMapping: Object.keys(mapping).length ? mapping : undefined,
    rows,
    warnings,
    rejectedRows,
    createdAt: now()
  };
  db.imports.unshift(draft);
  audit(user.id, "supply_import", draft.id, "preview", { rows: rows.length, fileName });
  return draft;
}

export function commitCsvImport(user: User, importId: string, locationId: string, idempotencyKey: string) {
  requirePermission(user, "imports:write");
  requireIdempotencyKey(idempotencyKey);
  requireLocation(locationId, "target");
  const cacheKey = `import:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached as SupplyImport;
  const draft = db.imports.find((item) => item.id === importId);
  if (!draft) throw new DomainError("NOT_FOUND", "Импорт не найден", 404);
  if (draft.status !== "previewed") throw new DomainError("BAD_IMPORT_STATE", "Импорт уже обработан");
  const normalizedRows = draft.rows.flatMap((row) => {
    const validation = validateImportRow(row);
    return "value" in validation ? [validation.value!] : [];
  });
  if (!normalizedRows.length) throw new DomainError("IMPORT_VALIDATION_ERROR", "В импорте нет корректных строк");
  let createdProducts = 0;
  let receipts = 0;
  const productIds: string[] = [];
  const operationIds: string[] = [];
  for (const row of normalizedRows) {
    const product = {
      id: nanoid(),
      officialName: row.name,
      localName: row.localName,
      unit: row.unit,
      photoUrl: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80",
      category: row.category,
      tags: [],
      status: "active" as const,
      identifiers: row.sku ? [{ id: nanoid(), productId: "", type: "supplier_article" as const, value: row.sku, supplierId: supplierIdentifier(draft.supplierName) }] : [],
      lowStockThreshold: 5
    };
    product.identifiers = product.identifiers.map((identifier) => ({ ...identifier, productId: product.id }));
    db.products.unshift(product);
    productIds.push(product.id);
    createdProducts += 1;
    if (row.quantity > 0) {
      const operation = applyStockOperation({
        user,
        type: "receipt",
        productId: product.id,
        toLocationId: locationId,
        quantity: row.quantity,
        reason: `Импорт ${draft.fileName}`,
        idempotencyKey: `${idempotencyKey}:${product.id}`
      });
      operationIds.push(operation.id);
      receipts += 1;
    }
  }
  draft.status = "committed";
  draft.result = { createdProducts, receipts, rejectedRows: draft.rejectedRows?.length || 0, productIds, operationIds, idempotencyKey };
  db.idempotency[cacheKey] = draft;
  audit(user.id, "supply_import", draft.id, "commit", draft.result);
  return draft;
}

export function undoCsvImport(user: User, importId: string, idempotencyKey: string) {
  requirePermission(user, "imports:write");
  requireIdempotencyKey(idempotencyKey);
  const cacheKey = `import-undo:${idempotencyKey}`;
  const cached = db.idempotency[cacheKey];
  if (cached) return cached as SupplyImport;
  const draft = db.imports.find((item) => item.id === importId);
  if (!draft) throw new DomainError("NOT_FOUND", "Импорт не найден", 404);
  if (draft.status !== "committed") throw new DomainError("BAD_IMPORT_STATE", "Откатить можно только применённый импорт");
  const productIds = draft.result?.productIds || [];
  const operationIds = draft.result?.operationIds || [];
  const commitKey = draft.result?.idempotencyKey;
  if (!productIds.length || !commitKey) {
    throw new DomainError("IMPORT_UNDO_UNAVAILABLE", "Для этого импорта нет данных отката");
  }
  const dependentOperations = db.operations.filter((operation) => productIds.includes(operation.productId) && !operationIds.includes(operation.id));
  if (dependentOperations.length) {
    throw new DomainError("IMPORT_UNDO_CONFLICT", "После импорта были движения по созданным товарам", 409, dependentOperations.map((operation) => operation.id));
  }
  for (const operationId of operationIds) {
    const operation = db.operations.find((item) => item.id === operationId);
    if (!operation) continue;
    if (operation.type !== "receipt" || !operation.toLocationId) {
      throw new DomainError("IMPORT_UNDO_CONFLICT", "Откат импорта поддерживает только приходные операции", 409, { operationId });
    }
    const balance = db.balances.find((item) => item.productId === operation.productId && item.locationId === operation.toLocationId);
    if (!balance || balance.quantity < operation.quantity) {
      throw new DomainError("IMPORT_UNDO_CONFLICT", "Остаток уже изменился после импорта", 409, { operationId });
    }
    balance.quantity = roundQty(balance.quantity - operation.quantity);
    balance.version += 1;
  }
  db.operations = db.operations.filter((operation) => !operationIds.includes(operation.id));
  db.balances = db.balances.filter((balance) => !productIds.includes(balance.productId));
  db.products = db.products.filter((product) => !productIds.includes(product.id));
  delete db.idempotency[`import:${commitKey}`];
  for (const productId of productIds) {
    delete db.idempotency[`stock:${commitKey}:${productId}`];
  }
  draft.status = "reverted";
  db.idempotency[cacheKey] = draft;
  audit(user.id, "supply_import", draft.id, "undo", { productIds, operationIds });
  return draft;
}

export function previewProductMerge(user: User, sourceProductId: string, targetProductId: string, resolution: ProductMerge["resolution"] = {}) {
  requirePermission(user, "merge:write");
  if (sourceProductId === targetProductId) throw new DomainError("BAD_MERGE", "Нужно выбрать два разных товара");
  const source = requireProduct(sourceProductId);
  const target = requireProduct(targetProductId);
  const merge = {
    id: nanoid(),
    status: "previewed" as const,
    sourceProductId,
    targetProductId,
    resolution,
    snapshot: {
      source: structuredClone(source),
      target: structuredClone(target),
      balances: structuredClone(db.balances.filter((balance) => balance.productId === sourceProductId || balance.productId === targetProductId)),
      operations: structuredClone(db.operations.filter((operation) => operation.productId === sourceProductId || operation.productId === targetProductId))
    },
    createdAt: now()
  } satisfies ProductMerge;
  db.merges.unshift(merge);
  audit(user.id, "product_merge", merge.id, "preview", { sourceProductId, targetProductId, resolution });
  return merge;
}

export function commitProductMerge(user: User, mergeId: string) {
  requirePermission(user, "merge:write");
  const merge = db.merges.find((item) => item.id === mergeId);
  if (!merge) throw new DomainError("NOT_FOUND", "Merge не найден", 404);
  if (merge.status !== "previewed") throw new DomainError("BAD_MERGE_STATE", "Merge уже обработан");
  const source = requireProduct(merge.sourceProductId);
  const target = requireProduct(merge.targetProductId);
  if (source.unit !== target.unit) {
    throw new DomainError("MERGE_UNIT_MISMATCH", "Нельзя объединить товары с разными единицами измерения без явной конвертации", 409);
  }
  const fields = ["officialName", "localName", "unit", "photoUrl", "category", "tags", "lowStockThreshold"] as const;
  for (const field of fields) {
    if (merge.resolution?.[field] === "source") target[field] = structuredClone(source[field]) as never;
  }
  merge.snapshot.operations = structuredClone(db.operations.filter((operation) => operation.productId === source.id || operation.productId === target.id));
  target.identifiers.push(...source.identifiers.map((identifier) => ({ ...identifier, id: nanoid(), productId: target.id })));
  for (const sourceBalance of db.balances.filter((balance) => balance.productId === source.id)) {
    const targetBalance = db.balances.find((balance) => balance.productId === target.id && balance.locationId === sourceBalance.locationId);
    if (targetBalance) {
      targetBalance.quantity = addQuantity(targetBalance.quantity, sourceBalance.quantity, target.unit);
      targetBalance.version += 1;
    } else {
      db.balances.push({ ...sourceBalance, productId: target.id, version: sourceBalance.version + 1 });
    }
    sourceBalance.quantity = 0;
    sourceBalance.version += 1;
  }
  for (const operation of db.operations) {
    if (operation.productId === source.id) operation.productId = target.id;
  }
  source.status = "deleted";
  merge.status = "committed";
  merge.committedAt = now();
  audit(user.id, "product_merge", merge.id, "commit", { sourceProductId: source.id, targetProductId: target.id });
  return merge;
}

export function undoProductMerge(user: User, mergeId: string) {
  requirePermission(user, "merge:write");
  const merge = db.merges.find((item) => item.id === mergeId);
  if (!merge) throw new DomainError("NOT_FOUND", "Merge не найден", 404);
  if (merge.status !== "committed") throw new DomainError("BAD_MERGE_STATE", "Откатить можно только применённый merge");
  const snapshotOperations = merge.snapshot.operations || [];
  if (snapshotOperations.length) {
    const snapshotOperationIds = new Set(snapshotOperations.map((operation) => operation.id));
    const laterOperations = db.operations.filter(
      (operation) => (operation.productId === merge.sourceProductId || operation.productId === merge.targetProductId) && !snapshotOperationIds.has(operation.id)
    );
    if (laterOperations.length) {
      throw new DomainError("MERGE_UNDO_CONFLICT", "После merge были движения по объединённым товарам", 409, laterOperations.map((operation) => operation.id));
    }
    const currentOperationIds = new Set(db.operations.map((operation) => operation.id));
    const missingOperations = snapshotOperations.filter((operation) => !currentOperationIds.has(operation.id));
    if (missingOperations.length) {
      throw new DomainError("MERGE_UNDO_CONFLICT", "Журнал движений изменился после merge", 409, missingOperations.map((operation) => operation.id));
    }
    const snapshotById = new Map(snapshotOperations.map((operation) => [operation.id, operation]));
    db.operations = db.operations.map((operation) => structuredClone(snapshotById.get(operation.id) || operation));
  }
  db.products = db.products.filter((product) => product.id !== merge.sourceProductId && product.id !== merge.targetProductId);
  db.products.unshift(structuredClone(merge.snapshot.target), structuredClone(merge.snapshot.source));
  db.balances = db.balances.filter((balance) => balance.productId !== merge.sourceProductId && balance.productId !== merge.targetProductId);
  db.balances.push(...structuredClone(merge.snapshot.balances));
  merge.status = "reverted";
  audit(user.id, "product_merge", merge.id, "undo", { sourceProductId: merge.sourceProductId, targetProductId: merge.targetProductId });
  return merge;
}

function parseCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return emptyImportTable();
  const separator = detectCsvSeparator(lines);
  return rowsToObjects(lines.map((line) => splitCsvLine(line, separator)));
}

export function parseImportRows(fileName: string, content: string) {
  return parseImportTable(fileName, content).rows;
}

function parseImportTable(fileName: string, content: string): { rows: Array<Record<string, string>>; columnMapping: ImportColumnMapping } {
  if (/\.xlsx$/i.test(fileName)) return parseXlsxBase64(content);
  if (/\.xls$/i.test(fileName)) return parseXlsBase64(content);
  return parseCsv(content);
}

function parseXlsBase64(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("<")) return parseMarkupTable(trimmed);
  if (/[\n\t,;]/.test(trimmed) && !/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return parseCsv(trimmed);
  const buffer = Buffer.from(trimmed, "base64");
  const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (!buffer.subarray(0, 8).equals(oleSignature)) {
    throw new DomainError("IMPORT_VALIDATION_ERROR", "Некорректный XLS файл");
  }
  const workbook = readOleStream(buffer, ["Workbook", "Book"]);
  return parseBiffWorkbook(workbook);
}

function parseMarkupTable(markup: string) {
  const rowPattern = /<(?:tr|Row)\b[^>]*>([\s\S]*?)<\/(?:tr|Row)>/gi;
  const cellPattern = /<(?:td|th|Cell)\b[^>]*>([\s\S]*?)<\/(?:td|th|Cell)>/gi;
  const rows = [...markup.matchAll(rowPattern)].map((rowMatch) => {
    return [...rowMatch[1].matchAll(cellPattern)].map((cellMatch) => decodeXml(cellMatch[1].replace(/<[^>]+>/g, "").trim()));
  }).filter((row) => row.some(Boolean));
  return rowsToObjects(rows);
}

function readOleStream(buffer: Buffer, streamNames: string[]) {
  if (buffer.length < 512) throw new DomainError("IMPORT_VALIDATION_ERROR", "Некорректный XLS файл");
  const sectorSize = 1 << buffer.readUInt16LE(30);
  const miniSectorSize = 1 << buffer.readUInt16LE(32);
  const fatSectorCount = buffer.readUInt32LE(44);
  const firstDirectorySector = buffer.readInt32LE(48);
  const miniStreamCutoff = buffer.readUInt32LE(56);
  const firstMiniFatSector = buffer.readInt32LE(60);
  const miniFatSectorCount = buffer.readUInt32LE(64);
  const difat = readDifat(buffer, sectorSize, fatSectorCount);
  const fat = difat.flatMap((sectorId) => {
    const sector = readOleSector(buffer, sectorSize, sectorId);
    return Array.from({ length: sectorSize / 4 }, (_, index) => sector.readInt32LE(index * 4));
  });
  const readChain = (startSector: number, size?: number) => {
    const chunks: Buffer[] = [];
    const seen = new Set<number>();
    let sector = startSector;
    while (sector >= 0 && !seen.has(sector)) {
      seen.add(sector);
      chunks.push(readOleSector(buffer, sectorSize, sector));
      sector = fat[sector] ?? -2;
    }
    const data = Buffer.concat(chunks);
    return size === undefined ? data : data.subarray(0, size);
  };
  const directory = readChain(firstDirectorySector);
  const entries = readOleDirectoryEntries(directory);
  const root = entries.find((entry) => entry.type === 5);
  const stream = entries.find((entry) => entry.type === 2 && streamNames.includes(entry.name));
  if (!root || !stream) throw new DomainError("IMPORT_VALIDATION_ERROR", "В XLS нет Workbook stream");
  if (stream.size < miniStreamCutoff && stream.startSector >= 0) {
    if (firstMiniFatSector < 0 || miniFatSectorCount === 0) throw new DomainError("IMPORT_VALIDATION_ERROR", "Некорректный MiniFAT в XLS");
    const miniFatBuffer = readChain(firstMiniFatSector, miniFatSectorCount * sectorSize);
    const miniFat = Array.from({ length: miniFatBuffer.length / 4 }, (_, index) => miniFatBuffer.readInt32LE(index * 4));
    const miniStream = readChain(root.startSector, root.size);
    const chunks: Buffer[] = [];
    const seen = new Set<number>();
    let miniSector = stream.startSector;
    while (miniSector >= 0 && !seen.has(miniSector)) {
      seen.add(miniSector);
      const offset = miniSector * miniSectorSize;
      chunks.push(miniStream.subarray(offset, offset + miniSectorSize));
      miniSector = miniFat[miniSector] ?? -2;
    }
    return Buffer.concat(chunks).subarray(0, stream.size);
  }
  return readChain(stream.startSector, stream.size);
}

function readDifat(buffer: Buffer, sectorSize: number, fatSectorCount: number) {
  const difat: number[] = [];
  for (let offset = 76; offset < 512 && difat.length < fatSectorCount; offset += 4) {
    const sector = buffer.readInt32LE(offset);
    if (sector >= 0) difat.push(sector);
  }
  let nextDifatSector = buffer.readInt32LE(68);
  const difatSectorCount = buffer.readUInt32LE(72);
  for (let index = 0; index < difatSectorCount && nextDifatSector >= 0 && difat.length < fatSectorCount; index += 1) {
    const sector = readOleSector(buffer, sectorSize, nextDifatSector);
    for (let offset = 0; offset < sectorSize - 4 && difat.length < fatSectorCount; offset += 4) {
      const fatSector = sector.readInt32LE(offset);
      if (fatSector >= 0) difat.push(fatSector);
    }
    nextDifatSector = sector.readInt32LE(sectorSize - 4);
  }
  return difat;
}

function readOleSector(buffer: Buffer, sectorSize: number, sectorId: number) {
  const offset = (sectorId + 1) * sectorSize;
  return buffer.subarray(offset, offset + sectorSize);
}

function readOleDirectoryEntries(directory: Buffer) {
  const entries: Array<{ name: string; type: number; startSector: number; size: number }> = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const entry = directory.subarray(offset, offset + 128);
    const nameLength = entry.readUInt16LE(64);
    const name = nameLength > 2 ? entry.subarray(0, nameLength - 2).toString("utf16le") : "";
    const type = entry[66];
    if (!name || type === 0) continue;
    entries.push({
      name,
      type,
      startSector: entry.readInt32LE(116),
      size: entry.readUInt32LE(120)
    });
  }
  return entries;
}

function parseBiffWorkbook(workbook: Buffer) {
  const sharedStrings: string[] = [];
  let sheetOffset = -1;
  forEachBiffRecord(workbook, 0, (type, data) => {
    if (type === 0x0085 && sheetOffset < 0) sheetOffset = data.readUInt32LE(0);
    if (type === 0x00fc) sharedStrings.splice(0, sharedStrings.length, ...parseBiffSharedStrings(data));
  });
  if (sheetOffset < 0) throw new DomainError("IMPORT_VALIDATION_ERROR", "В XLS нет листов");
  const rows = new Map<number, string[]>();
  forEachBiffRecord(workbook, sheetOffset, (type, data) => {
    if (type === 0x00fd) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), sharedStrings[data.readUInt32LE(6)] || "");
    } else if (type === 0x0203) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), formatBiffNumber(data.readDoubleLE(6)));
    } else if (type === 0x0204) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), readBiffString(data, 6).value);
    } else if (type === 0x027e) {
      setBiffCell(rows, data.readUInt16LE(0), data.readUInt16LE(2), formatBiffNumber(readRkNumber(data.readInt32LE(6))));
    } else if (type === 0x00bd) {
      const row = data.readUInt16LE(0);
      const firstCol = data.readUInt16LE(2);
      const lastCol = data.readUInt16LE(data.length - 2);
      for (let col = firstCol; col <= lastCol; col += 1) {
        const rkOffset = 4 + (col - firstCol) * 6 + 2;
        setBiffCell(rows, row, col, formatBiffNumber(readRkNumber(data.readInt32LE(rkOffset))));
      }
    }
  });
  return rowsToObjects([...rows.keys()].sort((a, b) => a - b).map((row) => rows.get(row) || []));
}

function forEachBiffRecord(buffer: Buffer, startOffset: number, visit: (type: number, data: Buffer) => void) {
  for (let offset = startOffset; offset + 4 <= buffer.length;) {
    const type = buffer.readUInt16LE(offset);
    const length = buffer.readUInt16LE(offset + 2);
    if (type === 0 && length === 0) break;
    const data = buffer.subarray(offset + 4, offset + 4 + length);
    visit(type, data);
    offset += 4 + length;
    if (type === 0x000a && startOffset > 0) break;
  }
}

function parseBiffSharedStrings(data: Buffer) {
  const strings: string[] = [];
  const uniqueCount = data.readUInt32LE(4);
  let offset = 8;
  for (let index = 0; index < uniqueCount && offset < data.length; index += 1) {
    const parsed = readBiffString(data, offset);
    strings.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return strings;
}

function readBiffString(buffer: Buffer, offset: number) {
  const length = buffer.readUInt16LE(offset);
  const flags = buffer[offset + 2];
  let cursor = offset + 3;
  const richRuns = flags & 0x08 ? buffer.readUInt16LE(cursor) : 0;
  if (flags & 0x08) cursor += 2;
  const extendedSize = flags & 0x04 ? buffer.readUInt32LE(cursor) : 0;
  if (flags & 0x04) cursor += 4;
  const isUtf16 = Boolean(flags & 0x01);
  const byteLength = length * (isUtf16 ? 2 : 1);
  const raw = buffer.subarray(cursor, cursor + byteLength);
  const value = isUtf16 ? raw.toString("utf16le") : raw.toString("latin1");
  cursor += byteLength + richRuns * 4 + extendedSize;
  return { value, nextOffset: cursor };
}

function setBiffCell(rows: Map<number, string[]>, rowIndex: number, columnIndex: number, value: string) {
  const row = rows.get(rowIndex) || [];
  row[columnIndex] = value;
  rows.set(rowIndex, row);
}

function formatBiffNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function readRkNumber(rk: number) {
  const encoded = rk >>> 0;
  const value = encoded & 0x02
    ? rk >> 2
    : (() => {
        const buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(0, 0);
        buffer.writeUInt32LE(encoded & 0xfffffffc, 4);
        return buffer.readDoubleLE(0);
      })();
  return encoded & 0x01 ? value / 100 : value;
}

function emptyImportTable(): { rows: Array<Record<string, string>>; columnMapping: ImportColumnMapping } {
  return { rows: [], columnMapping: {} };
}

/**
 * Finds the actual header row in supplier files.  A number of suppliers put a
 * title, invoice number or an empty line before the table, so assuming row 1
 * is the header silently imports the wrong data.
 */
export function detectImportHeaderRow(rows: string[][]): { headerRowIndex: number; columnMapping: ImportColumnMapping } | undefined {
  let best: { headerRowIndex: number; columnMapping: ImportColumnMapping; score: number } | undefined;
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const columnMapping = detectImportColumnMapping(rows[index] || []);
    const score = Object.keys(columnMapping).length;
    if (!score) continue;
    if (!best || score > best.score) best = { headerRowIndex: index, columnMapping, score };
  }
  return best && best.score >= 1 ? { headerRowIndex: best.headerRowIndex, columnMapping: best.columnMapping } : undefined;
}

/** Maps common Russian and English supplier headers to the canonical import fields. */
export function detectImportColumnMapping(headers: string[]): ImportColumnMapping {
  const aliases: Record<ImportColumn, string[]> = {
    name: ["name", "product", "product name", "item", "title", "наименование", "наименование товара", "название", "название товара", "товар"],
    quantity: ["quantity", "qty", "amount", "count", "quantity pcs", "количество", "кол во", "колво", "кол", "количество товара"],
    sku: ["sku", "article", "article number", "vendor code", "product code", "code", "артикул", "артикул товара", "код товара", "код"],
    unit: ["unit", "uom", "measure", "unit of measure", "ед", "ед изм", "единица", "единица измерения", "ед измерения"],
    category: ["category", "group", "product group", "категория", "группа", "группа товара"]
  };
  const mapping: ImportColumnMapping = {};
  for (const header of headers) {
    const normalized = normalizeImportHeader(header);
    if (!normalized) continue;
    const target = (Object.keys(aliases) as ImportColumn[]).find((field) => aliases[field].some((alias) => normalizeImportHeader(alias) === normalized));
    if (target && !mapping[target]) mapping[target] = header.trim();
  }
  return mapping;
}

function normalizeImportHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKD")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function rowsToObjects(rows: string[][]): { rows: Array<Record<string, string>>; columnMapping: ImportColumnMapping } {
  const filteredRows = rows.filter((row) => row.some(Boolean));
  if (filteredRows.length < 2) return emptyImportTable();
  const detected = detectImportHeaderRow(filteredRows);
  const headerRowIndex = detected?.headerRowIndex ?? 0;
  const headers = filteredRows[headerRowIndex].map((header, index) => header.trim() || `column_${index + 1}`);
  return {
    rows: filteredRows.slice(headerRowIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))),
    columnMapping: detected?.columnMapping || {}
  };
}

function parseXlsxBase64(base64: string) {
  const files = readZipFiles(Buffer.from(base64, "base64"));
  const workbook = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (!workbook || !rels) throw new DomainError("IMPORT_VALIDATION_ERROR", "Некорректный XLSX файл");
  const firstSheetRel = /<sheet[^>]+r:id="([^"]+)"/.exec(workbook)?.[1];
  if (!firstSheetRel) throw new DomainError("IMPORT_VALIDATION_ERROR", "В XLSX нет листов");
  const relMatch = new RegExp(`<Relationship[^>]+Id="${escapeRegExp(firstSheetRel)}"[^>]+Target="([^"]+)"`).exec(rels);
  const sheetPath = relMatch?.[1]?.startsWith("/") ? relMatch[1].slice(1) : `xl/${relMatch?.[1] || "worksheets/sheet1.xml"}`;
  const sheet = files.get(sheetPath)?.toString("utf8");
  if (!sheet) throw new DomainError("IMPORT_VALIDATION_ERROR", "Лист XLSX не найден");
  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8") || "");
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
      const value = attrs.includes('t="s"') ? sharedStrings[Number(raw)] || "" : inline || raw;
      cells[index] = decodeXml(value);
    }
    return cells;
  }).filter((row) => row.some(Boolean));
  return rowsToObjects(rows);
}

function readZipFiles(buffer: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const fileName = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const dataStart = nameStart + fileNameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (compression === 0) files.set(fileName, data);
    if (compression === 8) files.set(fileName, zlib.inflateRawSync(data));
    offset = dataStart + compressedSize;
  }
  return files;
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    return parts.join("");
  });
}

function columnIndex(column: string) {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectCsvSeparator(lines: string[]) {
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  return candidates
    .map((separator) => ({ separator, columns: splitCsvLine(lines[0] || "", separator).length }))
    .sort((left, right) => right.columns - left.columns)[0]?.separator || ",";
}

function splitCsvLine(line: string, separator: "," | ";" | "\t" = ",") {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

export function acceptSwap(user: User, swapId: string) {
  return stateTransaction((state) => {
    const swap = state.swaps.find((item) => item.id === swapId);
    if (!swap) throw new DomainError("NOT_FOUND", "Заявка не найдена", 404);
    if (swap.toUserId !== user.id) throw new DomainError("FORBIDDEN", "Принять обмен может только выбранный сотрудник", 403);
    if (swap.status !== "pending") throw new DomainError("BAD_SWAP_STATE", "Заявка уже обработана");
    const shift = state.shifts.find((item) => item.id === swap.fromShiftId);
    if (!shift) throw new DomainError("NOT_FOUND", "Смена не найдена", 404);
    if (shift.status !== "scheduled") throw new DomainError("BAD_SWAP_SHIFT", "Обмен доступен только для запланированной смены");
    requireWorkingScheduleDay(state, shift.date, shift.locationId);
    assertNoShiftOverlap({ date: shift.date, start: shift.start, end: shift.end, employeeIds: [swap.toUserId], excludeShiftId: shift.id }, state);
    shift.employeeIds = shift.employeeIds.map((id) => (id === swap.fromUserId ? swap.toUserId : id));
    swap.status = "accepted";
    state.notifications.unshift({ id: nanoid(), channel: "webapp", userId: "u-admin", type: "shift_swap_accepted", payload: { swapId }, read: false, createdAt: now() });
    appendAudit(state, user.id, "shift_swap", swap.id, "accept", { shiftId: shift.id });
    return { swap, shift };
  });
}

export function roundQty(value: number) {
  return normalizeQuantity(value);
}
