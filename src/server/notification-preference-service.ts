import { nanoid } from "nanoid";
import type { NotificationPreference } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import { createPageRequest, type AuditRepository, type IdempotencyRepository, type JsonObject, type NotificationsRepository, type RolesRepository } from "./repositories";

export type NotificationPreferenceCommandRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  notifications: Pick<NotificationsRepository, "listPreferences" | "savePreference">;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

export type NotificationPreferenceResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403;
  body: JsonObject;
}>;

export class NotificationPreferenceService {
  constructor(
    private readonly executor: CommandExecutor<NotificationPreferenceCommandRepositories>,
    private readonly options: Readonly<{ processingTimeoutMs: number; idempotencyRetentionMs: number; createId?: () => string }>
  ) {}

  list(userId: string): readonly NotificationPreference[] {
    return this.executor.execute({
      actorReference: { kind: "user", userId, authenticatedBy: "web_session" },
      requestId: `notification-preferences:${userId}`,
      channel: "web",
      idempotencyKey: `notification-preferences:${userId}`
    }, (context) => context.transaction.repositories.notifications.listPreferences(userId, createPageRequest(100, "name_asc_id_asc")).items.map((item) => item.entity));
  }

  save(metadata: CommandMetadata, input: Readonly<{ channel: unknown; eventType: string; deliveryMode: unknown }>): NotificationPreferenceResult {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      const authorization = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization.outcome !== "found") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      const request = { channel: String(input.channel ?? ""), eventType: input.eventType, deliveryMode: String(input.deliveryMode ?? "") };
      return executeIdempotently(context, "notification.preference.save", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, authorization.snapshot.userId, input));
    }, { transactionMode: "immediate" });
  }

  private apply(context: CommandContext<NotificationPreferenceCommandRepositories>, userId: string, input: Readonly<{ channel: unknown; eventType: string; deliveryMode: unknown }>) {
    if ((input.channel !== "telegram" && input.channel !== "webapp")
      || (input.deliveryMode !== "off" && input.deliveryMode !== "instant" && input.deliveryMode !== "daily")
      || !input.eventType.trim()) {
      return { status: 400, body: { code: "BAD_NOTIFICATION_PREFERENCE", message: "Некорректная настройка уведомлений" } } as const;
    }
    if (input.deliveryMode === "daily") {
      return { status: 404, body: { code: "FEATURE_DISABLED", message: "Daily digest отключён до post-launch" } } as const;
    }
    const preference: NotificationPreference = {
      userId, channel: input.channel, eventType: input.eventType.trim(), deliveryMode: input.deliveryMode
    };
    const repository = context.transaction.repositories.notifications;
    const current = repository.listPreferences(userId, createPageRequest(100, "name_asc_id_asc")).items
      .find((item) => item.entity.channel === preference.channel && item.entity.eventType === preference.eventType);
    const at = context.clock.now();
    const saved = repository.savePreference(preference, current
      ? { at, expectedRevision: current.revision }
      : { at, expectedRevision: null });
    if (saved.outcome === "stale") return { status: 409, body: { code: "VERSION_CONFLICT", message: "Настройка уже изменена" } } as const;
    if (saved.outcome === "missing") throw new Error("notification preference disappeared inside transaction");
    const audit = context.transaction.repositories.audit.append({
      id: this.options.createId?.() ?? nanoid(), actorId: userId, entity: "notification_preference",
      entityId: `${preference.channel}:${preference.eventType}`, action: "upsert",
      changes: { schemaVersion: 1, value: { channel: preference.channel, eventType: preference.eventType, deliveryMode: preference.deliveryMode } },
      requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null });
    if (audit.outcome !== "created") throw new Error("audit insert collided inside idempotent transaction");
    return { status: 200, body: preference as unknown as JsonObject } as const;
  }
}
