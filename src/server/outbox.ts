import type { OutboxMessage } from "../shared/types";
import { stateTransaction } from "./store";

export async function dispatchOutbox(send: (message: OutboxMessage) => Promise<void>, now = new Date()) {
  const due = stateTransaction((state) => {
    const messages = state.outbox.filter((message) => message.status === "pending" && new Date(message.availableAt).getTime() <= now.getTime()).slice(0, 25);
    messages.forEach((message) => { message.status = "processing"; });
    return structuredClone(messages);
  });
  let sent = 0;
  let failed = 0;
  for (const candidate of due) {
    try {
      await send(candidate);
      stateTransaction((state) => {
        const message = state.outbox.find((item) => item.id === candidate.id);
        if (!message) return;
        message.status = "sent";
        message.sentAt = new Date().toISOString();
      });
      sent += 1;
    } catch (error) {
      stateTransaction((state) => {
        const message = state.outbox.find((item) => item.id === candidate.id);
        if (!message) return;
        message.attemptCount += 1;
        message.status = "pending";
        message.lastError = error instanceof Error ? error.message : String(error);
        message.availableAt = new Date(now.getTime() + Math.min(60 * 60_000, 1_000 * 2 ** message.attemptCount)).toISOString();
      });
      failed += 1;
    }
  }
  return { sent, failed };
}
