import { nanoid } from "nanoid";
import type { AppState, NotificationPreference, OutboxMessage, Role, User } from "../shared/types";
import { rolePermissions } from "./permissions";
import { appendAudit, stateTransaction } from "./store";
import { acceptSwap, declineSwap, DomainError } from "./domain";

type TelegramUpdate = {
  update_id?: number;
  message?: { text?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string } };
  callback_query?: { data?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string } };
};

export type TelegramIdentityHooks = Readonly<{
  resolveTelegramUser?(telegramUserId: string): User | undefined;
  registerTelegramApplicant?(input: Readonly<{
    updateId: number;
    telegramUserId: string;
    firstName: string;
    lastName: string;
    username: string;
  }>): User;
  resolveOnboarding?(input: Readonly<{
    updateId: number;
    actorTelegramUserId: string;
    actorUserId: string;
    targetUserId: string;
    action: "approve" | "reject";
    role?: Role;
  }>): User;
}>;

function monthCalendar(userId: string, state: AppState, month = new Date()) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const own = state.shifts.some((shift) => shift.date === key && shift.employeeIds.includes(userId) && shift.status === "scheduled");
    const label = date.getUTCMonth() === month.getUTCMonth() ? `${own ? "✅" : "·"}${date.getUTCDate()}` : " ";
    return { text: label, callback_data: `cal:${key}` };
  });
  return { inline_keyboard: [[{ text: "‹", callback_data: "cal:prev" }, { text: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`, callback_data: "cal:noop" }, { text: "›", callback_data: "cal:next" }], ...Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7))] };
}

function calendarMonthKey(userId: string) {
  return `telegram-calendar-month:${userId}`;
}

function parseMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const month = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(month.getTime()) ? null : month;
}

function monthKey(month: Date) {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: Date, amount: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

function calendarMonth(state: AppState, userId: string) {
  return parseMonth(state.idempotency[calendarMonthKey(userId)]) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
}

function dayDetail(userId: string, state: AppState, date: string) {
  const shifts = state.shifts.filter((shift) => shift.date === date && shift.employeeIds.includes(userId) && shift.status !== "cancelled");
  const closed = state.scheduleDays.filter((day) => day.date === date && day.status === "closed");
  if (!shifts.length) return closed.length ? `${date}: точка закрыта.` : `${date}: смен нет.`;
  return [`${date}:`, ...shifts.map((shift) => {
    const location = state.locations.find((item) => item.id === shift.locationId);
    return `${shift.start}–${shift.end} · ${location?.name || shift.locationId}${shift.comment ? ` (${shift.comment})` : ""}`;
  })].join("\n");
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function enqueue(state: AppState, userId: string, type: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const existing = state.outbox.find((item) => item.channel === "telegram" && item.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const message: OutboxMessage = { id: nanoid(), channel: "telegram", userId, type, payload, status: "pending", attemptCount: 0, availableAt: new Date().toISOString(), createdAt: new Date().toISOString(), idempotencyKey };
  state.outbox.unshift(message);
  return message;
}

function findOrCreateTelegramUser(state: AppState, from: NonNullable<NonNullable<TelegramUpdate["message"]>["from"]>) {
  const existing = state.users.find((user) => user.telegramUserId === String(from.id));
  if (existing) return existing;
  const user: User = {
    id: `tg-${from.id}`,
    telegramUserId: String(from.id),
    firstName: String(from.first_name || ""),
    lastName: String(from.last_name || ""),
    username: String(from.username || ""),
    status: "pending",
    role: "seller",
    permissions: rolePermissions.seller
  };
  state.users.push(user);
  return user;
}

/** Shared application service used by the HTTP webhook adapter; no adapter performs DB work itself. */
export function handleTelegramUpdate(update: TelegramUpdate, hooks: TelegramIdentityHooks = {}) {
  const updateId = Number(update.update_id);
  if (!Number.isInteger(updateId) || updateId < 0) return { ignored: true, reason: "invalid_update" };
  // Production installs all three identity hooks. Keep that path outside the
  // legacy AppState transaction: onboarding, roles, session revocation, audit
  // and the target outbox message must share the SQLite command UoW.
  if (hooks.resolveTelegramUser && hooks.registerTelegramApplicant && hooks.resolveOnboarding) {
    const from = update.message?.from || update.callback_query?.from;
    const text = String(update.message?.text || update.callback_query?.data || "").trim();
    if (!from) return { ignored: true, reason: "unsupported_update" };
    const user = hooks.resolveTelegramUser(String(from.id)) ?? hooks.registerTelegramApplicant({
      updateId,
      telegramUserId: String(from.id),
      firstName: String(from.first_name || ""),
      lastName: String(from.last_name || ""),
      username: String(from.username || "")
    });
    if (text === "/start") return { userId: user.id, status: user.status };
    if (!text.startsWith("onboard:")) return { ignored: true, reason: "FEATURE_DISABLED" };

    const [, action, targetUserId, role] = text.split(":");
    if (!targetUserId || (action !== "approve" && action !== "reject")) {
      throw new DomainError("BAD_ONBOARD_ACTION", "Некорректное действие onboarding");
    }
    if (action === "approve" && role !== "seller" && role !== "admin") {
      throw new DomainError("BAD_ONBOARD_ACTION", "Некорректное действие onboarding");
    }
    const approvedRole = action === "approve" ? role as Role : undefined;
    const resolved = hooks.resolveOnboarding({
      updateId,
      actorTelegramUserId: String(from.id),
      actorUserId: user.id,
      targetUserId,
      action,
      ...(approvedRole ? { role: approvedRole } : {})
    });
    return { userId: resolved.id, status: resolved.status };
  }
  return stateTransaction((state) => {
    const cacheKey = `telegram-update:${updateId}`;
    if (state.idempotency[cacheKey]) return state.idempotency[cacheKey] as { ignored?: boolean; userId?: string; status?: string };
    const from = update.message?.from || update.callback_query?.from;
    const text = String(update.message?.text || update.callback_query?.data || "").trim();
    if (!from) {
      const result = { ignored: true, reason: "unsupported_update" };
      state.idempotency[cacheKey] = result;
      return result;
    }
    const user = hooks.resolveTelegramUser?.(String(from.id))
      ?? hooks.registerTelegramApplicant?.({
        updateId,
        telegramUserId: String(from.id),
        firstName: String(from.first_name || ""),
        lastName: String(from.last_name || ""),
        username: String(from.username || "")
      })
      ?? findOrCreateTelegramUser(state, from);
    let message = "Команда не распознана. Доступно: /start, Мой график, Наличие, Поиск товара, Уведомления.";
    if (text === "/start") {
      message = user.status === "pending" ? "Заявка на доступ отправлена администратору." : "Добро пожаловать в Дворик.";
      if (user.status === "pending" && !hooks.registerTelegramApplicant) {
        for (const admin of state.users.filter((item) => item.role === "super_admin" && item.status === "active")) {
          enqueue(state, admin.id, "telegram_onboarding_request", {
            text: `Новая заявка: ${`${user.firstName} ${user.lastName}`.trim() || user.id}`,
            userId: user.id,
            reply_markup: {
              inline_keyboard: [[
                { text: "Одобрить продавца", callback_data: `onboard:approve:${user.id}:seller` },
                { text: "Отклонить", callback_data: `onboard:reject:${user.id}` }
              ]]
            }
          }, `tg-onboarding:${user.id}:${admin.id}`);
        }
      }
    } else if (user.status !== "active") {
      message = "Доступ ожидает одобрения администратора.";
    } else if (text === "Мой график") {
      const own = state.shifts.filter((shift) => shift.employeeIds.includes(user.id) && shift.status === "scheduled").slice(0, 8);
      message = own.length ? own.map((shift) => `${shift.date}: ${shift.locationId}`).join("\n") : "Ближайших смен нет.";
      const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
      enqueue(state, user.id, "telegram_calendar", { text: message, reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
    } else if (text.startsWith("swap:")) {
      const [, action, swapId] = text.split(":");
      if (!swapId || !["accept", "decline"].includes(action)) throw new DomainError("BAD_SWAP_ACTION", "Некорректное действие подмены");
      if (action === "accept") {
        const { swap } = acceptSwap(user, swapId);
        enqueue(state, swap.fromUserId, "telegram_message", { text: "Подмена смены принята." }, `tg-swap-accepted:${swap.id}`);
        message = "Подмена принята.";
      } else {
        const swap = declineSwap(user, swapId);
        enqueue(state, swap.fromUserId, "telegram_message", { text: "Подмена смены отклонена." }, `tg-swap-declined:${swap.id}`);
        message = "Подмена отклонена.";
      }
    } else if (text === "cal:prev" || text === "cal:next") {
      const month = addMonths(calendarMonth(state, user.id), text === "cal:prev" ? -1 : 1);
      state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
      enqueue(state, user.id, "telegram_calendar", { text: `График на ${monthKey(month)}`, reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
    } else if (text.startsWith("cal:")) {
      const date = text.slice(4);
      if (isCalendarDate(date)) {
        const month = new Date(`${date}T00:00:00.000Z`);
        state.idempotency[calendarMonthKey(user.id)] = monthKey(month);
        enqueue(state, user.id, "telegram_calendar", { text: dayDetail(user.id, state, date), reply_markup: monthCalendar(user.id, state, month) }, `tg-calendar:${updateId}`);
      } else if (text !== "cal:noop") {
        message = "Некорректная дата календаря.";
      }
    } else if (text.startsWith("onboard:")) {
      if (user.role !== "super_admin") throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
      const [, action, pendingUserId, role] = text.split(":");
      const pending = hooks.resolveOnboarding
        ? undefined
        : state.users.find((item) => item.id === pendingUserId && item.status === "pending");
      if (!hooks.resolveOnboarding && !pending) throw new DomainError("PENDING_USER_NOT_FOUND", "Заявка уже обработана", 404);
      if (action === "approve" && (role === "seller" || role === "admin")) {
        hooks.resolveOnboarding?.({ updateId, actorTelegramUserId: String(from.id), actorUserId: user.id, targetUserId: pendingUserId, action, role });
        if (pending) {
          pending.status = "active";
          pending.role = role;
          pending.permissions = rolePermissions[role];
          enqueue(state, pending.id, "telegram_message", { text: "Доступ одобрен." }, `tg-approved:${pending.id}`);
        }
        message = "Заявка одобрена.";
      } else if (action === "reject") {
        hooks.resolveOnboarding?.({ updateId, actorTelegramUserId: String(from.id), actorUserId: user.id, targetUserId: pendingUserId, action });
        if (pending) {
          pending.status = "rejected";
          enqueue(state, pending.id, "telegram_message", { text: "Заявка на доступ отклонена." }, `tg-rejected:${pending.id}`);
        }
        message = "Заявка отклонена.";
      } else throw new DomainError("BAD_ONBOARD_ACTION", "Некорректное действие onboarding");
      if (pending) appendAudit(state, user.id, "telegram_onboarding", pending.id, action, { role });
    } else if (text === "Наличие") {
      message = "Откройте WebApp для детального наличия по точкам.";
    } else if (text === "Поиск товара") {
      message = "Отправьте название или артикул товара.";
    } else if (text === "Уведомления") {
      message = "Настройки уведомлений доступны в WebApp.";
    }
    if (text !== "Мой график" && !text.startsWith("cal:")) enqueue(state, user.id, "telegram_message", { text: message }, `tg-response:${updateId}`);
    appendAudit(state, user.id, "telegram_update", String(updateId), "handle", { text, userStatus: user.status });
    const result = { userId: user.id, status: user.status };
    state.idempotency[cacheKey] = result;
    return result;
  });
}

export function approveTelegramOnboarding(actor: User, userId: string, role: Role, beforeApprove?: () => void) {
  if (actor.role !== "super_admin") throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
  return stateTransaction((state) => {
    const user = state.users.find((item) => item.id === userId && item.status === "pending");
    if (!user) throw new DomainError("PENDING_USER_NOT_FOUND", "Пользователь не ожидает одобрения", 404);
    beforeApprove?.();
    user.status = "active";
    user.role = role;
    user.permissions = rolePermissions[role];
    for (const session of state.sessions.filter((item) => item.userId === user.id && !item.revokedAt)) session.revokedAt = new Date().toISOString();
    enqueue(state, user.id, "telegram_message", { text: "Доступ одобрен. Откройте WebApp или используйте меню бота." }, `tg-approved:${user.id}`);
    appendAudit(state, actor.id, "telegram_onboarding", user.id, "approve", { role });
    return user;
  });
}

export function setNotificationPreference(user: User, input: Omit<NotificationPreference, "userId">) {
  if (!["telegram", "webapp"].includes(input.channel) || !["off", "instant", "daily"].includes(input.deliveryMode)) throw new DomainError("BAD_NOTIFICATION_PREFERENCE", "Некорректная настройка уведомлений");
  if (input.deliveryMode === "daily") throw new DomainError("FEATURE_DISABLED", "Daily digest отключён до post-launch", 404);
  return stateTransaction((state) => {
    const existing = state.notificationPreferences.find((item) => item.userId === user.id && item.channel === input.channel && item.eventType === input.eventType);
    const preference: NotificationPreference = existing || { userId: user.id, ...input };
    preference.deliveryMode = input.deliveryMode;
    if (!existing) state.notificationPreferences.push(preference);
    appendAudit(state, user.id, "notification_preference", `${input.channel}:${input.eventType}`, "upsert", preference);
    return preference;
  });
}
