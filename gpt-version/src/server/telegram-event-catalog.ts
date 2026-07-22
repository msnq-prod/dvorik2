import type { OutboxMessage } from "../shared/types";
import { OutboxDeliveryError } from "./sqlite-outbox-dispatcher";

export const telegramEventTypes = [
  "stock.threshold", "stock.zero", "swap.requested", "swap.accepted", "swap.declined",
  "swap.cancelled", "swap.expired", "telegram_onboarding_request", "telegram_onboarding_approve",
  "telegram_onboarding_reject", "identity_access_changed", "exchange.requested", "exchange.accepted",
  "exchange.declined", "exchange.cancelled", "exchange.expired", "inventory.active",
  "saby.mapping_required", "saby.negative_stock"
] as const;

type TelegramPayload = Record<string, unknown> & Readonly<{ schemaVersion?: unknown; text?: unknown }>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function versionedPayload(message: OutboxMessage) {
  const payload = message.payload as TelegramPayload;
  if (payload.schemaVersion !== 1) {
    throw new OutboxDeliveryError(`Unsupported ${message.type} payload schema`, "OUTBOX_SCHEMA_VERSION", false);
  }
  return payload;
}

/** Converts canonical outbox events into the Telegram transport DTO. */
export function renderTelegramEvent(message: OutboxMessage): OutboxMessage {
  const payload = versionedPayload(message);
  const explicit = text(payload.text);
  if (explicit) return { ...message, payload: { ...payload, text: explicit } };
  const product = text(payload.productId) || "товара";
  const shift = text(payload.shiftId) || "смены";
  const eventText: Record<(typeof telegramEventTypes)[number], string> = {
    "stock.threshold": `Остаток ${product} достиг минимального уровня.`,
    "stock.zero": `Остаток ${product} закончился.`,
    "swap.requested": `Поступила заявка на подмену ${shift}.`,
    "swap.accepted": `Подмена ${shift} принята.`,
    "swap.declined": `Подмена ${shift} отклонена.`,
    "swap.cancelled": `Заявка на подмену ${shift} отменена.`,
    "swap.expired": `Срок заявки на подмену ${shift} истёк.`,
    "telegram_onboarding_request": "Новая заявка на доступ.",
    "telegram_onboarding_approve": "Доступ одобрен.",
    "telegram_onboarding_reject": "Заявка на доступ отклонена.",
    "identity_access_changed": "Параметры доступа изменены. Выполните вход повторно."
    ,"exchange.requested": "Поступило предложение взаимного обмена сменами."
    ,"exchange.accepted": "Взаимный обмен сменами принят."
    ,"exchange.declined": "Взаимный обмен сменами отклонён."
    ,"exchange.cancelled": "Взаимный обмен сменами отменён."
    ,"exchange.expired": "Предложение обмена сменами устарело."
    ,"inventory.active": "Инвентаризация ещё не завершена."
    ,"saby.mapping_required": "В Saby обнаружена несопоставленная товарная позиция."
    ,"saby.negative_stock": "Продажа Saby не применена к остатку: недостаточно товара."
  };
  if (!(telegramEventTypes as readonly string[]).includes(message.type)) {
    throw new OutboxDeliveryError(`Unsupported Telegram event: ${message.type}`, "OUTBOX_EVENT_UNSUPPORTED", false);
  }
  return { ...message, payload: { ...payload, text: eventText[message.type as (typeof telegramEventTypes)[number]] } };
}
