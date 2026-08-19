import type { Permission, Role, UserStatus } from "../../shared/types";
import type { JsonObject, VersionedPayload } from "../repositories";
import {
  enumValue,
  integer,
  nullableString,
  nullableUtcTimestamp,
  requiredString,
  RowMappingError,
  serializeVersionedJson,
  toNullable,
  utcTimestamp,
  versionedJson,
  type DatabaseRow,
  type PersistedRow
} from "./core";

const roles = ["seller", "admin", "super_admin"] as const satisfies readonly Role[];
const permissions = [
  "products:read", "products:write", "products:scan_manage", "stock:move", "inventory:write", "reports:read",
  "imports:write", "merge:write", "schedule:manage", "staff:manage", "saby:manage", "users:manage", "roles:manage",
  "techlog:read", "labels:print"
] as const satisfies readonly Permission[];
const userStatuses = ["pending", "active", "blocked", "rejected", "archived"] as const satisfies readonly UserStatus[];
const sessionMethods = ["demo", "telegram", "magic_link"] as const;

export type MappedRole = { role: Role; name: string; description: string; createdAt: string; updatedAt: string; revision: string };
export type MappedPermission = { permission: Permission; description: string; createdAt: string; revision: string };
export type MappedUser = {
  id: string; telegramUserId?: string; firstName: string; lastName: string; username: string;
  status: UserStatus; createdAt: string; updatedAt: string; archivedAt?: string; version: number; revision: string;
};
export type MappedUserRole = { userId: string; role: Role; assignedByUserId?: string; assignedAt: string };
export type MappedRolePermission = { role: Role; permission: Permission };
export type MappedSession = {
  id: string; userId: string; method: typeof sessionMethods[number]; expiresAt: string; revokedAt?: string;
  createdAt: string; tokenHash?: string; version: number; updatedAt: string;
  metadata: VersionedPayload<JsonObject>; revision: string;
};

function timestampRevision(entity: string, id: string, revision: string, expected: string) {
  if (revision !== expected) throw new RowMappingError(entity, id, "revision", "TIMESTAMP");
  return expected;
}

function versionForWrite(entity: string, id: string, version: number, revision: string) {
  if (!Number.isSafeInteger(version) || version < 0 || revision !== String(version)) {
    throw new RowMappingError(entity, id, "version", "INTEGER");
  }
  return version;
}

export const roleMapper = {
  fromRow(row: DatabaseRow): MappedRole {
    const createdAt = utcTimestamp("roles", row, "created_at");
    const updatedAt = utcTimestamp("roles", row, "updated_at");
    return { role: enumValue("roles", row, "id", roles), name: requiredString("roles", row, "name"), description: requiredString("roles", row, "description"), createdAt, updatedAt, revision: updatedAt };
  },
  toRow(value: MappedRole): PersistedRow {
    return { id: value.role, name: value.name, description: value.description, created_at: value.createdAt, updated_at: timestampRevision("roles", value.role, value.revision, value.updatedAt) };
  }
};

export const permissionMapper = {
  fromRow(row: DatabaseRow): MappedPermission {
    const createdAt = utcTimestamp("permissions", row, "created_at");
    return { permission: enumValue("permissions", row, "code", permissions), description: requiredString("permissions", row, "description"), createdAt, revision: createdAt };
  },
  toRow(value: MappedPermission): PersistedRow {
    return { id: value.permission, code: value.permission, description: value.description, created_at: timestampRevision("permissions", value.permission, value.revision, value.createdAt) };
  }
};

export const userMapper = {
  fromRow(row: DatabaseRow): MappedUser {
    const id = requiredString("users", row, "id");
    const updatedAt = utcTimestamp("users", row, "updated_at");
    const version = integer("users", row, "version");
    if (version < 0) throw new RowMappingError("users", id, "version", "INTEGER");
    return {
      id,
      telegramUserId: nullableString("users", row, "telegram_user_id"),
      firstName: requiredString("users", row, "first_name"),
      lastName: requiredString("users", row, "last_name"),
      username: requiredString("users", row, "username"),
      status: enumValue("users", row, "status", userStatuses),
      createdAt: utcTimestamp("users", row, "created_at"),
      updatedAt,
      archivedAt: nullableUtcTimestamp("users", row, "archived_at"),
      version,
      revision: String(version)
    };
  },
  toRow(value: MappedUser): PersistedRow {
    return {
      id: value.id, telegram_user_id: toNullable(value.telegramUserId), first_name: value.firstName,
      last_name: value.lastName, username: value.username, status: value.status,
      created_at: value.createdAt, updated_at: value.updatedAt, archived_at: toNullable(value.archivedAt),
      version: versionForWrite("users", value.id, value.version, value.revision)
    };
  }
};

export const userRoleMapper = {
  fromRow(row: DatabaseRow): MappedUserRole {
    return {
      userId: requiredString("user_roles", row, "user_id", ["user_id", "role_id"]),
      role: enumValue("user_roles", row, "role_id", roles, ["user_id", "role_id"]),
      assignedByUserId: nullableString("user_roles", row, "assigned_by_user_id", ["user_id", "role_id"]),
      assignedAt: utcTimestamp("user_roles", row, "assigned_at", ["user_id", "role_id"])
    };
  },
  toRow(value: MappedUserRole): PersistedRow {
    return { user_id: value.userId, role_id: value.role, assigned_by_user_id: toNullable(value.assignedByUserId), assigned_at: value.assignedAt };
  }
};

export const rolePermissionMapper = {
  fromRow(row: DatabaseRow): MappedRolePermission {
    return {
      role: enumValue("role_permissions", row, "role_id", roles, ["role_id", "permission_id"]),
      permission: enumValue("role_permissions", row, "permission_id", permissions, ["role_id", "permission_id"])
    };
  },
  toRow(value: MappedRolePermission): PersistedRow { return { role_id: value.role, permission_id: value.permission }; }
};

export const sessionMapper = {
  fromRow(row: DatabaseRow): MappedSession {
    const id = requiredString("sessions", row, "id");
    const createdAt = utcTimestamp("sessions", row, "created_at");
    const version = integer("sessions", row, "version");
    if (version < 0) throw new RowMappingError("sessions", id, "version", "INTEGER");
    return {
      id,
      userId: requiredString("sessions", row, "user_id"),
      method: enumValue("sessions", row, "method", sessionMethods),
      expiresAt: utcTimestamp("sessions", row, "expires_at"),
      revokedAt: nullableUtcTimestamp("sessions", row, "revoked_at"),
      createdAt,
      tokenHash: nullableString("sessions", row, "token_hash"),
      version,
      updatedAt: utcTimestamp("sessions", row, "updated_at"),
      metadata: versionedJson<JsonObject>("sessions", row, "metadata_json"),
      revision: String(version)
    };
  },
  toRow(value: MappedSession): PersistedRow {
    return {
      id: value.id, user_id: value.userId, method: value.method, expires_at: value.expiresAt,
      revoked_at: toNullable(value.revokedAt), created_at: value.createdAt,
      metadata_json: serializeVersionedJson(value.metadata), token_hash: toNullable(value.tokenHash),
      version: versionForWrite("sessions", value.id, value.version, value.revision), updated_at: value.updatedAt
    };
  }
};
