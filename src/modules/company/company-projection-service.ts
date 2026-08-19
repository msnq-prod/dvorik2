import type { CashEvent, DomainEventEnvelope, StaffEvent, WarehouseEvent } from "../../contracts/events";
import type { DatabaseAdapter } from "../../server/database";

export type CompanyProductProfitability = Readonly<{
  productId: string;
  actualRevenueKopecks: number;
  actualCostKopecks: number;
  marginKopecks: number;
  completeness: "complete" | "partial" | "unavailable";
  sourceUpdatedAt: string;
}>;

export type CompanyOverview = Readonly<{
  cash: { eventCount: number; revenueDeltaKopecks: number; exceptionCount: number; completeness: "available" | "unavailable"; sourceUpdatedAt?: string };
  staff: { activeEmployees: number; scheduledShifts: number; pendingExchanges: number; completeness: "available" | "unavailable"; sourceUpdatedAt?: string };
  warehouse: { projectedProducts: number; completeness: "available" | "unavailable"; sourceUpdatedAt?: string };
}>;

export type CompanyStatus = Readonly<{
  availability: "connected" | "degraded" | "unavailable";
  worker: { lastHeartbeatAt?: string; overdue: boolean };
  outbox: { pending: number; failed: number; oldestPendingAt?: string };
}>;

export class CompanyProjectionService {
  constructor(private readonly database: DatabaseAdapter, private readonly now: () => string = () => new Date().toISOString()) {}

  applyWarehouseEvent(event: WarehouseEvent) {
    return this.database.transaction((db) => {
      if (db.query("SELECT event_id FROM company_event_inbox WHERE event_id=?", [event.eventId]).length) return "duplicate" as const;
      if(event.eventType==="ProductProfitabilityUpdated"){
        const payload = event.payload;
        db.execute(`INSERT INTO company_product_profitability_projection(product_id,actual_revenue_kopecks,actual_cost_kopecks,completeness,source_updated_at,last_event_id,updated_at)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET actual_revenue_kopecks=excluded.actual_revenue_kopecks,
          actual_cost_kopecks=excluded.actual_cost_kopecks,completeness=excluded.completeness,source_updated_at=excluded.source_updated_at,
          last_event_id=excluded.last_event_id,updated_at=excluded.updated_at`, [payload.productId, payload.actualRevenueKopecks, payload.actualCostKopecks, payload.completeness, payload.sourceUpdatedAt, event.eventId, this.now()]);
      }
      this.recordEvent(db,event);
      return "applied" as const;
    }, { mode: "immediate" });
  }

  applyCashEvent(event: CashEvent) {
    return this.database.transaction((db) => {
      if (db.query("SELECT event_id FROM company_event_inbox WHERE event_id=?", [event.eventId]).length) return "duplicate" as const;
      const revenueDelta = "revenueDeltaKopecks" in event.payload ? event.payload.revenueDeltaKopecks : 0;
      const exceptionDelta = event.eventType === "CashExceptionRaised" ? 1 : 0;
      db.execute(`INSERT INTO company_cash_projection(singleton_id,event_count,revenue_delta_kopecks,exception_count,source_updated_at)
        VALUES (1,1,?,?,?) ON CONFLICT(singleton_id) DO UPDATE SET event_count=event_count+1,
        revenue_delta_kopecks=revenue_delta_kopecks+excluded.revenue_delta_kopecks,
        exception_count=exception_count+excluded.exception_count,source_updated_at=excluded.source_updated_at`,
        [revenueDelta,exceptionDelta,event.occurredAt]);
      this.recordEvent(db,event);
      return "applied" as const;
    }, {mode:"immediate"});
  }

  applyStaffEvent(event: StaffEvent) {
    return this.database.transaction((db) => {
      if (db.query("SELECT event_id FROM company_event_inbox WHERE event_id=?", [event.eventId]).length) return "duplicate" as const;
      const payload=event.payload;
      db.execute(`INSERT INTO company_staff_projection(singleton_id,active_employees,scheduled_shifts,pending_exchanges,source_updated_at)
        VALUES (1,?,?,?,?) ON CONFLICT(singleton_id) DO UPDATE SET active_employees=excluded.active_employees,
        scheduled_shifts=excluded.scheduled_shifts,pending_exchanges=excluded.pending_exchanges,source_updated_at=excluded.source_updated_at`,
        [payload.activeEmployees,payload.scheduledShifts,payload.pendingExchanges,payload.sourceUpdatedAt]);
      this.recordEvent(db,event);
      return "applied" as const;
    }, {mode:"immediate"});
  }

  enqueue(event: CashEvent | StaffEvent) {
    this.database.execute(`INSERT OR IGNORE INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
      VALUES (?,?,?,?,?,?,'pending',?,?)`, [event.eventId,event.producer,event.eventType,event.eventVersion,event.aggregateId,JSON.stringify(event.payload),this.now(),event.occurredAt]);
  }

