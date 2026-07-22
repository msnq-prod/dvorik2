import { createHmac, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import type { AuthSession, User } from "../shared/types";
import type {
  AuditRepository,
  RepositorySession,
  SessionsRepository,
  UtcTimestamp
} from "./repositories";
import { UnitOfWork } from "./unit-of-work";

export type SessionPrincipalsRepository = Readonly<{
  findActive(userId: string): User | undefined;
  findActiveByTelegramUserId(telegramUserId: string): User | undefined;
}>;

export type SessionCommandRepositories = Readonly<{
  sessions: Pick<SessionsRepository,
    "findUsableByCredential" | "create" | "revoke" | "revokeActiveForUser">;
  principals: SessionPrincipalsRepository;
  audit: Pick<AuditRepository, "append">;
}>;

export type SessionServiceOptions = Readonly<{
  secret: string;
  maxAgeMs: number;
  createToken?: () => string;
  createId?: (kind: "session" | "audit") => string;
}>;

export type CreatedSession = Readonly<{
  token: string;
  sessionId: string;
  expiresAt: UtcTimestamp;
  user: User;
}>;

export type AuthenticatedSession = Readonly<{
  sessionId: string;
  user: User;
}>;

export class SessionServiceError extends Error {
  constructor(public readonly code: "USER_NOT_ACTIVE" | "BAD_TOKEN_GENERATOR" | "SESSION_CREATE_FAILED") {
    super(`Session service failed: ${code}`);
    this.name = "SessionServiceError";
  }
}

const rawTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function addMilliseconds(at: string, milliseconds: number) {
  const parsed = new Date(at);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== at) {
    throw new RangeError("Session time contract is invalid");
  }
  return new Date(parsed.getTime() + milliseconds).toISOString();
}

export class SessionService {
  private readonly createToken: NonNullable<SessionServiceOptions["createToken"]>;
  private readonly createId: NonNullable<SessionServiceOptions["createId"]>;

  constructor(
    private readonly unitOfWork: UnitOfWork<SessionCommandRepositories>,
    private readonly clock: Readonly<{ now(): UtcTimestamp }>,
    private readonly options: SessionServiceOptions
  ) {
    if (Buffer.byteLength(options.secret, "utf8") < 32) throw new RangeError("Session secret must be at least 32 bytes");
    if (!Number.isSafeInteger(options.maxAgeMs) || options.maxAgeMs < 1) throw new RangeError("Session max age must be positive");
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
    this.createId = options.createId ?? (() => nanoid());
  }

  create(userId: string, method: AuthSession["method"]): CreatedSession {
    return this.createResolved(method, (repositories) => repositories.principals.findActive(userId));
  }

  createForTelegram(telegramUserId: string): CreatedSession {
    return this.createResolved("telegram", (repositories) => repositories.principals.findActiveByTelegramUserId(telegramUserId));
  }

  findActiveTelegramPrincipal(telegramUserId: string): User | undefined {
    return this.unitOfWork.transaction(({ repositories }) => repositories.principals.findActiveByTelegramUserId(telegramUserId));
  }

  private createResolved(
    method: AuthSession["method"],
    resolveUser: (repositories: SessionCommandRepositories) => User | undefined
  ): CreatedSession {
    const token = this.createToken();
    if (!rawTokenPattern.test(token)) throw new SessionServiceError("BAD_TOKEN_GENERATOR");
    const result = this.unitOfWork.transaction(({ repositories }) => {
      const user = resolveUser(repositories);
      if (!user) return { outcome: "inactive" } as const;
      const userId = user.id;
      const at = this.clock.now();
      const sessionId = this.createId("session");
      const expiresAt = addMilliseconds(at, this.options.maxAgeMs);
      const revoked = repositories.sessions.revokeActiveForUser(userId, at);
      const session: RepositorySession = {
        id: sessionId,
        userId,
        method,
        expiresAt,
        createdAt: at,
        tokenHash: this.hash(token),
        metadata: {
          schemaVersion: 1,
          value: { credentialVersion: 1, hashAlgorithm: "hmac-sha256" }
        }
      };
      const created = repositories.sessions.create(session, { at, expectedRevision: null });
      if (created.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      const audit = repositories.audit.append({
        id: this.createId("audit"),
        actorId: userId,
        entity: "session",
        entityId: sessionId,
        action: "rotate",
        changes: {
          schemaVersion: 1,
          value: { method, expiresAt, revokedSessionCount: revoked }
        },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return { outcome: "created", token, sessionId, expiresAt, user } as const;
    }, { mode: "immediate" });
    if (result.outcome === "inactive") throw new SessionServiceError("USER_NOT_ACTIVE");
    const { outcome: _outcome, ...created } = result;
    return created;
  }

  authenticate(token: string | undefined): AuthenticatedSession | undefined {
    const tokenHash = this.hashCredential(token);
    if (!tokenHash) return undefined;
    return this.unitOfWork.transaction(({ repositories }) => {
      const record = repositories.sessions.findUsableByCredential(tokenHash, this.clock.now());
      if (!record) return undefined;
      const user = repositories.principals.findActive(record.entity.userId);
      return user ? { sessionId: record.entity.id, user } : undefined;
    });
  }

  logout(token: string | undefined): boolean {
    const tokenHash = this.hashCredential(token);
    if (!tokenHash) return false;
    return this.unitOfWork.transaction(({ repositories }) => {
      const at = this.clock.now();
      const current = repositories.sessions.findUsableByCredential(tokenHash, at);
      if (!current) return false;
      const revoked = repositories.sessions.revoke(current.entity.id, { at, expectedRevision: current.revision });
      if (revoked.outcome !== "updated") throw new SessionServiceError("SESSION_CREATE_FAILED");
      const audit = repositories.audit.append({
        id: this.createId("audit"),
        actorId: current.entity.userId,
        entity: "session",
        entityId: current.entity.id,
        action: "logout",
        changes: { schemaVersion: 1, value: { revokedAt: at } },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return true;
    }, { mode: "immediate" });
  }

  revokeUser(userId: string, actorId: string, reason: string): number {
    return this.unitOfWork.transaction(({ repositories }) => {
      const at = this.clock.now();
      const revoked = repositories.sessions.revokeActiveForUser(userId, at);
      if (revoked === 0) return 0;
      const audit = repositories.audit.append({
        id: this.createId("audit"),
        actorId,
        entity: "session",
        entityId: userId,
        action: "revoke_user_sessions",
        changes: { schemaVersion: 1, value: { reason, revokedSessionCount: revoked } },
        createdAt: at
      }, { at, expectedRevision: null });
      if (audit.outcome !== "created") throw new SessionServiceError("SESSION_CREATE_FAILED");
      return revoked;
    }, { mode: "immediate" });
  }

  private hashCredential(token: string | undefined) {
    return typeof token === "string" && rawTokenPattern.test(token) ? this.hash(token) : undefined;
  }

  private hash(token: string) {
    return `hmac-sha256:${createHmac("sha256", this.options.secret).update(token, "utf8").digest("hex")}`;
  }
}
