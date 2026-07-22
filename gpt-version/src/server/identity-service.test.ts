import assert from "node:assert/strict";
import type { Permission, Role, User, UserStatus } from "../shared/types";
import { CommandExecutor, type CommandActorResolver, type CommandMetadata } from "./command-context";
import type { DatabaseAdapter, DatabaseContext } from "./database";
import { IdentityQueryService, IdentityService, type IdentityCommandRepositories } from "./identity-service";
import type {
  AuthorizationSnapshot,
  IdempotencyClaim,
  IdempotencyRecord,
  IdempotencyRepository,
  IdempotencyTerminal,
  RepositoryAuditEntry,
  RepositoryOutboxMessage,
  RepositoryRecord,
  UtcTimestamp
} from "./repositories";
import { UnitOfWork } from "./unit-of-work";

type IdentityRow = Omit<User, "role" | "permissions">;
type VersionedIdentity = Readonly<{ entity: IdentityRow; version: number }>;
type FakeState = {
  users: Map<string, VersionedIdentity>;
  userRoles: Map<string, Role>;
  rolePermissions: Map<Role, Permission[]>;
  activeSessions: Map<string, number>;
  audits: Map<string, RepositoryRecord<RepositoryAuditEntry>>;
  outbox: Map<string, RepositoryRecord<RepositoryOutboxMessage>>;
  idempotency: Map<string, RepositoryRecord<IdempotencyRecord>>;
};

const at = "2026-07-12T06:00:00.000Z";
const superPermissions: Permission[] = ["users:manage", "roles:manage"];
const adminPermissions: Permission[] = ["users:manage"];

function identity(id: string, status: UserStatus, role: Role): Readonly<{ row: VersionedIdentity; role: Role }> {
  return {
    row: {
      entity: {
        id,
        telegramUserId: `tg-${id}`,
        firstName: id,
        lastName: "Test",
        username: id,
        status
      },
      version: 0
    },
    role
  };
}

function initialState(): FakeState {
  const definitions = [
    identity("u-super", "active", "super_admin"),
    identity("u-admin", "active", "admin"),
    identity("u-seller", "active", "seller"),
    identity("u-target", "active", "seller"),
    identity("u-pending", "pending", "seller")
  ];
  return {
    users: new Map(definitions.map(({ row }) => [row.entity.id, row])),
    userRoles: new Map(definitions.map(({ row, role }) => [row.entity.id, role])),
    rolePermissions: new Map<Role, Permission[]>([
      ["super_admin", superPermissions],
      ["admin", adminPermissions],
      ["seller", []]
    ]),
    activeSessions: new Map([["u-super", 1], ["u-admin", 1], ["u-seller", 1], ["u-target", 2], ["u-pending", 1]]),
    audits: new Map(),
    outbox: new Map(),
    idempotency: new Map()
  };
}

class FakeDatabase implements DatabaseAdapter {
  state: FakeState;
  transactionState?: FakeState;

  constructor(state = initialState()) {
    this.state = state;
  }

  query<T extends object>(): T[] { return []; }
  execute() { return { changes: 0, lastInsertRowid: 0 }; }
  executeScript() { /* not used by focused service tests */ }
  close() { /* not used by focused service tests */ }

  transaction<T>(run: (database: DatabaseContext) => T): T {
    if (this.transactionState) throw new Error("nested fake transaction");
    const working = structuredClone(this.state) as FakeState;
    this.transactionState = working;
    try {
      const result = run(this);
      this.state = working;
      return result;
    } finally {
      this.transactionState = undefined;
    }
  }
}

function idempotencyKey(scope: string, key: string) {
  return `${scope}\u0000${key}`;
}

