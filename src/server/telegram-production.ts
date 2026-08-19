import type { Role, User } from "../shared/types";
import { DomainError } from "./domain-core";

export type TelegramUpdate = Readonly<{
  update_id?: number;
  message?: { text?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string } };
  callback_query?: { data?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string } };
}>;

export type ProductionTelegramIdentityHooks = Readonly<{
  resolveTelegramUser(telegramUserId: string): User | undefined;
  registerTelegramApplicant(input: Readonly<{ updateId: number; telegramUserId: string; firstName: string; lastName: string; username: string }>): User;
  resolveOnboarding(input: Readonly<{ updateId: number; actorTelegramUserId: string; actorUserId: string; targetUserId: string; action: "approve" | "reject"; role?: Role }>): User;
}>;

/** Production allowlist: onboarding only, no legacy calendar/swap/state transaction path. */
export function handleProductionTelegramUpdate(update: TelegramUpdate, hooks: ProductionTelegramIdentityHooks) {
  const updateId = Number(update.update_id);
  if (!Number.isInteger(updateId) || updateId < 0) return { ignored: true, reason: "invalid_update" };
  const from = update.message?.from || update.callback_query?.from;
  const text = String(update.message?.text || update.callback_query?.data || "").trim();
  if (!from) return { ignored: true, reason: "unsupported_update" };
  const user = hooks.resolveTelegramUser(String(from.id)) ?? hooks.registerTelegramApplicant({
    updateId, telegramUserId: String(from.id), firstName: String(from.first_name || ""),
    lastName: String(from.last_name || ""), username: String(from.username || "")
  });
  if (text === "/start") return { userId: user.id, status: user.status };
  if (!text.startsWith("onboard:")) return { ignored: true, reason: "FEATURE_DISABLED" };
  const [, action, targetUserId, role] = text.split(":");
  if (!targetUserId || (action !== "approve" && action !== "reject")) {
    throw new DomainError("BAD_ONBOARD_ACTION", "Некорректное действие onboarding");
  }
  if (action === "approve" && role !== undefined) {
    throw new DomainError("BAD_ONBOARD_ACTION", "Некорректное действие onboarding");
  }
  const resolved = hooks.resolveOnboarding({
    updateId, actorTelegramUserId: String(from.id), actorUserId: user.id, targetUserId, action,
    ...(action === "approve" ? { role: "seller" as Role } : {})
  });
  return { userId: resolved.id, status: resolved.status };
}
