import { loadRuntimeConfig } from "./config";
import { openDatabase } from "./database";
import { IdentityQueryService } from "./identity-service";
import { createSqliteIdentityCommandRepositories } from "./sqlite-identity-command-repositories";
import { dispatchSqliteOutbox, OutboxDeliveryError } from "./sqlite-outbox-dispatcher";
import { UnitOfWork } from "./unit-of-work";
import { assertDeferredWorkerType, deferredWorkerTypes } from "./launch-scope";
import { renderTelegramEvent } from "./telegram-event-catalog";

export async function dispatchTelegramOutbox(fetchImpl: typeof fetch = fetch) {
  const config = loadRuntimeConfig();
  const token = config.telegramBotToken;
  const useSqlite = config.production || Boolean(process.env.DVORIK_SQLITE_FILE);
  if (!useSqlite) {
    // Legacy state is retained strictly for non-production compatibility tests.
    const [{ dispatchOutbox }, { db }] = await Promise.all([import("./outbox"), import("./store")]);
    return dispatchOutbox(async (message) => sendTelegramMessage(message, token, undefined, config.production, fetchImpl, db.users.find((user) => user.id === message.userId)));
  }
  const identityDatabase = openDatabase(config.sqliteFile);
  const identities = identityDatabase
    ? new IdentityQueryService(new UnitOfWork(identityDatabase, createSqliteIdentityCommandRepositories)) : undefined;
  try {
    return await dispatchSqliteOutbox(identityDatabase, async (message) => sendTelegramMessage(config.production ? renderTelegramEvent(message) : message, token, identities, config.production, fetchImpl), {
      channel: "telegram", ...(config.production ? { excludedTypes: deferredWorkerTypes } : {})
    });
  } finally {
    identityDatabase.close();
  }
}

export type TelegramWorkerOptions = Readonly<{
  fetchImpl?: typeof fetch;
  pollMs?: number;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
}>;

export async function runTelegramOutboxWorker(options: TelegramWorkerOptions = {}) {
  const pollMs = Math.max(50, options.pollMs ?? 1_000);
  const signal = options.signal;
  let sent = 0;
  let failed = 0;
  let cycles = 0;
  let workerErrors = 0;
  while (!signal?.aborted) {
    try {
      const result = await dispatchTelegramOutbox(options.fetchImpl);
      sent += result.sent;
      failed += result.failed;
      cycles += 1;
    } catch (error) {
      workerErrors += 1;
      options.onError?.(error);
    }
    if (signal?.aborted) break;
    await waitForPoll(pollMs, signal);
  }
  return { sent, failed, cycles, workerErrors, stopped: true as const };
}

function waitForPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      done();
    };
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function telegramResponseError(response: Response) {
  let payload: { error_code?: unknown; description?: unknown; parameters?: { retry_after?: unknown } } | undefined;
  try { payload = await response.clone().json() as typeof payload; } catch { /* non-JSON gateway response */ }
  const code = Number(payload?.error_code ?? response.status);
  const description = typeof payload?.description === "string" ? payload.description : `Telegram request failed: ${response.status}`;
  const retryAfter = Number(payload?.parameters?.retry_after);
  if (code === 429 || response.status === 429) {
    return new OutboxDeliveryError(description, "TELEGRAM_429", true, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : undefined);
  }
  if (response.status >= 500 || response.status === 408 || response.status === 409) {
    return new OutboxDeliveryError(description, `TELEGRAM_${response.status}`, true);
  }
  return new OutboxDeliveryError(description, `TELEGRAM_${Number.isFinite(code) ? code : response.status}`, false);
}

async function sendTelegramMessage(
  message: import("../shared/types").OutboxMessage,
  token: string,
  identities: IdentityQueryService | undefined,
  production: boolean,
  fetchImpl: typeof fetch,
  legacyUser?: import("../shared/types").User
) {
  if (message.channel !== "telegram") throw new Error(`Unsupported outbox channel: ${message.channel}`);
  if (production && !assertDeferredWorkerType(message.type)) throw new Error(`FEATURE_DISABLED:${message.type}`);
  const terminalIdentityTypes = new Set(["telegram_onboarding_received", "telegram_onboarding_reject", "identity_access_changed"]);
  const user = identities?.findById(message.userId) ?? legacyUser;
  if (!user?.telegramUserId || (user.status !== "active" && !terminalIdentityTypes.has(message.type))) {
    throw new Error("Telegram recipient is not eligible");
  }
  const text = String(message.payload.text || "").trim();
  if (!text) throw new Error("Telegram outbox message has no text");
  const documentBase64 = typeof message.payload.documentBase64 === "string" ? message.payload.documentBase64 : "";
  if (documentBase64) {
    const fileName = String(message.payload.fileName || "report.pdf");
    const form = new FormData();
    form.set("chat_id", user.telegramUserId);
    form.set("caption", text);
    form.set("document", new Blob([Buffer.from(documentBase64, "base64")], { type: "application/pdf" }), fileName);
    const response = await fetchWithTimeout(fetchImpl, `https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
    if (!response.ok) throw await telegramResponseError(response);
    return;
  }
  const response = await fetchWithTimeout(fetchImpl, `https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: user.telegramUserId, text, ...(message.payload.reply_markup ? { reply_markup: message.payload.reply_markup } : {}) })
  });
  if (!response.ok) throw await telegramResponseError(response);
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new OutboxDeliveryError("Telegram request timed out", "TELEGRAM_TIMEOUT", true);
    throw new OutboxDeliveryError(error instanceof Error ? error.message : String(error), "TELEGRAM_NETWORK", true);
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1]?.endsWith("telegram-worker.ts") || process.argv[1]?.endsWith("telegram-worker.js")) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  runTelegramOutboxWorker({ signal: controller.signal, onError: (error) => console.error(error) })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
