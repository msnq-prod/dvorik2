import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseError, openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import { SessionService, SessionServiceError, type SessionCommandRepositories } from "./session-service";
import { createSqliteSessionCommandRepositories } from "./sqlite-session-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-session-service-"));
const database = openDatabase(path.join(directory, "sessions.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('seller','seller'),('admin','admin');
  INSERT INTO permissions(id,code) VALUES ('products:read','products:read'),('stock:move','stock:move');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('seller','products:read'),('admin','stock:move');
  INSERT INTO users(id,telegram_user_id,first_name,last_name,username,status,created_at,updated_at) VALUES
    ('u-main','1001','Main','User','main','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-other','1002','Other','User','other','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-expired','1003','Expired','User','expired','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-blocked','1004','Blocked','User','blocked','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-revoke','1005','Revoke','User','revoke','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-fault','1006','Fault','User','fault','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z'),
    ('u-duplicate','1007','Duplicate','User','duplicate','active','2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z');
  INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES
    ('u-main','admin','2026-07-12T00:00:00.000Z'),
    ('u-other','seller','2026-07-12T00:00:00.000Z'),
    ('u-expired','seller','2026-07-12T00:00:00.000Z'),
    ('u-blocked','seller','2026-07-12T00:00:00.000Z'),
    ('u-revoke','seller','2026-07-12T00:00:00.000Z'),
    ('u-fault','seller','2026-07-12T00:00:00.000Z'),
    ('u-duplicate','seller','2026-07-12T00:00:00.000Z');
`);

const secret = "test-session-secret-with-at-least-32-bytes";
let now = "2026-07-12T06:00:00.000Z";
let tokenSequence = 0;
let idSequence = 0;

function token(number = ++tokenSequence) {
  return Buffer.alloc(32, number % 256).toString("base64url");
}

function makeService(
  factory: (connection: DatabaseContext) => SessionCommandRepositories = createSqliteSessionCommandRepositories,
  createToken: () => string = () => token()
) {
  return new SessionService(
    new UnitOfWork(database, factory),
    { now: () => now },
    {
      secret,
      maxAgeMs: 3_600_000,
      createToken,
      createId: (kind) => `${kind}-${++idSequence}`
    }
  );
}

function rowFor(sessionId: string) {
  return database.query<{ id: string; token_hash: string | null; expires_at: string; revoked_at: string | null; version: number }>(
    "SELECT id,token_hash,expires_at,revoked_at,version FROM sessions WHERE id = ?",
    [sessionId]
  )[0];
}

const service = makeService();

// Opaque credentials are never persisted raw and cannot be replaced by a database id.
const first = service.create("u-main", "telegram");
const firstRow = rowFor(first.sessionId);
const expectedHash = `hmac-sha256:${createHmac("sha256", secret).update(first.token, "utf8").digest("hex")}`;
assert.notEqual(first.sessionId, first.token);
assert.equal(firstRow.token_hash, expectedHash);
assert.notEqual(firstRow.token_hash, first.token);
assert.equal(JSON.stringify(database.query("SELECT * FROM sessions WHERE id = ?", [first.sessionId])).includes(first.token), false);
assert.deepEqual(service.authenticate(first.token), { sessionId: first.sessionId, user: first.user });
assert.equal(service.authenticate(first.sessionId), undefined);
assert.equal(service.logout(first.sessionId), false);
for (const malformed of [undefined, "", "raw-session-id", "a".repeat(42), "a".repeat(44), "!".repeat(43)]) {
  assert.equal(service.authenticate(malformed), undefined);
  assert.equal(service.logout(malformed), false);
}

// Rotation is user-scoped: a repeated login revokes the old credential and keeps the new one usable.
const telegramOther = service.createForTelegram("1002");
assert.equal(telegramOther.user.id, "u-other");
assert.equal(service.findActiveTelegramPrincipal("1002")?.id, "u-other");
const other = service.create("u-other", "demo");
assert.equal(service.authenticate(telegramOther.token), undefined);
const rotated = service.create("u-main", "magic_link");
assert.equal(service.authenticate(first.token), undefined);
assert.deepEqual(service.authenticate(rotated.token), { sessionId: rotated.sessionId, user: rotated.user });
assert.deepEqual(service.authenticate(other.token), { sessionId: other.sessionId, user: other.user });
assert.equal(rowFor(first.sessionId).revoked_at, now);
assert.equal(rowFor(rotated.sessionId).revoked_at, null);

// An expired credential and a credential whose principal became blocked are unusable.
const expires = service.create("u-expired", "demo");
now = "2026-07-12T07:00:00.001Z";
assert.equal(service.authenticate(expires.token), undefined);
now = "2026-07-12T08:00:00.000Z";
const blocked = service.create("u-blocked", "telegram");
database.execute("UPDATE users SET status='blocked', updated_at=? WHERE id='u-blocked'", [now]);
assert.equal(service.authenticate(blocked.token), undefined);

// Logout revokes exactly the matching session and preserves unrelated active authentication.
const logoutTarget = service.create("u-revoke", "demo");
const liveOther = service.create("u-other", "telegram");
const unrelatedBeforeLogout = service.authenticate(liveOther.token);
assert.ok(unrelatedBeforeLogout);
assert.equal(service.logout(logoutTarget.token), true);
assert.equal(service.logout(logoutTarget.token), false);
assert.equal(service.authenticate(logoutTarget.token), undefined);
assert.deepEqual(service.authenticate(liveOther.token), unrelatedBeforeLogout);
assert.equal(rowFor(logoutTarget.sessionId).revoked_at, now);
assert.equal(rowFor(liveOther.sessionId).revoked_at, null);

// Administrative user revocation is atomic and only affects the selected principal.
const revokeTarget = service.create("u-revoke", "telegram");
assert.equal(service.revokeUser("u-revoke", "u-main", "security incident"), 1);
assert.equal(service.revokeUser("u-revoke", "u-main", "already revoked"), 0);
assert.equal(service.authenticate(revokeTarget.token), undefined);
assert.deepEqual(service.authenticate(liveOther.token), unrelatedBeforeLogout);

// A duplicate generated credential rolls the whole rotation back, preserving the legitimate session.
const duplicateToken = token();
const duplicateService = makeService(createSqliteSessionCommandRepositories, () => duplicateToken);
const duplicate = duplicateService.create("u-duplicate", "demo");
const duplicateCounts = database.query<{ sessions: number; audits: number }>(
  "SELECT (SELECT count(*) FROM sessions WHERE user_id='u-duplicate') sessions, (SELECT count(*) FROM audit_entries WHERE entity_id=?) audits",
  [duplicate.sessionId]
)[0];
assert.throws(() => duplicateService.create("u-duplicate", "demo"), (error) => error instanceof DatabaseError);
assert.deepEqual(duplicateService.authenticate(duplicate.token), { sessionId: duplicate.sessionId, user: duplicate.user });
assert.equal(rowFor(duplicate.sessionId).revoked_at, null);
assert.deepEqual(database.query<{ sessions: number; audits: number }>(
  "SELECT (SELECT count(*) FROM sessions WHERE user_id='u-duplicate') sessions, (SELECT count(*) FROM audit_entries WHERE entity_id=?) audits",
  [duplicate.sessionId]
)[0], duplicateCounts);

type FaultStage = "revoke" | "create" | "audit";
function faultFactory(stage: FaultStage) {
  return (connection: DatabaseContext): SessionCommandRepositories => {
    const real = createSqliteSessionCommandRepositories(connection);
    return {
      ...real,
      sessions: {
        ...real.sessions,
        revokeActiveForUser(userId, revokedAt) {
          const result = real.sessions.revokeActiveForUser(userId, revokedAt);
          if (stage === "revoke") throw new Error(stage);
          return result;
        },
        create(session, options) {
          const result = real.sessions.create(session, options);
          if (stage === "create") throw new Error(stage);
          return result;
        }
      },
      audit: {
        append(entry, options) {
          const result = real.audit.append(entry, options);
          if (stage === "audit") throw new Error(stage);
          return result;
        }
      }
    };
  };
}

// Every failure boundary after revocation begins rolls back the old revocation and all partial writes.
for (const stage of ["revoke", "create", "audit"] as const) {
  const baseline = service.create("u-fault", "demo");
  const before = database.query<{ sessions: number; audits: number }>(
    "SELECT (SELECT count(*) FROM sessions WHERE user_id='u-fault') sessions, (SELECT count(*) FROM audit_entries) audits"
  )[0];
  const faultService = makeService(faultFactory(stage));
  assert.throws(() => faultService.create("u-fault", "telegram"), (error) => error instanceof DatabaseError && error.code === "DATABASE_TRANSACTION_FAILED");
  assert.deepEqual(database.query<{ sessions: number; audits: number }>(
    "SELECT (SELECT count(*) FROM sessions WHERE user_id='u-fault') sessions, (SELECT count(*) FROM audit_entries) audits"
  )[0], before);
  assert.equal(rowFor(baseline.sessionId).revoked_at, null);
  assert.deepEqual(service.authenticate(baseline.token), { sessionId: baseline.sessionId, user: baseline.user });
}

// Service rejects invalid generators before a transaction and inactive principals without partial state.
assert.throws(() => makeService(createSqliteSessionCommandRepositories, () => "invalid").create("u-main", "demo"), (error) => error instanceof SessionServiceError && error.code === "BAD_TOKEN_GENERATOR");
const inactiveBefore = database.query<{ sessions: number; audits: number }>("SELECT (SELECT count(*) FROM sessions) sessions, (SELECT count(*) FROM audit_entries) audits")[0];
assert.throws(() => service.create("u-blocked", "demo"), (error) => error instanceof SessionServiceError && error.code === "USER_NOT_ACTIVE");
assert.deepEqual(database.query<{ sessions: number; audits: number }>("SELECT (SELECT count(*) FROM sessions) sessions, (SELECT count(*) FROM audit_entries) audits")[0], inactiveBefore);

// Neither raw credentials nor their hashes are allowed in audit storage.
const sensitiveValues = database.query<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE token_hash IS NOT NULL").map((row) => row.token_hash);
const auditStorage = JSON.stringify(database.query("SELECT id,actor_id,entity_type,entity_id,action,changes_json,request_id FROM audit_entries ORDER BY id"));
for (const value of [first.token, rotated.token, other.token, expires.token, blocked.token, logoutTarget.token, liveOther.token, revokeTarget.token, duplicate.token, ...sensitiveValues]) {
  assert.equal(auditStorage.includes(value), false);
}

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("session service tests passed");
