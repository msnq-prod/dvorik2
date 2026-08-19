import { nanoid } from "nanoid";
import type { IdentityEvent } from "../contracts/events";
import { loadRuntimeConfig } from "./config";
import { openDatabase, type DatabaseAdapter } from "./database";
import { StaffClient } from "./staff-client";

type Row = Readonly<{ event_id: string; user_id: string; status: IdentityEvent["payload"]["status"]; identity_revision: number; correlation_id: string; occurred_at: string; attempt_count: number }>;

export async function dispatchStaffIdentityOutbox(database: DatabaseAdapter, client: Pick<StaffClient, "applyIdentityEvent">, now = new Date(), limit = 100) {
  const at = now.toISOString();
  const worker = `staff-identity:${process.pid}:${nanoid()}`;
  const rows = database.transaction((db) => {
    db.execute("UPDATE staff_identity_outbox SET state='pending',lease_token=NULL,lease_expires_at=NULL,last_error_code='LEASE_EXPIRED' WHERE state='processing' AND lease_expires_at<=?", [at]);
    const candidates = db.query<Row>("SELECT event_id,user_id,status,identity_revision,correlation_id,occurred_at,attempt_count FROM staff_identity_outbox WHERE state IN ('pending','failed') AND available_at<=? ORDER BY created_at,event_id LIMIT ?", [at, limit]);
    return candidates.flatMap((row) => db.execute("UPDATE staff_identity_outbox SET state='processing',lease_token=?,lease_expires_at=? WHERE event_id=? AND state IN ('pending','failed')", [worker, new Date(now.getTime() + 60_000).toISOString(), row.event_id]).changes === 1 ? [row] : []);
  }, { mode: "immediate" });
  let sent = 0; let failed = 0;
  for (const row of rows) {
    const event: IdentityEvent = { eventId: row.event_id, eventType: "IdentityStatusChanged", eventVersion: 1, producer: "platform", aggregateId: row.user_id, occurredAt: row.occurred_at, payload: { userId: row.user_id, status: row.status, identityRevision: row.identity_revision, correlationId: row.correlation_id } };
    try {
      await client.applyIdentityEvent(event);
      sent += database.execute("UPDATE staff_identity_outbox SET state='sent',sent_at=?,lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE event_id=? AND state='processing' AND lease_token=?", [new Date().toISOString(), row.event_id, worker]).changes;
    } catch (error) {
      failed += database.execute("UPDATE staff_identity_outbox SET state=CASE WHEN attempt_count+1>=8 THEN 'requires_action' ELSE 'pending' END,attempt_count=attempt_count+1,available_at=?,lease_token=NULL,lease_expires_at=NULL,last_error_code=? WHERE event_id=? AND state='processing' AND lease_token=?", [new Date(Date.now() + Math.min(900_000, 1_000 * 2 ** Math.min(row.attempt_count + 1, 10))).toISOString(), error instanceof Error ? error.message.slice(0, 128) : "DELIVERY_FAILED", row.event_id, worker]).changes;
    }
  }
  return { claimed: rows.length, sent, failed };
}

async function main() {
  const config = loadRuntimeConfig();
  if (config.staff.mode !== "external" || !config.staff.baseUrl || !config.staff.internalSecret) throw new Error("DVORIK_STAFF_MODE must be external");
  const database = openDatabase(config.sqliteFile);
  const client = new StaffClient(config.staff.baseUrl, config.staff.internalSecret);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try { while (!stopping) { await dispatchStaffIdentityOutbox(database, client); await new Promise((resolve) => setTimeout(resolve, 1_000)); } }
  finally { database.close(); }
}

if (process.argv[1]?.endsWith("staff-identity-worker.js")) void main().catch((error) => { console.error(JSON.stringify({ event: "staff_identity_worker_failed", code: error instanceof Error ? error.message : "UNKNOWN" })); process.exitCode = 1; });
