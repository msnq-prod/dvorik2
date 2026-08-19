import crypto from "node:crypto";
import { DomainError } from "./domain-core";

export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 60 * 60 * 24) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new DomainError("BAD_TELEGRAM_INIT_DATA", "В init data нет hash", 401);
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(hash) || !crypto.timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(hash, "hex"))) {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "Некорректная подпись Telegram", 401);
  }
  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds) {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "Telegram init data устарели", 401);
  }
  const userJson = params.get("user");
  if (!userJson) throw new DomainError("BAD_TELEGRAM_INIT_DATA", "В init data нет user", 401);
  try {
    return JSON.parse(userJson) as { id: number; first_name?: string; last_name?: string; username?: string };
  } catch {
    throw new DomainError("BAD_TELEGRAM_INIT_DATA", "Некорректный user в init data", 401);
  }
}

export function signTelegramInitData(payload: Record<string, string>, botToken: string) {
  const params = new URLSearchParams(payload);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
