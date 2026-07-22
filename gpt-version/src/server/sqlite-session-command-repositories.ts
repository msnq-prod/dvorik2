import type { Permission, User } from "../shared/types";
import type { DatabaseContext, SqlValue } from "./database";
import {
  permissionMapper,
  roleMapper,
  rolePermissionMapper,
  sessionMapper,
  userMapper,
  userRoleMapper
} from "./mappers/identity";
import { auditEntryFromRow, auditEntryToRow } from "./mappers/workflows";
import type {
  CreateOptions,
  RepositoryAuditEntry,
  RepositoryRecord,
  RepositorySession,
  UpdateOptions,
  UpdateResult
} from "./repositories";
import type { SessionCommandRepositories } from "./session-service";

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

function sessionRecordFromRow(row: Row): RepositoryRecord<RepositorySession> {
  const mapped = sessionMapper.fromRow(row);
  if (!mapped.tokenHash) throw new TypeError(`Session ${mapped.id} has no token hash`);
  const { version: _version, updatedAt: _updatedAt, revision, ...session } = mapped;
  return { entity: { ...session, tokenHash: mapped.tokenHash }, revision };
}

function sessionRecord(database: DatabaseContext, sessionId: string): RepositoryRecord<RepositorySession> | undefined {
  const row = first<Row>(database, "SELECT * FROM sessions WHERE id = ?", [sessionId]);
  return row ? sessionRecordFromRow(row) : undefined;
}

function conflictingSessionRecord(
  database: DatabaseContext,
  sessionId: string,
  tokenHash: string
): RepositoryRecord<RepositorySession> | undefined {
  const row = first<Row>(
    database,
    "SELECT * FROM sessions WHERE id = ? OR token_hash = ? ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1",
    [sessionId, tokenHash, sessionId]
  );
  return row ? sessionRecordFromRow(row) : undefined;
}

function auditRecord(database: DatabaseContext, entryId: string): RepositoryRecord<RepositoryAuditEntry> | undefined {
  const row = first<Row>(database, "SELECT * FROM audit_entries WHERE id = ?", [entryId]);
  if (!row) return undefined;
  const mapped = auditEntryFromRow(row);
  const { updatedAt: _updatedAt, ...entry } = mapped.entity;
  return { entity: entry, revision: mapped.revision };
}

function createSessionsRepository(database: DatabaseContext): SessionCommandRepositories["sessions"] {
  return {
    findUsableByCredential(tokenHash, at) {
      const row = first<Row>(
        database,
        "SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1",
        [tokenHash, at]
      );
      return row ? sessionRecordFromRow(row) : undefined;
    },

    create(session, options) {
      assertCreateOptions(options);
      if (!session.tokenHash) throw new TypeError("A session token hash is required");
      const mapped = sessionMapper.toRow({
        ...session,
        version: 0,
        updatedAt: options.at,
        revision: "0"
      });
      const columns = [
        "id", "user_id", "method", "expires_at", "revoked_at", "created_at",
        "metadata_json", "token_hash", "version", "updated_at"
      ] as const;
      const result = database.execute(
        `INSERT INTO sessions(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
        values(mapped, columns)
      );
      const current = conflictingSessionRecord(database, session.id, session.tokenHash);
      if (!current) throw new Error("session insert did not create or find a conflicting row");
      return result.changes === 1 ? { outcome: "created", record: current } : { outcome: "duplicate", current };
    },

    revoke(sessionId, options: UpdateOptions): UpdateResult<RepositorySession> {
      const expected = revisionNumber(options.expectedRevision);
      if (expected === undefined || !Number.isSafeInteger(expected + 1)) {
        const current = sessionRecord(database, sessionId);
        return current ? { outcome: "stale", current } : { outcome: "missing" };
      }
      const result = database.execute(
        `UPDATE sessions
         SET revoked_at = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND revoked_at IS NULL`,
        [options.at, options.at, sessionId, expected]
      );
      const current = sessionRecord(database, sessionId);
      if (!current) return { outcome: "missing" };
      if (result.changes === 1) return { outcome: "updated", record: current };
      if (current.revision !== options.expectedRevision) return { outcome: "stale", current };
      return { outcome: "unchanged", record: current };
    },

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

function createPrincipalsRepository(database: DatabaseContext): SessionCommandRepositories["principals"] {
  function findActive(field: "id" | "telegram_user_id", value: string): User | undefined {
    const rawUser = first<Row>(database, `SELECT * FROM users WHERE ${field} = ?`, [value]);
    if (!rawUser) return undefined;
    const user = userMapper.fromRow(rawUser);
    if (user.status !== "active") return undefined;

    const assignments = database.query<Row>(
      "SELECT * FROM user_roles WHERE user_id = ? ORDER BY role_id",
      [user.id]
    ).map((row) => userRoleMapper.fromRow(row));
    if (assignments.length !== 1) return undefined;

    const assignedRole = assignments[0]?.role;
      if (!assignedRole) return undefined;
      const rawRole = first<Row>(database, "SELECT * FROM roles WHERE id = ?", [assignedRole]);
      if (!rawRole) return undefined;
      const role = roleMapper.fromRow(rawRole).role;

      const permissionLinks = database.query<Row>(
        "SELECT * FROM role_permissions WHERE role_id = ? ORDER BY permission_id",
        [role]
      ).map((row) => rolePermissionMapper.fromRow(row));
      const permissions: Permission[] = [];
      for (const link of permissionLinks) {
        const rawPermission = first<Row>(database, "SELECT * FROM permissions WHERE id = ?", [link.permission]);
        if (!rawPermission) return undefined;
        permissions.push(permissionMapper.fromRow(rawPermission).permission);
      }

    return {
        id: user.id,
        telegramUserId: user.telegramUserId ?? "",
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        status: user.status,
        role,
        permissions
    };
  }
  return {
    findActive: (userId) => findActive("id", userId),
    findActiveByTelegramUserId: (telegramUserId) => findActive("telegram_user_id", telegramUserId)
  };
}

function createAuditRepository(database: DatabaseContext): SessionCommandRepositories["audit"] {
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

export function createSqliteSessionCommandRepositories(database: DatabaseContext): SessionCommandRepositories {
  return Object.freeze({
    sessions: createSessionsRepository(database),
    principals: createPrincipalsRepository(database),
    audit: createAuditRepository(database)
  });
}
