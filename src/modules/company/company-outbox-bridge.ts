import type { CashEvent, StaffEvent, WarehouseEvent } from "../../contracts/events";
import type { DatabaseAdapter } from "../../server/database";
import { CompanyProjectionService } from "./company-projection-service";

type OutboxRow = Readonly<{ event_id: string; producer: "warehouse" | "cash" | "staff"; event_type: string; event_version: 1; aggregate_id: string; payload_json: string; created_at: string; attempt_count: number }>;

/** The only in-process bridge between Warehouse and Company. It transports public events, never tables. */
export class CompanyOutboxBridge {
  constructor(private readonly database: DatabaseAdapter, private readonly company: CompanyProjectionService, private readonly now: () => string = () => new Date().toISOString()) {}

  dispatchPending(limit = 100) {
    const rows = this.database.query<OutboxRow>(`SELECT event_id,producer,event_type,event_version,aggregate_id,payload_json,created_at,attempt_count FROM domain_outbox
      WHERE producer IN ('warehouse','cash','staff') AND status IN ('pending','failed') AND available_at<=?
      ORDER BY created_at,event_id LIMIT ?`, [this.now(), limit]);
    let delivered = 0;
    for (const row of rows) {
      try {
        const event = { eventId: row.event_id, producer: row.producer, eventType: row.event_type, eventVersion: row.event_version, aggregateId: row.aggregate_id, occurredAt: row.created_at, payload: JSON.parse(row.payload_json) };
        if (event.producer === "warehouse") this.company.applyWarehouseEvent(event as WarehouseEvent);
        else if (event.producer === "cash") this.company.applyCashEvent(event as CashEvent);
        else this.company.applyStaffEvent(event as StaffEvent);
        this.database.execute("UPDATE domain_outbox SET status='sent',sent_at=?,last_error_code=NULL WHERE event_id=?", [this.now(), row.event_id]);
        delivered += 1;
      } catch (error) {
        const delay = Math.min(15 * 60_000, 2 ** Math.min(row.attempt_count, 10) * 1_000);
        this.database.execute("UPDATE domain_outbox SET status='failed',attempt_count=attempt_count+1,available_at=?,last_error_code=? WHERE event_id=?", [new Date(Date.parse(this.now()) + delay).toISOString(), error instanceof Error ? error.message : "COMPANY_PROJECTION_FAILED", row.event_id]);
      }
    }
    return delivered;
  }
}