  overview(): CompanyOverview {
    const cash=this.database.query<{event_count:number;revenue_delta_kopecks:number;exception_count:number;source_updated_at:string}>("SELECT event_count,revenue_delta_kopecks,exception_count,source_updated_at FROM company_cash_projection WHERE singleton_id=1")[0];
    const staff=this.database.query<{active_employees:number;scheduled_shifts:number;pending_exchanges:number;source_updated_at:string}>("SELECT active_employees,scheduled_shifts,pending_exchanges,source_updated_at FROM company_staff_projection WHERE singleton_id=1")[0];
    const warehouse=this.database.query<{count:number;source_updated_at:string|null}>("SELECT count(*) count,max(source_updated_at) source_updated_at FROM company_product_profitability_projection")[0];
    const warehouseWatermark=this.database.query<{source_updated_at:string}>("SELECT source_updated_at FROM company_source_watermarks WHERE producer='warehouse'")[0];
    return {
      cash: cash ? {eventCount:cash.event_count,revenueDeltaKopecks:cash.revenue_delta_kopecks,exceptionCount:cash.exception_count,completeness:"available",sourceUpdatedAt:cash.source_updated_at}:{eventCount:0,revenueDeltaKopecks:0,exceptionCount:0,completeness:"unavailable"},
      staff: staff ? {activeEmployees:staff.active_employees,scheduledShifts:staff.scheduled_shifts,pendingExchanges:staff.pending_exchanges,completeness:"available",sourceUpdatedAt:staff.source_updated_at}:{activeEmployees:0,scheduledShifts:0,pendingExchanges:0,completeness:"unavailable"},
      warehouse: warehouseWatermark ? {projectedProducts:warehouse?.count??0,completeness:"available",sourceUpdatedAt:warehouse.source_updated_at??warehouseWatermark.source_updated_at}:{projectedProducts:0,completeness:"unavailable"}
    };
  }

  recordWorkerHeartbeat() {
    const at = this.now();
    this.database.execute(`INSERT INTO company_source_watermarks(producer,last_event_id,source_updated_at,received_at) VALUES ('warehouse-company-worker','heartbeat',?,?)
      ON CONFLICT(producer) DO UPDATE SET last_event_id='heartbeat',source_updated_at=excluded.source_updated_at,received_at=excluded.received_at`, [at, at]);
  }

  status(): CompanyStatus {
    const worker = this.database.query<{ received_at: string }>("SELECT received_at FROM company_source_watermarks WHERE producer='warehouse-company-worker'")[0];
    const pending = this.database.query<{ count: number; oldest: string | null }>("SELECT count(*) count,min(created_at) oldest FROM domain_outbox WHERE producer IN ('warehouse','cash','staff') AND status IN ('pending','failed')")[0];
    const failed = this.database.query<{ count: number }>("SELECT count(*) count FROM domain_outbox WHERE producer IN ('warehouse','cash','staff') AND status='failed'")[0]?.count ?? 0;
    const overdue = !worker || Date.parse(this.now()) - Date.parse(worker.received_at) > 15_000;
    return {
      availability: !worker ? "unavailable" : overdue || failed ? "degraded" : "connected",
      worker: { ...(worker ? { lastHeartbeatAt: worker.received_at } : {}), overdue },
      outbox: { pending: pending?.count ?? 0, failed, ...(pending?.oldest ? { oldestPendingAt: pending.oldest } : {}) }
    };
  }

  productProfitability(productId: string): CompanyProductProfitability | undefined {
    const row = this.database.query<{ product_id: string; actual_revenue_kopecks: number; actual_cost_kopecks: number; completeness: CompanyProductProfitability["completeness"]; source_updated_at: string }>(
      "SELECT product_id,actual_revenue_kopecks,actual_cost_kopecks,completeness,source_updated_at FROM company_product_profitability_projection WHERE product_id=?", [productId])[0];
    return row ? { productId: row.product_id, actualRevenueKopecks: row.actual_revenue_kopecks, actualCostKopecks: row.actual_cost_kopecks, marginKopecks: row.actual_revenue_kopecks - row.actual_cost_kopecks, completeness: row.completeness, sourceUpdatedAt: row.source_updated_at } : undefined;
  }

  private recordEvent(db: {execute(sql:string,parameters?:readonly (string|number|null)[]):unknown}, event: DomainEventEnvelope) {
    db.execute("INSERT INTO company_event_inbox(event_id,producer,event_type,received_at,applied_at) VALUES (?,?,?,?,?)",[event.eventId,event.producer,event.eventType,this.now(),this.now()]);
    db.execute(`INSERT INTO company_source_watermarks(producer,last_event_id,source_updated_at,received_at) VALUES (?,?,?,?)
      ON CONFLICT(producer) DO UPDATE SET last_event_id=excluded.last_event_id,source_updated_at=excluded.source_updated_at,received_at=excluded.received_at`,
      [event.producer,event.eventId,event.occurredAt,this.now()]);
  }
}
