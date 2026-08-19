import assert from "node:assert/strict";
import { renderTelegramEvent } from "./telegram-event-catalog";
import { OutboxDeliveryError } from "./sqlite-outbox-dispatcher";

const message = { id: "event", channel: "telegram" as const, userId: "user", type: "stock.threshold", payload: { schemaVersion: 1, productId: "p-1" }, status: "pending" as const, attemptCount: 0, availableAt: "2026-07-15T00:00:00.000Z", createdAt: "2026-07-15T00:00:00.000Z" };
assert.match(String(renderTelegramEvent(message).payload.text), /p-1/);
assert.equal(renderTelegramEvent({ ...message, type: "telegram_onboarding_approve", payload: { schemaVersion: 1, text: "custom" } }).payload.text, "custom");
assert.throws(() => renderTelegramEvent({ ...message, payload: {} }), (error) => error instanceof OutboxDeliveryError && error.code === "OUTBOX_SCHEMA_VERSION");
assert.throws(() => renderTelegramEvent({ ...message, type: "unknown" }), (error) => error instanceof OutboxDeliveryError && error.code === "OUTBOX_EVENT_UNSUPPORTED");
