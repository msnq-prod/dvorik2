import type { LabelPrintJob } from "../shared/types";
import type { ArtifactCommandRepositories } from "./artifact-command-service";
import type { DatabaseContext, SqlValue } from "./database";
import { labelJobFromRow, labelJobToRow } from "./mappers/workflows";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import { createAuditRepository, createRolesRepository } from "./sqlite-stock-command-repositories";

type Row = Readonly<Record<string, unknown>>;

function record(database: DatabaseContext, id: string) {
  const row = database.query<Row>("SELECT * FROM label_jobs WHERE id = ?", [id])[0];
  if (!row) return undefined;
  const mapped = labelJobFromRow(row);
  const entity: LabelPrintJob = {
    id: mapped.entity.id,
    actorId: mapped.entity.actorId ?? "system",
    templateId: mapped.entity.templateId,
    geometry: mapped.entity.geometry.value as unknown as LabelPrintJob["geometry"],
    labels: mapped.entity.labels.value as unknown as LabelPrintJob["labels"],
    createdAt: mapped.entity.createdAt
  };
  return { entity, revision: mapped.revision };
}

export function createSqliteArtifactCommandRepositories(database: DatabaseContext): ArtifactCommandRepositories {
  return Object.freeze({
    roles: createRolesRepository(database),
    labels: {
      findById: (id) => record(database, id),
      create(job, at) {
        const row = labelJobToRow({
          revision: "0",
          entity: {
            id: job.id, actorId: job.actorId, status: "created", templateId: job.templateId,
            geometry: { schemaVersion: 1, value: job.geometry as unknown as Record<string, never> },
            labels: { schemaVersion: 1, value: job.labels as unknown as never[] },
            result: { schemaVersion: 1, value: {} }, createdAt: job.createdAt, updatedAt: at
          }
        });
        const columns = ["id", "actor_id", "status", "template_id", "geometry_json", "labels_json", "result_json", "created_at", "completed_at", "version", "updated_at"] as const;
        const result = database.execute(
          `INSERT INTO label_jobs(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(id) DO NOTHING`,
          columns.map((column) => row[column] as SqlValue)
        );
        return result.changes === 1 ? "created" : "duplicate";
      }
    },
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  });
}
