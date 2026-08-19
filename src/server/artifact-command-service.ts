import { nanoid } from "nanoid";
import type { LabelPrintJob, Permission } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import type { AuditRepository, IdempotencyRepository, JsonObject, RepositoryRecord, RolesRepository } from "./repositories";

export type ArtifactCommandRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  labels: Readonly<{
    findById(id: string): RepositoryRecord<LabelPrintJob> | undefined;
    create(job: LabelPrintJob, at: string): "created" | "duplicate";
  }>;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

export type ArtifactCommandResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403;
  body: JsonObject;
}>;

export class ArtifactCommandService {
  constructor(
    private readonly executor: CommandExecutor<ArtifactCommandRepositories>,
    private readonly options: Readonly<{ processingTimeoutMs: number; idempotencyRetentionMs: number; createId?: () => string }>
  ) {}

  createLabel(metadata: CommandMetadata, job: LabelPrintJob): ArtifactCommandResult {
    return this.execute(metadata, "labels:print", "label.create", job as unknown as JsonObject, (context, actorId) => {
      const at = context.clock.now();
      if (context.transaction.repositories.labels.create(job, at) !== "created") throw new Error("label insert collided inside idempotent transaction");
      this.audit(context, actorId, "label_job", job.id, "create", {
        labels: job.labels.reduce((total, label) => total + label.quantity, 0), templateId: job.templateId,
        geometry: job.geometry as unknown as JsonObject
      }, at);
      return { status: 201, body: JSON.parse(JSON.stringify(job)) as JsonObject };
    });
  }

  recordLabelReprint(metadata: CommandMetadata, jobId: string): ArtifactCommandResult {
    return this.execute(metadata, "labels:print", "label.reprint", { jobId }, (context, actorId) => {
      const job = context.transaction.repositories.labels.findById(jobId);
      if (!job) return { status: 404, body: { code: "NOT_FOUND", message: "Задание печати не найдено" } };
      const at = context.clock.now();
      this.audit(context, actorId, "label_job", jobId, "reprint", {
        labels: job.entity.labels.reduce((total, label) => total + label.quantity, 0)
      }, at);
      return { status: 200, body: JSON.parse(JSON.stringify(job.entity)) as JsonObject };
    });
  }

  recordExternal(metadata: CommandMetadata, permission: Permission, input: Readonly<{
    scope: string;
    entity: string;
    entityId: string;
    action: string;
    changes: JsonObject;
  }>): ArtifactCommandResult {
    return this.execute(metadata, permission, input.scope, input as unknown as JsonObject, (context, actorId) => {
      const at = context.clock.now();
      this.audit(context, actorId, input.entity, input.entityId, input.action, input.changes, at);
      return { status: 200, body: { recorded: true } };
    });
  }

  private execute(
    metadata: CommandMetadata,
    permission: Permission,
    scope: string,
    request: JsonObject,
    run: (context: CommandContext<ArtifactCommandRepositories>, actorId: string) => Readonly<{ status: number; body: JsonObject }>
  ): ArtifactCommandResult {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      const authorization = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization.outcome !== "found" || !authorization.snapshot.permissions.includes(permission)) {
        return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      }
      return executeIdempotently(context, scope, request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => run(context, authorization.snapshot.userId));
    }, { transactionMode: "immediate" });
  }

  private audit(context: CommandContext<ArtifactCommandRepositories>, actorId: string, entity: string, entityId: string, action: string, changes: JsonObject, at: string) {
    const result = context.transaction.repositories.audit.append({
      id: this.options.createId?.() ?? nanoid(), actorId, entity, entityId, action,
      changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("audit insert collided inside idempotent transaction");
  }
}
