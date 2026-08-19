import type { Permission, Role, User } from "../shared/types";
import type { DatabaseContext, SqlValue } from "./database";
import type { IdentityCommandRepositories } from "./identity-service";
import { rolePermissionMapper, userMapper, userRoleMapper } from "./mappers/identity";
import {
  auditEntryFromRow,
  auditEntryToRow,
  outboxMessageFromRow,
  outboxMessageToRow
} from "./mappers/workflows";
import type {
  CreateOptions,
  RepositoryAuditEntry,
  RepositoryOutboxMessage,
  RepositoryRecord
} from "./repositories";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";

type Row = Readonly<Record<string, unknown>>;

function first<T extends Row>(database: DatabaseContext, sql: string, parameters: readonly SqlValue[]): T | undefined {
  return database.query<T>(sql, parameters)[0];
}

function values(row: Record<string, SqlValue>, columns: readonly string[]): SqlValue[] {
  return columns.map((column) => row[column]);
}

function revisionNumber(revision: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(revision)) return undefined;
  const value = Number(revision);
  return Number.isSafeInteger(value) ? value : undefined;
}

function assertCreateOptions(options: CreateOptions): void {
  if (options.expectedRevision !== null) throw new TypeError("Create options must use expectedRevision: null");
}

function permissionsForRole(database: DatabaseContext, role: Role): Permission[] {
  return database.query<Row>(
    "SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
    [role]
  ).map((row) => rolePermissionMapper.fromRow(row).permission);
}

function userRecordFromRow(database: DatabaseContext, row: Row): RepositoryRecord<User> | undefined {
  const mapped = userMapper.fromRow(row);
  const assignments = database.query<Row>(
    "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
    [mapped.id]
  ).map((assignment) => userRoleMapper.fromRow(assignment));
  if (assignments.length !== 1 || !assignments[0]) return undefined;

  const role = assignments[0].role;
  return {
    entity: {
      id: mapped.id,
      telegramUserId: mapped.telegramUserId ?? "",
      firstName: mapped.firstName,
      lastName: mapped.lastName,
      username: mapped.username,
      status: mapped.status,
      role,
      permissions: permissionsForRole(database, role)
    },
    revision: mapped.revision
  };
}

function userRecord(database: DatabaseContext, field: "id" | "telegram_user_id", value: string): RepositoryRecord<User> | undefined {
  const row = first<Row>(database, `SELECT * FROM users WHERE ${field} = ?`, [value]);
  return row ? userRecordFromRow(database, row) : undefined;
}

function auditRecord(database: DatabaseContext, entryId: string): RepositoryRecord<RepositoryAuditEntry> | undefined {
  const row = first<Row>(database, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return undefined;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}

function outboxRecord(
  database: DatabaseContext,
  messageId: string,
  channel?: string,
  idempotencyKey?: string
): RepositoryRecord<RepositoryOutboxMessage> | undefined {
  const row = first<Row>(
    database,
    channel && idempotencyKey
      ? "SELECT * FROM outbox_messages WHERE id = ? OR (channel = ? AND idempotency_key = ?) ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1"
      : "SELECT * FROM outbox_messages WHERE id = ?",
    channel && idempotencyKey ? [messageId, channel, idempotencyKey, messageId] : [messageId]
  );
  if (!row) return undefined;
  const mapped = outboxMessageFromRow(row);
  const { updatedAt: _updatedAt, lastErrorCode: _lastErrorCode, ...message } = mapped.entity;
  return { entity: message, revision: mapped.revision };
}

function createUsersRepository(database: DatabaseContext): IdentityCommandRepositories["users"] {
  return {
    findById: (userId) => userRecord(database, "id", userId),
    findByTelegramUserId: (telegramUserId) => userRecord(database, "telegram_user_id", telegramUserId),

    list() {
      return database.query<Row>("SELECT * FROM users ORDER BY id", [])
        .flatMap((row) => {
          const record = userRecordFromRow(database, row);
          return record ? [record] : [];
        });
    },

    createPendingTelegram(profile, at) {
      const existing = userRecord(database, "telegram_user_id", profile.telegramUserId);
      if (existing) return { created: false, record: existing };
      const inserted = database.execute(
        `INSERT INTO users(id, telegram_user_id, first_name, last_name, username, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0) ON CONFLICT DO NOTHING`,
        [profile.id, profile.telegramUserId, profile.firstName, profile.lastName, profile.username, at, at]
      );
      if (inserted.changes === 1) {
        database.execute(
          "INSERT INTO user_roles(user_id, role_id, assigned_by_user_id, assigned_at) VALUES (?, 'seller', NULL, ?)",
          [profile.id, at]
        );
      }
      const current = userRecord(database, "telegram_user_id", profile.telegramUserId);
      if (!current) throw new Error("telegram applicant insert did not create or find a user");
      return { created: inserted.changes === 1, record: current };
    },

    saveStatus(userId, status, options) {
      const expected = revisionNumber(options.expectedRevision);
      if (expected === undefined || !Number.isSafeInteger(expected + 1)) {
        const current = userRecord(database, "id", userId);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }

      const result = database.execute(
        `UPDATE users
         SET status = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE NULL END,
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
        [status, status, options.at, options.at, userId, expected]
      );
      const current = userRecord(database, "id", userId);
      if (result.changes === 1) {
        if (!current) throw new Error("identity status update lost its user or primary role");
        return { outcome: "updated", record: current };
      }
      return current ? { outcome: "stale", current } : { outcome: "missing" };
    },

    assignPrimaryRole(userId, role, input) {
      const rawUser = first<Row>(database, "SELECT id FROM users WHERE id = ?", [userId]);
      if (!rawUser) throw new Error("Cannot assign a role to a missing user");
      const rawRole = first<Row>(database, "SELECT id FROM roles WHERE id = ?", [role]);
      if (!rawRole) throw new Error("Cannot assign a missing role");

      database.execute("DELETE FROM user_roles WHERE user_id = ?", [userId]);
      const assignment = userRoleMapper.toRow({
        userId,
        role,
        assignedByUserId: input.actorId,
        assignedAt: input.at
      });
      database.execute(
        "INSERT INTO user_roles(user_id, role_id, assigned_by_user_id, assigned_at) VALUES (?, ?, ?, ?)",
        [assignment.user_id, assignment.role_id, assignment.assigned_by_user_id, assignment.assigned_at]
      );
      const updated = database.execute(
        "UPDATE users SET version = version + 1, updated_at = ? WHERE id = ?",
        [input.at, userId]
      );
      if (updated.changes !== 1) throw new Error("identity role update lost its user");

      const current = userRecord(database, "id", userId);
      if (!current) throw new Error("identity role update did not produce one primary role");
      return current;
    },

    countActiveSuperAdmins() {
      const row = first<{ count: number }>(
        database,
        `SELECT COUNT(*) AS count
         FROM users u
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id = u.id) = 1
           AND EXISTS (
             SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = 'super_admin'
           )`,
        []
      );
      return row?.count ?? 0;
    },

    listActiveOnboardingReviewerIds() {
      return database.query<{ id: string }>(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id IN ('admin','super_admin')
         WHERE u.status = 'active'
           AND (SELECT COUNT(*) FROM user_roles exact_role WHERE exact_role.user_id = u.id) = 1
         ORDER BY u.id`,
        []
      ).map((row) => row.id);
    }
  };
}

