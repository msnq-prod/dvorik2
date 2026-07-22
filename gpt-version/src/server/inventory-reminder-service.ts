import { nanoid } from "nanoid";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import type { AuditRepository, IdempotencyRepository, JsonObject, NotificationsRepository, OutboxRepository } from "./repositories";

export type InventoryReminderRepositories = Readonly<{
  inventory: Readonly<{ active(): Readonly<{ id: string; startedAt: string }> | undefined }>;
  recipients: Readonly<{ activeManagerIds(): readonly string[] }>;
  notifications: Pick<NotificationsRepository, "append">;
  outbox: Pick<OutboxRepository, "enqueue">;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;
type Options = Readonly<{ processingTimeoutMs: number; idempotencyRetentionMs: number; outboxMaxAttempts: number; createId?: (kind: "audit" | "notification" | "outbox") => string }>;

export class InventoryReminderService {
  private readonly createId: NonNullable<Options["createId"]>;
  constructor(private readonly executor: CommandExecutor<InventoryReminderRepositories>, private readonly options: Options) { this.createId = options.createId ?? (() => nanoid()); }

  run(metadata: CommandMetadata): IdempotencyResult<JsonObject> | Readonly<{ outcome: "rejected"; status: 403; body: JsonObject }> {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "system" || context.actor.service !== "inventory-reminder") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      return executeIdempotently(context, "inventory.active.reminder", {}, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => this.apply(context));
    }, { transactionMode: "immediate" });
  }

  private apply(context: CommandContext<InventoryReminderRepositories>): Readonly<{ status: number; body: JsonObject }> {
    const repositories = context.transaction.repositories;
    const session = repositories.inventory.active();
    if (!session) return { status: 200, body: { reminded: 0 } };
    const at = context.clock.now();
    const recipients = repositories.recipients.activeManagerIds();
    for (const userId of recipients) {
      const payload: JsonObject = { schemaVersion: 1, eventType: "inventory.active", sessionId: session.id, startedAt: session.startedAt, correlationId: context.correlationId };
      if (repositories.notifications.append({ id: this.createId("notification"), channel: "webapp", userId, type: "inventory.active", payload: { schemaVersion: 1, value: payload }, read: false, createdAt: at }, { at, expectedRevision: null }).outcome !== "created") throw new Error("inventory reminder notification collided");
      if (repositories.outbox.enqueue({ id: this.createId("outbox"), channel: "telegram", userId, type: "inventory.active", payload: { schemaVersion: 1, value: payload }, status: "pending", attemptCount: 0, maxAttempts: this.options.outboxMaxAttempts, availableAt: at, createdAt: at, idempotencyKey: `inventory-reminder:${session.id}:${userId}:${metadataDate(at)}` }, { at, expectedRevision: null }).outcome !== "created") throw new Error("inventory reminder outbox collided");
    }
    if (repositories.audit.append({ id: this.createId("audit"), entity: "inventory_session", entityId: session.id, action: "reminder", changes: { schemaVersion: 1, value: { recipients: [...recipients], correlationId: context.correlationId } }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null }).outcome !== "created") throw new Error("inventory reminder audit collided");
    return { status: 200, body: { reminded: recipients.length, sessionId: session.id } };
  }
}

function metadataDate(at: string) { return at.slice(0, 10); }