function fakeIdempotency(state: FakeState): IdempotencyRepository {
  function terminal(record: IdempotencyTerminal, expectedRevision: string) {
    const key = idempotencyKey(record.scope, record.key);
    const current = state.idempotency.get(key);
    if (!current) return { outcome: "missing" } as const;
    if (current.revision !== expectedRevision) return { outcome: "stale", current } as const;
    const updated = { entity: record, revision: String(Number(current.revision) + 1) };
    state.idempotency.set(key, updated);
    return { outcome: "updated", record: updated } as const;
  }

  return {
    find(scope, key) { return state.idempotency.get(idempotencyKey(scope, key)); },
    reserve(claim: IdempotencyClaim, now: UtcTimestamp) {
      const key = idempotencyKey(claim.scope, claim.key);
      const current = state.idempotency.get(key);
      if (current) {
        if (current.entity.requestHash !== claim.requestHash) return { outcome: "conflict", record: current };
        if (current.entity.status !== "processing") return { outcome: "replay", record: current };
        if (current.entity.expiresAt && current.entity.expiresAt <= now) {
          const recovered: RepositoryRecord<IdempotencyRecord> = {
            entity: { ...current.entity, createdAt: claim.createdAt, expiresAt: claim.claimExpiresAt },
            revision: String(Number(current.revision) + 1)
          };
          state.idempotency.set(key, recovered);
          return { outcome: "reserved", record: recovered };
        }
        return { outcome: "in_progress", record: current };
      }
      const created: RepositoryRecord<IdempotencyRecord> = {
        entity: {
          scope: claim.scope,
          key: claim.key,
          requestHash: claim.requestHash,
          status: "processing",
          createdAt: claim.createdAt,
          expiresAt: claim.claimExpiresAt
        },
        revision: "0"
      };
      state.idempotency.set(key, created);
      return { outcome: "reserved", record: created };
    },
    complete(record, options) { return terminal(record, options.expectedRevision); },
    fail(record, options) { return terminal(record, options.expectedRevision); },
    deleteExpired() { return 0; }
  };
}

type FaultStage = "audit" | "outbox" | "idempotency_completion";

function repositories(state: FakeState, fault?: FaultStage): IdentityCommandRepositories {
  function record(userId: string): RepositoryRecord<User> | undefined {
    const stored = state.users.get(userId);
    const role = state.userRoles.get(userId);
    if (!stored || !role) return undefined;
    return {
      entity: { ...stored.entity, role, permissions: [...(state.rolePermissions.get(role) ?? [])] },
      revision: String(stored.version)
    };
  }

  const idempotency = fakeIdempotency(state);
  return {
    users: {
      findById: record,
      findByTelegramUserId(telegramUserId) {
        const match = [...state.users.values()].find(({ entity }) => entity.telegramUserId === telegramUserId);
        return match ? record(match.entity.id) : undefined;
      },
      list() { return [...state.users.keys()].map(record).filter((value): value is RepositoryRecord<User> => Boolean(value)); },
      createPendingTelegram(profile) {
        const existing = [...state.users.values()].find(({ entity }) => entity.telegramUserId === profile.telegramUserId);
        if (existing) return { created: false, record: record(existing.entity.id)! };
        const user: User = { ...profile, status: "pending", role: "seller", permissions: [] };
        state.users.set(profile.id, { entity: user, version: 0 });
        state.userRoles.set(profile.id, "seller");
        return { created: true, record: record(profile.id)! };
      },
      saveStatus(userId, status, options) {
        const stored = state.users.get(userId);
        if (!stored) return { outcome: "missing" };
        const current = record(userId)!;
        if (current.revision !== options.expectedRevision) return { outcome: "stale", current };
        if (stored.entity.status === status) return { outcome: "unchanged", record: current };
        state.users.set(userId, { entity: { ...stored.entity, status }, version: stored.version + 1 });
        return { outcome: "updated", record: record(userId)! };
      },
      assignPrimaryRole(userId, role) {
        const stored = state.users.get(userId);
        if (!stored) throw new Error("missing fake user");
        state.userRoles.set(userId, role);
        state.users.set(userId, { ...stored, version: stored.version + 1 });
        return record(userId)!;
      },
      countActiveSuperAdmins() {
        return [...state.users.values()].filter(({ entity }) => entity.status === "active" && state.userRoles.get(entity.id) === "super_admin").length;
      },
      listActiveOnboardingReviewerIds() {
        return [...state.users.values()]
          .filter(({ entity }) => entity.status === "active" && ["admin", "super_admin"].includes(state.userRoles.get(entity.id) || ""))
          .map(({ entity }) => entity.id);
      }
    },
    roles: {
      getAuthorization(userId) {
        const user = record(userId);
        if (!user || user.entity.status !== "active") return { outcome: "missing" };
        const snapshot: AuthorizationSnapshot = {
          userId,
          role: user.entity.role,
          permissions: user.entity.permissions,
          revision: user.revision
        };
        return { outcome: "found", snapshot };
      }
    },
    sessions: {
      revokeActiveForUser(userId) {
        const count = state.activeSessions.get(userId) ?? 0;
        state.activeSessions.set(userId, 0);
        return count;
      }
    },
    audit: {
      append(entry) {
        if (state.audits.has(entry.id)) return { outcome: "duplicate", current: state.audits.get(entry.id)! };
        const created = { entity: entry, revision: "0" };
        state.audits.set(entry.id, created);
        if (fault === "audit") throw new Error("audit fault");
        return { outcome: "created", record: created };
      }
    },
    outbox: {
      enqueue(message) {
        if (state.outbox.has(message.id)) return { outcome: "duplicate", current: state.outbox.get(message.id)! };
        const created = { entity: message, revision: "0" };
        state.outbox.set(message.id, created);
        if (fault === "outbox") throw new Error("outbox fault");
        return { outcome: "created", record: created };
      }
    },
    idempotency: fault === "idempotency_completion" ? {
      ...idempotency,
      find: idempotency.find.bind(idempotency),
      reserve: idempotency.reserve.bind(idempotency),
      complete(record) { return { outcome: "stale", current: idempotency.find(record.scope, record.key)! }; },
      fail: idempotency.fail.bind(idempotency),
      deleteExpired: idempotency.deleteExpired.bind(idempotency)
    } : idempotency
  };
}