function createRolesRepository(database: DatabaseContext): IdentityCommandRepositories["roles"] {
  return {
    getAuthorization(userId) {
      const rawUser = first<Row>(database, "SELECT * FROM users WHERE id = ?", [userId]);
      if (!rawUser) return { outcome: "missing" };
      const user = userMapper.fromRow(rawUser);
      if (user.status !== "active") return { outcome: "missing" };

      const assignedRoles = database.query<Row>(
        "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
        [userId]
      ).map((row) => userRoleMapper.fromRow(row).role);
      const distinctRoles = [...new Set(assignedRoles)];
      if (distinctRoles.length === 0) return { outcome: "missing" };
      if (distinctRoles.length > 1) return { outcome: "ambiguous", roles: distinctRoles };

      const role = distinctRoles[0];
      if (!role) return { outcome: "missing" };
      return {
        outcome: "found",
        snapshot: { userId, role, permissions: permissionsForRole(database, role), revision: user.revision }
      };
    }
  };
}

function createSessionsRepository(database: DatabaseContext): IdentityCommandRepositories["sessions"] {
  return {
    revokeActiveForUser(userId, revokedAt) {
      return database.execute(
        `UPDATE sessions
         SET revoked_at = ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
        [revokedAt, revokedAt, userId]
      ).changes;
    }
  };
}

function createAuditRepository(database: DatabaseContext): IdentityCommandRepositories["audit"] {
  return {
    append(entry, options) {
      assertCreateOptions(options);
      const mapped = auditEntryToRow({ entity: { ...entry, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id", "actor_id", "entity_type", "entity_id", "action", "changes_json",
        "request_id", "created_at", "version", "updated_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO audit_entries(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = auditRecord(database, entry.id);
      if (!current) throw new Error("audit insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

function createOutboxRepository(database: DatabaseContext): IdentityCommandRepositories["outbox"] {
  return {
    enqueue(message, options) {
      assertCreateOptions(options);
      const mapped = outboxMessageToRow({ entity: { ...message, updatedAt: options.at }, revision: "0" });
      const columns = [
        "id", "channel", "recipient_user_id", "type", "payload_json", "status", "idempotency_key",
        "attempt_count", "max_attempts", "available_at", "last_error", "last_error_code", "lease_owner",
        "lease_token", "lease_expires_at", "failed_at", "sent_at", "created_at", "version", "updated_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO outbox_messages(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = outboxRecord(database, message.id, message.channel, message.idempotencyKey);
      if (!current) throw new Error("outbox insert did not create or find a row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    }
  };
}

function createIdentityOutboxRepository(database: DatabaseContext): IdentityCommandRepositories["identityOutbox"] {
  return {
    enqueue(event) {
      const result = database.execute(
        `INSERT INTO staff_identity_outbox(event_id,user_id,status,identity_revision,correlation_id,occurred_at,state,available_at,created_at)
         VALUES (?,?,?,?,?,?,'pending',?,?) ON CONFLICT(user_id,identity_revision) DO NOTHING`,
        [event.eventId, event.userId, event.status, event.identityRevision, event.correlationId, event.occurredAt, event.occurredAt, event.occurredAt]
      );
      return { outcome: result.changes === 1 ? "created" : "duplicate" };
    }
  };
}

export function createSqliteIdentityCommandRepositories(database: DatabaseContext): IdentityCommandRepositories {
  return Object.freeze({
    users: createUsersRepository(database),
    roles: createRolesRepository(database),
    sessions: createSessionsRepository(database),
    audit: createAuditRepository(database),
    outbox: createOutboxRepository(database),
    identityOutbox: createIdentityOutboxRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}
