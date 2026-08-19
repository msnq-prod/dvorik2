import { loadRuntimeConfig } from "./config";

type TelegramResponse = Readonly<{ ok?: boolean; description?: string }>;

function publicUrl(value: string | undefined) {
  const url = new URL(value?.trim() || "");
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("DVORIK_PUBLIC_URL must be an HTTPS origin without a path");
  }
  return url.toString().replace(/\/$/, "");
}

async function telegramRequest(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok || body.ok !== true) throw new Error(`Telegram ${method} failed: ${body.description || response.status}`);
}

export async function configureTelegramBot() {
  const config = loadRuntimeConfig();
  if (!config.production) throw new Error("Telegram bot configuration is production-only");
  const baseUrl = publicUrl(process.env.DVORIK_PUBLIC_URL);
  await telegramRequest(config.telegramBotToken, "setWebhook", {
    url: `${baseUrl}/api/telegram/webhook`,
    secret_token: config.telegramWebhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false
  });
  await telegramRequest(config.telegramBotToken, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Открыть Дворик", web_app: { url: baseUrl } }
  });
  console.log(JSON.stringify({ event: "telegram_bot_configured", webhook: `${baseUrl}/api/telegram/webhook`, webApp: baseUrl }));
}

if (process.argv[1]?.endsWith("configure-telegram.ts") || process.argv[1]?.endsWith("configure-telegram.js")) {
  configureTelegramBot().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
