import assert from "node:assert/strict";
import { RowMappingError } from "./core";
import { permissionMapper, roleMapper, rolePermissionMapper, sessionMapper, userMapper, userRoleMapper } from "./identity";

const createdAt = "2026-07-12T00:00:00.000Z";
const legacyAt = "2026-07-12 00:00:00";
const roundTrip = <T>(mapper: { fromRow(row: Record<string, unknown>): T; toRow(value: T): Record<string, unknown> }, row: Record<string, unknown>) => mapper.fromRow(mapper.toRow(mapper.fromRow(row)));

assert.equal(roundTrip(roleMapper, { id: "admin", name: "Admin", description: "", created_at: legacyAt, updated_at: createdAt }).role, "admin");
assert.equal(roundTrip(permissionMapper, { id: "products:read", code: "products:read", description: "", created_at: legacyAt }).permission, "products:read");
assert.equal(roundTrip(userMapper, { id: "u-1", telegram_user_id: null, first_name: "A", last_name: "B", username: "ab", status: "active", created_at: legacyAt, updated_at: createdAt, archived_at: null, version: 0 }).telegramUserId, undefined);
assert.equal(roundTrip(userRoleMapper, { user_id: "u-1", role_id: "admin", assigned_by_user_id: null, assigned_at: legacyAt }).role, "admin");
assert.equal(roundTrip(rolePermissionMapper, { role_id: "admin", permission_id: "products:read" }).permission, "products:read");
const session = roundTrip(sessionMapper, { id: "s-1", user_id: "u-1", method: "telegram", expires_at: createdAt, revoked_at: null, created_at: legacyAt, metadata_json: "{}", token_hash: null, version: 0, updated_at: legacyAt });
assert.equal(session.metadata.schemaVersion, 1);
assert.deepEqual(session.metadata.value, {});

assert.throws(() => userMapper.fromRow({ id: "u-bad", telegram_user_id: null, first_name: "A", last_name: "B", username: "ab", status: "unknown", created_at: legacyAt, updated_at: legacyAt, archived_at: null, version: 0 }), (error) => error instanceof RowMappingError && error.entityId === "u-bad" && error.code === "ENUM");
assert.throws(() => sessionMapper.fromRow({ id: "s-bad", user_id: "u-1", method: "telegram", expires_at: createdAt, revoked_at: null, created_at: legacyAt, metadata_json: "{", token_hash: null, version: 0, updated_at: legacyAt }), (error) => error instanceof RowMappingError && error.entityId === "s-bad" && error.code === "JSON");
assert.throws(() => sessionMapper.fromRow({ id: "s-v2", user_id: "u-1", method: "telegram", expires_at: createdAt, revoked_at: null, created_at: legacyAt, metadata_json: JSON.stringify({ schemaVersion: 2, value: {} }), token_hash: null, version: 0, updated_at: legacyAt }), (error) => error instanceof RowMappingError && error.entityId === "s-v2" && error.code === "JSON_VERSION");
assert.throws(() => sessionMapper.fromRow({ id: "s-version", user_id: "u-1", method: "telegram", expires_at: createdAt, revoked_at: null, created_at: legacyAt, metadata_json: "{}", token_hash: null, version: -1, updated_at: legacyAt }), (error) => error instanceof RowMappingError && error.entityId === "s-version" && error.code === "INTEGER");
assert.throws(() => sessionMapper.toRow({ ...session, revision: "1" }), (error) => error instanceof RowMappingError && error.entityId === "s-1" && error.code === "INTEGER");
assert.throws(() => userMapper.toRow({ ...userMapper.fromRow({ id: "u-rev", telegram_user_id: null, first_name: "A", last_name: "B", username: "ab", status: "active", created_at: legacyAt, updated_at: createdAt, archived_at: null, version: 0 }), revision: "1" }), (error) => error instanceof RowMappingError && error.entityId === "u-rev" && error.field === "version");
console.log("identity mapper tests passed");