const actorReferences = {
  super: Object.freeze({ session: "super" }),
  admin: Object.freeze({ session: "admin" }),
  seller: Object.freeze({ session: "seller" })
};
const actorResolver: CommandActorResolver = {
  resolve(reference, channel) {
    if (channel !== "web") throw new Error("bad channel");
    const userId = reference === actorReferences.super ? "u-super"
      : reference === actorReferences.admin ? "u-admin"
        : reference === actorReferences.seller ? "u-seller" : undefined;
    if (!userId) throw new Error("untrusted actor");
    return { kind: "user", userId, authenticatedBy: "web_session" };
  }
};

let id = 0;
function fixture(fault?: FaultStage) {
  const database = new FakeDatabase();
  const unitOfWork = new UnitOfWork(database, () => repositories(database.transactionState!, fault));
  const executor = new CommandExecutor(unitOfWork, { now: () => at }, actorResolver);
  const service = new IdentityService(executor, {
    processingTimeoutMs: 60_000,
    idempotencyRetentionMs: 86_400_000,
    outboxMaxAttempts: 8,
    createId: (kind) => `identity-${kind}-${++id}`
  });
  return { database, service, query: new IdentityQueryService(unitOfWork) };
}

function metadata(key: string, actorReference: unknown = actorReferences.super): CommandMetadata {
  return { actorReference, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}

function code(result: unknown) {
  return (result as { body?: { code?: string } }).body?.code;
}

{
  const { database, service } = fixture();
  assert.deepEqual(service.update(metadata("permission", actorReferences.seller), "u-target", { status: "blocked" }), {
    outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" }
  });
  assert.equal(database.state.users.get("u-target")!.entity.status, "active");
  assert.equal(database.state.idempotency.size, 0);
}

{
  const { database, service } = fixture();
  database.state.rolePermissions.set("admin", ["users:manage"]);
  const result = service.update(metadata("role-permission", actorReferences.admin), "u-target", { role: "admin" });
  assert.equal(result.status, 403);
  assert.equal(code(result), "FORBIDDEN");
  assert.equal(database.state.userRoles.get("u-target"), "seller");
  assert.equal(database.state.idempotency.size, 0);
}

{
  const { database, service, query } = fixture();
  const result = service.update(metadata("derived-permissions"), "u-target", { role: "admin" });
  assert.equal(result.status, 200);
  assert.deepEqual(query.findById("u-target")?.permissions, adminPermissions);
  database.state.rolePermissions.set("admin", ["users:manage"]);
  assert.deepEqual(query.findById("u-target")?.permissions, ["users:manage"]);
  assert.equal(database.state.activeSessions.get("u-target"), 0);
  assert.equal(database.state.audits.size, 1);
  assert.equal(database.state.outbox.size, 1);
}

{
  const { database, service } = fixture();
  const result = service.update(metadata("self-deactivate"), "u-super", { status: "blocked" });
  assert.equal(result.status, 409);
  assert.equal(code(result), "SELF_DEACTIVATION_FORBIDDEN");
  assert.equal(database.state.users.get("u-super")!.entity.status, "active");
  assert.equal(database.state.audits.size, 0);
}

{
  const { database, service } = fixture();
  const result = service.update(metadata("self-demote"), "u-super", { role: "admin" });
  assert.equal(result.status, 409);
  assert.equal(code(result), "SELF_DEMOTION_FORBIDDEN");
  assert.equal(database.state.userRoles.get("u-super"), "super_admin");
  assert.equal(database.state.outbox.size, 0);
}

{
  const { database, service } = fixture();
  const result = service.update(metadata("last-super", actorReferences.admin), "u-super", { status: "blocked" });
  assert.equal(result.status, 409);
  assert.equal(code(result), "LAST_SUPER_ADMIN");
  assert.equal(database.state.users.get("u-super")!.entity.status, "active");
  assert.equal(database.state.activeSessions.get("u-super"), 1);
}

{
  const { database, service } = fixture();
  const first = service.onboard(metadata("onboard-replay"), "u-pending", "approve", "seller");
  assert.equal(first.outcome, "executed");
  assert.equal(first.status, 200);
  assert.equal(database.state.users.get("u-pending")!.entity.status, "active");
  assert.equal(database.state.userRoles.get("u-pending"), "seller");
  assert.deepEqual(service.onboard(metadata("onboard-replay"), "u-pending", "approve", "seller"), { ...first, outcome: "replayed" });
  assert.equal(database.state.audits.size, 1);
  assert.equal(database.state.outbox.size, 1);
  assert.deepEqual(service.onboard(metadata("onboard-replay"), "u-pending", "approve", "admin"), {
    outcome: "conflict", status: 409, code: "IDEMPOTENCY_CONFLICT"
  });
}

{
  const { database, service } = fixture();
  const rejected = service.onboard(metadata("onboard-reject"), "u-pending", "reject");
  assert.equal(rejected.status, 200);
  assert.equal(database.state.users.get("u-pending")!.entity.status, "rejected");
  assert.equal(database.state.activeSessions.get("u-pending"), 0);
}

{
  const { database, service } = fixture();
  const approved = service.onboard(metadata("admin-approve-seller", actorReferences.admin), "u-pending", "approve", "seller");
  assert.equal(approved.status, 200);
  assert.equal(database.state.users.get("u-pending")!.entity.status, "active");
}

{
  const { database, service } = fixture();
  const denied = service.onboard(metadata("admin-approve-admin", actorReferences.admin), "u-pending", "approve", "admin");
  assert.equal(denied.status, 403);
  assert.equal(code(denied), "OWNER_REQUIRED");
  assert.equal(database.state.users.get("u-pending")!.entity.status, "pending");
}

{
  const { database, service } = fixture();
  assert.equal(service.onboard(metadata("admin-reject", actorReferences.admin), "u-pending", "reject").status, 200);
  assert.equal(database.state.users.get("u-pending")!.entity.status, "rejected");
}

for (const fault of ["audit", "outbox", "idempotency_completion"] as const) {
  const { database, service } = fixture(fault);
  const before = structuredClone(database.state) as FakeState;
  assert.throws(() => service.update(metadata(`fault-${fault}`), "u-target", { status: "blocked" }));
  assert.deepEqual(database.state.users, before.users);
  assert.deepEqual(database.state.userRoles, before.userRoles);
  assert.deepEqual(database.state.activeSessions, before.activeSessions);
  assert.deepEqual(database.state.audits, before.audits);
  assert.deepEqual(database.state.outbox, before.outbox);
  assert.deepEqual(database.state.idempotency, before.idempotency);
}

console.log("identity service tests passed");
