import { nanoid } from "nanoid";
import type { Role, User, UserStatus } from "../shared/types";
import { CommandExecutor, type CommandContext, type CommandMetadata } from "./command-context";
import { executeIdempotently, type IdempotencyResult, type IdempotentHttpResponse } from "./idempotency";
import type {
  AuditRepository,
  AuthorizationLookup,
  IdempotencyRepository,
  JsonObject,
  OutboxRepository,
  RepositoryRecord,
  SessionsRepository,
  UpdateResult,
  UtcTimestamp
} from "./repositories";
import type { UnitOfWork } from "./unit-of-work";

export type IdentityUsersRepository = Readonly<{
  findById(userId: string): RepositoryRecord<User> | undefined;
  findByTelegramUserId(telegramUserId: string): RepositoryRecord<User> | undefined;
  list(): readonly RepositoryRecord<User>[];
  createPendingTelegram(profile: Readonly<{
    id: string;
    telegramUserId: string;
    firstName: string;
    lastName: string;
    username: string;
  }>, at: UtcTimestamp): Readonly<{ created: boolean; record: RepositoryRecord<User> }>;
  saveStatus(userId: string, status: UserStatus, options: Readonly<{ at: UtcTimestamp; expectedRevision: string }>): UpdateResult<User>;
  assignPrimaryRole(userId: string, role: Role, input: Readonly<{ actorId: string; at: UtcTimestamp }>): RepositoryRecord<User>;
  countActiveSuperAdmins(): number;
  listActiveOnboardingReviewerIds(): readonly string[];
}>;

export type IdentityCommandRepositories = Readonly<{
  users: IdentityUsersRepository;
  roles: Readonly<{ getAuthorization(userId: string): AuthorizationLookup }>;
  sessions: Pick<SessionsRepository, "revokeActiveForUser">;
  audit: Pick<AuditRepository, "append">;
  outbox: Pick<OutboxRepository, "enqueue">;
  idempotency: IdempotencyRepository;
}>;

export type IdentityChangeInput = Readonly<{ status?: UserStatus; role?: Role }>;
export type TelegramApplicant = Readonly<{
  telegramUserId: string;
  firstName: string;
  lastName: string;
  username: string;
}>;
export type OnboardingAction = "approve" | "reject";
export type IdentityCommandResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403;
  body: JsonObject;
}>;

export type IdentityServiceOptions = Readonly<{
  processingTimeoutMs: number;
  idempotencyRetentionMs: number;
  outboxMaxAttempts: number;
  createId?: (kind: "audit" | "outbox") => string;
}>;

const statuses = new Set<UserStatus>(["pending", "active", "blocked", "rejected", "archived"]);
const roles = new Set<Role>(["seller", "admin", "super_admin"]);

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

function userJson(user: User): JsonObject {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    status: user.status,
    role: user.role,
    permissions: [...user.permissions]
  };
}

function authorization(context: CommandContext<IdentityCommandRepositories>) {
  if (context.actor.kind !== "user") return undefined;
  const lookup = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return lookup.outcome === "found" ? lookup.snapshot : undefined;
}

