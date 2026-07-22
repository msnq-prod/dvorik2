import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LabelPrintJob } from "../shared/types";
import { ArtifactCommandService, type ArtifactCommandRepositories } from "./artifact-command-service";
import { CommandExecutor, type CommandMetadata } from "./command-context";
import { openDatabase, type DatabaseContext } from "./database";
import { applyMigrations } from "./migrations";
import { createSqliteArtifactCommandRepositories } from "./sqlite-artifact-command-repositories";
import { UnitOfWork } from "./unit-of-work";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-artifacts-"));
const database = openDatabase(path.join(directory, "artifacts.sqlite"));
database.executeScript("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (1, datetime('now'));");
applyMigrations(database);
database.executeScript(`
  INSERT INTO roles(id,name) VALUES ('admin','admin'),('seller','seller');
  INSERT INTO permissions(id,code) VALUES ('labels:print','labels:print');
  INSERT INTO role_permissions(role_id,permission_id) VALUES ('admin','labels:print');
  INSERT INTO users(id,status) VALUES ('u-admin','active'),('u-seller','active');
  INSERT INTO user_roles(user_id,role_id) VALUES ('u-admin','admin'),('u-seller','seller');
`);

function service(factory: (connection: DatabaseContext) => ArtifactCommandRepositories = createSqliteArtifactCommandRepositories) {
  let audit = 0;
  return new ArtifactCommandService(
    new CommandExecutor(new UnitOfWork(database, factory), { now: () => "2026-07-20T10:00:00.000Z" }, { resolve: (reference) => reference }),
    { processingTimeoutMs: 30_000, idempotencyRetentionMs: 86_400_000, createId: () => `audit-${++audit}` }
  );
}
function metadata(key: string, userId = "u-admin"): CommandMetadata {
  return { actorReference: { kind: "user", userId, authenticatedBy: "web_session" }, requestId: `http:${key}`, channel: "web", idempotencyKey: key };
}
const job: LabelPrintJob = {
  id: "label-1", actorId: "u-admin", templateId: "a4-basic",
  geometry: { widthMm: 58, heightMm: 40, labelsPerPage: 21, perRow: 3, rows: 7 },
  labels: [{ productId: "p1", title: "Товар", sku: "1", unit: "шт", quantity: 1, printedAt: "20.07.2026", barcode: { type: "code128", value: "1", pattern: "101" } }],
  createdAt: "2026-07-20T10:00:00.000Z"
};

const artifacts = service();
assert.equal(artifacts.createLabel(metadata("forbidden", "u-seller"), job).status, 403);
const created = artifacts.createLabel(metadata("create"), job);
assert.equal(created.status, 201);
assert.deepEqual(artifacts.createLabel(metadata("create"), job), { ...created, outcome: "replayed" });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM label_jobs")[0].count, 1);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE action='create'")[0].count, 1);
const reprint = artifacts.recordLabelReprint(metadata("reprint"), job.id);
assert.equal(reprint.status, 200);
assert.deepEqual(artifacts.recordLabelReprint(metadata("reprint"), job.id), { ...reprint, outcome: "replayed" });
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM audit_entries WHERE action='reprint'")[0].count, 1);

const faulting = service((connection) => {
  const repositories = createSqliteArtifactCommandRepositories(connection);
  return { ...repositories, audit: { append() { throw new Error("audit fault"); } } };
});
assert.throws(() => faulting.createLabel(metadata("rollback"), { ...job, id: "label-rollback" }), /transaction/i);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM label_jobs WHERE id='label-rollback'")[0].count, 0);
assert.equal(database.query<{ count: number }>("SELECT count(*) count FROM idempotency_keys WHERE key='rollback'")[0].count, 0);

database.close();
fs.rmSync(directory, { recursive: true, force: true });
console.log("artifact command service tests passed");