function created(result: Readonly<{ outcome: string }>, entity: string) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent identity transaction`);
}

export class IdentityQueryService {
  constructor(private readonly unitOfWork: UnitOfWork<IdentityCommandRepositories>) {}

  findById(userId: string): User | undefined {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.findById(userId)?.entity);
  }

  findByTelegramUserId(telegramUserId: string): User | undefined {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.findByTelegramUserId(telegramUserId)?.entity);
  }

  listForActor(actorId: string): readonly User[] {
    return this.unitOfWork.transaction(({ repositories }) => {
      const auth = repositories.roles.getAuthorization(actorId);
      if (auth.outcome !== "found" || !auth.snapshot.permissions.includes("users:manage")) return [];
      return repositories.users.list().map((record) => record.entity);
    });
  }

  listActive(): readonly User[] {
    return this.unitOfWork.transaction(({ repositories }) => repositories.users.list()
      .map((record) => record.entity)
      .filter((user) => user.status === "active"));
  }
}

export class IdentityService {
  private readonly createId: NonNullable<IdentityServiceOptions["createId"]>;

  constructor(
    private readonly executor: CommandExecutor<IdentityCommandRepositories>,
    private readonly options: IdentityServiceOptions
  ) {
    this.createId = options.createId ?? (() => nanoid());
  }

  update(metadata: CommandMetadata, targetUserId: string, input: IdentityChangeInput): IdentityCommandResult {
    return this.executor.execute(metadata, (context) => {
      const auth = authorization(context);
      if (!auth || !auth.permissions.includes("users:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      if (input.role !== undefined && !auth.permissions.includes("roles:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав для изменения роли") };
      }
      return executeIdempotently(context, "identity.user.update", {
        targetUserId,
        status: input.status ?? null,
        role: input.role ?? null
      }, this.idempotencyOptions(), () => this.applyChange(context, auth.userId, targetUserId, input, "update"));
    }, { transactionMode: "immediate" });
  }

  onboard(metadata: CommandMetadata, targetUserId: string, action: OnboardingAction, role?: Role): IdentityCommandResult {
    return this.executor.execute(metadata, (context) => {
      const auth = authorization(context);
      if (!auth || !auth.permissions.includes("users:manage")) {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      return executeIdempotently(context, "identity.onboarding", {
        targetUserId,
        action,
        role: role ?? null
      }, this.idempotencyOptions(), () => {
        if (action === "approve" && (!role || !roles.has(role) || role === "super_admin")) {
          return response(400, "BAD_ONBOARD_ROLE", "Некорректная роль onboarding");
        }
        if (action === "approve" && role === "admin" && !auth.permissions.includes("roles:manage")) {
          return response(403, "OWNER_REQUIRED", "Администратора назначает только super admin");
        }
        const target = context.transaction.repositories.users.findById(targetUserId);
        if (!target || target.entity.status !== "pending") {
          return response(404, "PENDING_USER_NOT_FOUND", "Пользователь не ожидает одобрения");
        }
        return this.applyChange(
          context,
          auth.userId,
          targetUserId,
          action === "approve" ? { status: "active", role } : { status: "rejected" },
          action
        );
      });
    }, { transactionMode: "immediate" });
  }

  registerTelegramApplicant(metadata: CommandMetadata, applicant: TelegramApplicant): IdentityCommandResult {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "system" || context.actor.authenticatedBy !== "telegram_webhook") {
        return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      }
      const telegramUserId = applicant.telegramUserId.trim();
      if (!/^\d{1,20}$/.test(telegramUserId)) {
        return { outcome: "rejected", ...response(403, "BAD_TELEGRAM_USER", "Некорректный Telegram user") };
      }
      return executeIdempotently(context, "identity.telegram.register", {
        telegramUserId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        username: applicant.username
      }, this.idempotencyOptions(), () => {
        const at = context.clock.now();
        const saved = context.transaction.repositories.users.createPendingTelegram({
          id: `tg-${telegramUserId}`,
          telegramUserId,
          firstName: applicant.firstName.trim().slice(0, 128),
          lastName: applicant.lastName.trim().slice(0, 128),
          username: applicant.username.trim().slice(0, 128)
        }, at);
        if (saved.created) {
          created(context.transaction.repositories.audit.append({
            id: this.createId("audit"),
            entity: "telegram_onboarding",
            entityId: saved.record.entity.id,
            action: "request",
            changes: { schemaVersion: 1, value: { telegramUserId, correlationId: context.correlationId } },
            requestId: context.requestId,
            createdAt: at
          }, { at, expectedRevision: null }), "onboarding request audit");
          for (const adminId of context.transaction.repositories.users.listActiveOnboardingReviewerIds()) {
            created(context.transaction.repositories.outbox.enqueue({
              id: this.createId("outbox"),
              channel: "telegram",
              userId: adminId,
              type: "telegram_onboarding_request",
              payload: { schemaVersion: 1, value: {
                schemaVersion: 1,
                text: `Новая заявка: ${`${saved.record.entity.firstName} ${saved.record.entity.lastName}`.trim() || saved.record.entity.id}`,
                userId: saved.record.entity.id,
                reply_markup: { inline_keyboard: [[
                  { text: "Одобрить продавца", callback_data: `onboard:approve:${saved.record.entity.id}:seller` },
                  { text: "Одобрить администратора", callback_data: `onboard:approve:${saved.record.entity.id}:admin` },
                  { text: "Отклонить", callback_data: `onboard:reject:${saved.record.entity.id}` }
                ]] },
                correlationId: context.correlationId
              } },
              status: "pending",
              attemptCount: 0,
              maxAttempts: this.options.outboxMaxAttempts,
              availableAt: at,
              createdAt: at,
              idempotencyKey: `identity:onboarding-request:${saved.record.entity.id}:${adminId}`
            }, { at, expectedRevision: null }), "onboarding request outbox");
          }
        }
        return { status: saved.created ? 201 : 200, body: { user: userJson(saved.record.entity), created: saved.created } };
      });
    }, { transactionMode: "immediate" });
  }

  private applyChange(
    context: CommandContext<IdentityCommandRepositories>,
    actorId: string,
    targetUserId: string,
    input: IdentityChangeInput,
    action: "update" | OnboardingAction
  ): IdempotentHttpResponse<JsonObject> {
    if (input.status !== undefined && !statuses.has(input.status)) return response(400, "BAD_USER_STATUS", "Некорректный статус пользователя");
    if (input.role !== undefined && !roles.has(input.role)) return response(400, "BAD_USER_ROLE", "Некорректная роль пользователя");
    if (input.status === undefined && input.role === undefined) return response(400, "EMPTY_USER_CHANGE", "Изменения не указаны");

    const repositories = context.transaction.repositories;
    let current = repositories.users.findById(targetUserId);
    if (!current) return response(404, "USER_NOT_FOUND", "Пользователь не найден");
    const beforeStatus = current.entity.status;
    const beforeRole = current.entity.role;
    const nextStatus = input.status ?? current.entity.status;
    const nextRole = input.role ?? current.entity.role;
    const statusChanged = nextStatus !== current.entity.status;
    const roleChanged = nextRole !== current.entity.role;

    if (actorId === targetUserId && statusChanged && nextStatus !== "active") {
      return response(409, "SELF_DEACTIVATION_FORBIDDEN", "Нельзя деактивировать собственную учётную запись");
    }
    if (actorId === targetUserId && roleChanged && current.entity.role === "super_admin" && nextRole !== "super_admin") {
      return response(409, "SELF_DEMOTION_FORBIDDEN", "Нельзя понизить собственную роль");
    }
    const removesActiveSuperAdmin = current.entity.status === "active" && current.entity.role === "super_admin"
      && (nextStatus !== "active" || nextRole !== "super_admin");
    if (removesActiveSuperAdmin && repositories.users.countActiveSuperAdmins() <= 1) {
      return response(409, "LAST_SUPER_ADMIN", "Нельзя удалить последнего активного super admin");
    }
    if (!statusChanged && !roleChanged) return { status: 200, body: { user: userJson(current.entity), unchanged: true } };

    const at = context.clock.now();
    if (statusChanged) {
      const saved = repositories.users.saveStatus(targetUserId, nextStatus, { at, expectedRevision: current.revision });
      if (saved.outcome !== "updated") throw new Error("Identity status conditional write failed inside immediate transaction");
      current = saved.record;
    }
    if (roleChanged) current = repositories.users.assignPrimaryRole(targetUserId, nextRole, { actorId, at });

    const revokedSessions = repositories.sessions.revokeActiveForUser(targetUserId, at);
    const changes: JsonObject = {
      action,
      before: { status: beforeStatus, role: beforeRole },
      status: nextStatus,
      role: nextRole,
      revokedSessions,
      correlationId: context.correlationId
    };
    created(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: action === "update" ? "user" : "telegram_onboarding",
      entityId: targetUserId,
      action,
      changes: { schemaVersion: 1, value: changes },
      requestId: context.requestId,
      createdAt: at
    }, { at, expectedRevision: null }), "identity audit");

    const text = action === "reject"
      ? "Заявка на доступ отклонена."
      : action === "approve"
        ? "Доступ одобрен. Откройте WebApp или используйте меню бота."
        : "Параметры доступа изменены. Выполните вход повторно.";
    const eventVersion = current.revision;
    created(repositories.outbox.enqueue({
      id: this.createId("outbox"),
      channel: "telegram",
      userId: targetUserId,
      type: action === "update" ? "identity_access_changed" : `telegram_onboarding_${action}`,
      payload: { schemaVersion: 1, value: { schemaVersion: 1, text, userId: targetUserId, status: nextStatus, role: nextRole, correlationId: context.correlationId } },
      status: "pending",
      attemptCount: 0,
      maxAttempts: this.options.outboxMaxAttempts,
      availableAt: at,
      createdAt: at,
      idempotencyKey: `identity:${targetUserId}:${action}:${eventVersion}`
    }, { at, expectedRevision: null }), "identity outbox");

    const final = repositories.users.findById(targetUserId);
    if (!final) throw new Error("Identity user disappeared inside transaction");
    return { status: 200, body: { user: userJson(final.entity), revokedSessions } };
  }

  private idempotencyOptions() {
    return { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs };
  }
}
