import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { CashEvent, CashStockDeltaPayload, DomainEventEnvelope, EventDeliveryResult } from "../contracts/events";
import type { CashStatus } from "../contracts/cash";
import type { DatabaseAdapter, DatabaseContext } from "../server/database";
import type { SabyClient } from "../server/saby-client";
import { formatCashDateTime, normalizeCashOrder, type NormalizedCashLine, type NormalizedCashSale } from "./normalization";
import { signInternalRequest } from "./signature";

type Mapping = Readonly<{ product_id: string; package_mass_grams: number | null; inventory_kind: "piece" | "weight" }>;
type StoredLine = Readonly<{ emitted_package_milli: number; emitted_revenue_kopecks: number; mapped_product_id: string | null }>;
type WarehouseProduct = Readonly<{ id: string; status: "active"; inventoryKind: "piece" | "weight"; packageMassGrams?: number | null }>;
type MappingInput = Readonly<{ nomenclatureUuid: string; productId: string; packageMassGrams?: number; inventoryKind: "piece" | "weight"; actorId: string; idempotencyKey: string }>;

export class CashService {
  constructor(
    private readonly database: DatabaseAdapter,
    private readonly client: Pick<SabyClient, "listOrders">,
    private readonly options: Readonly<{
      pointId: number; timezone: string; overlapMinutes: number; initialLookbackHours: number;
      coreBaseUrl: string; internalSecret: string; now?: () => Date; fetcher?: typeof fetch;
    }>
  ) {}

  recordWebhookSignal(payload: unknown) {
    const id = nanoid();
    const at = this.now().toISOString();
    this.database.execute("INSERT INTO cash_webhook_signals(id,payload_json,status,received_at) VALUES (?,?,'pending',?)", [id, JSON.stringify(payload ?? {}), at]);
    return { id, accepted: true };
  }

  status(availability: CashStatus["availability"] = "connected"): CashStatus {
    const state = this.database.query<{ last_success_at: string | null; last_error_code: string | null }>("SELECT last_success_at,last_error_code FROM cash_sync_state WHERE scope='retail_sales'")[0];
    const pendingSignals = this.database.query<{ count: number }>("SELECT count(*) count FROM cash_webhook_signals WHERE status IN ('pending','failed')")[0]?.count ?? 0;
    const pendingEvents = this.database.query<{ count: number }>("SELECT count(*) count FROM cash_event_outbox WHERE status IN ('pending','failed','requires_action')")[0]?.count ?? 0;
    const failedEvents = this.database.query<{ count: number }>("SELECT count(*) count FROM cash_event_outbox WHERE status='failed'")[0]?.count ?? 0;
    const requiresActionEvents = this.database.query<{ count: number }>("SELECT count(*) count FROM cash_event_outbox WHERE status='requires_action'")[0]?.count ?? 0;
    const oldestPendingAt=this.database.query<{created_at:string}>("SELECT created_at FROM cash_event_outbox WHERE status IN ('pending','failed','requires_action') ORDER BY created_at LIMIT 1")[0]?.created_at;
    return {
      availability:availability==="connected"&&(state?.last_error_code||failedEvents||requiresActionEvents)?"degraded":availability, enabled: true, pointId: this.options.pointId, pendingSignals, pendingEvents,failedEvents,requiresActionEvents,
      ...(oldestPendingAt?{oldestPendingAt}:{}),
      ...(state?.last_success_at ? { lastSuccessAt: state.last_success_at } : {}),
      ...(state?.last_error_code ? { lastErrorCode: state.last_error_code } : {})
    };
  }

  listMappings() {
    return this.database.query(`SELECT i.nomenclature_uuid nomenclatureUuid,i.name,i.barcode,i.article,
      m.product_id productId,m.package_mass_grams packageMassGrams,m.inventory_kind inventoryKind
      FROM cash_external_items i LEFT JOIN cash_product_mappings m ON m.nomenclature_uuid=i.nomenclature_uuid
      ORDER BY (m.product_id IS NULL) DESC,i.last_seen_at DESC,i.nomenclature_uuid`);
  }

  async validateMapping(input: Pick<MappingInput, "productId" | "inventoryKind">) {
    if (!input.productId) throw new Error("MAPPING_FIELDS_REQUIRED");
    const timestamp = this.now().toISOString();
    const response = await (this.options.fetcher ?? fetch)(`${this.options.coreBaseUrl}/internal/v1/catalog/products/${encodeURIComponent(input.productId)}`, {
      headers: {
        "x-dvorik-timestamp": timestamp,
        "x-dvorik-signature": signInternalRequest(this.options.internalSecret, timestamp, "")
      }
    });
    if (response.status === 404) throw new Error("PRODUCT_NOT_FOUND");
    if (!response.ok) throw new Error(`WAREHOUSE_CATALOG_HTTP_${response.status}`);
    const product = await response.json() as WarehouseProduct;
    if (product.id !== input.productId || product.status !== "active") throw new Error("PRODUCT_NOT_FOUND");
    if (product.inventoryKind !== input.inventoryKind) throw new Error("MAPPING_INVENTORY_KIND_MISMATCH");
  }

  saveMapping(input: MappingInput) {
    if (!input.nomenclatureUuid || !input.productId || !input.idempotencyKey) throw new Error("MAPPING_FIELDS_REQUIRED");
    if (input.inventoryKind === "weight" && (!Number.isSafeInteger(input.packageMassGrams) || Number(input.packageMassGrams) <= 0)) throw new Error("PACKAGE_MASS_REQUIRED");
    const hash = crypto.createHash("sha256").update(JSON.stringify({ nomenclatureUuid: input.nomenclatureUuid, productId: input.productId, packageMassGrams: input.packageMassGrams, inventoryKind: input.inventoryKind })).digest("hex");
    return this.database.transaction((db) => {
      const existing = db.query<{ request_hash: string; response_json: string }>("SELECT request_hash,response_json FROM cash_idempotency_keys WHERE scope='mapping' AND key=?", [input.idempotencyKey])[0];
      if (existing) {
        if (existing.request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
        return JSON.parse(existing.response_json) as { nomenclatureUuid: string; productId: string };
      }
      if (!db.query("SELECT nomenclature_uuid FROM cash_external_items WHERE nomenclature_uuid=?", [input.nomenclatureUuid]).length) throw new Error("SABY_ITEM_NOT_FOUND");
      const at = this.now().toISOString();
      db.execute(`INSERT INTO cash_product_mappings(nomenclature_uuid,product_id,package_mass_grams,inventory_kind,created_by_user_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(nomenclature_uuid) DO UPDATE SET product_id=excluded.product_id,
        package_mass_grams=excluded.package_mass_grams,inventory_kind=excluded.inventory_kind,
        created_by_user_id=excluded.created_by_user_id,updated_at=excluded.updated_at`,
      [input.nomenclatureUuid, input.productId, input.packageMassGrams ?? null, input.inventoryKind, input.actorId, at, at]);
      const mapping: Mapping = { product_id: input.productId, package_mass_grams: input.packageMassGrams ?? null, inventory_kind: input.inventoryKind };
      const pending = db.query<Record<string, unknown>>(`SELECT s.external_key,s.point_id,s.state,s.is_return,s.business_time,s.external_updated_at,
        s.total_kopecks,s.revision_sha256,s.raw_json,l.external_line_key,l.name,l.quantity_milli,l.total_kopecks line_total_kopecks,
        l.discount_kopecks,l.refused,l.emitted_package_milli,l.emitted_revenue_kopecks,l.mapped_product_id
        FROM cash_sale_lines l JOIN cash_sales s ON s.external_key=l.external_sale_key
        WHERE l.nomenclature_uuid=? AND s.state='completed' AND l.refused=0`, [input.nomenclatureUuid]);
      for (const row of pending) {
        const sale: NormalizedCashSale = {
          key: String(row.external_key), pointId: Number(row.point_id), state: row.state as NormalizedCashSale["state"], isReturn: Boolean(row.is_return),
          businessTime: String(row.business_time), externalUpdatedAt: String(row.external_updated_at), totalKopecks: Number(row.total_kopecks),
          revision: String(row.revision_sha256), raw: String(row.raw_json), lines: []
        };
        const line: NormalizedCashLine = {
          key: String(row.external_line_key), uuid: input.nomenclatureUuid, name: String(row.name), quantityMilli: Number(row.quantity_milli),
          totalKopecks: Number(row.line_total_kopecks), discountKopecks: Number(row.discount_kopecks), refused: Boolean(row.refused)
        };
        this.applyLine(db, sale, line, {
          emitted_package_milli: Number(row.emitted_package_milli), emitted_revenue_kopecks: Number(row.emitted_revenue_kopecks),
          mapped_product_id: row.mapped_product_id === null ? null : String(row.mapped_product_id)
        }, at, mapping);
      }
      const result = { nomenclatureUuid: input.nomenclatureUuid, productId: input.productId };
      db.execute("INSERT INTO cash_idempotency_keys(scope,key,request_hash,response_json,created_at) VALUES ('mapping',?,?,?,?)", [input.idempotencyKey, hash, JSON.stringify(result), at]);
      return result;
    }, { mode: "immediate" });
  }

  async synchronize(explicit?: Readonly<{ from: Date; to: Date }>) {
    const now = this.now();
    const state = this.database.query<{ cursor_updated_at: string | null }>("SELECT cursor_updated_at FROM cash_sync_state WHERE scope='retail_sales'")[0];
    const cursor = state?.cursor_updated_at ? new Date(state.cursor_updated_at) : undefined;
    const from = explicit?.from ?? new Date((cursor?.getTime() ?? now.getTime() - this.options.initialLookbackHours * 3_600_000) - this.options.overlapMinutes * 60_000);
    const to = explicit?.to ?? now;
    const runId = nanoid();
    this.database.execute("INSERT INTO cash_reconciliation_runs(id,from_time,to_time,status,started_at) VALUES (?,?,?,'running',?)", [runId, from.toISOString(), to.toISOString(), now.toISOString()]);
    try {
      const orders = await this.client.listOrders({ fromDateTime: formatCashDateTime(from, this.options.timezone), toDateTime: formatCashDateTime(to, this.options.timezone) });
      let changed = 0;
      let maxUpdated = state?.cursor_updated_at ?? "";
      for (const raw of orders) {
        const sale = normalizeCashOrder(raw, this.options.pointId);
        if (sale.externalUpdatedAt > maxUpdated) maxUpdated = sale.externalUpdatedAt;
        if (this.applySale(sale)) changed += 1;
      }
      const at = this.now().toISOString();
      this.database.transaction((db) => {
        db.execute("UPDATE cash_reconciliation_runs SET orders_seen=?,orders_changed=?,status='completed',completed_at=? WHERE id=?", [orders.length, changed, at, runId]);
        db.execute("UPDATE cash_sync_state SET cursor_updated_at=?,last_success_at=?,last_error_code=NULL,updated_at=? WHERE scope='retail_sales'", [maxUpdated || to.toISOString(), at, at]);
        db.execute("UPDATE cash_webhook_signals SET status='processed',processed_at=?,last_error_code=NULL WHERE status IN ('pending','failed')", [at]);
      }, { mode: "immediate" });
      return { runId, ordersSeen: orders.length, ordersChanged: changed };
    } catch (error) {
      const code = error instanceof Error ? error.message : "CASH_SYNC_FAILED";
      const at = this.now().toISOString();
      this.database.execute("UPDATE cash_reconciliation_runs SET status='failed',error_code=?,completed_at=? WHERE id=?", [code, at, runId]);
      this.database.execute("UPDATE cash_sync_state SET last_error_code=?,updated_at=? WHERE scope='retail_sales'", [code, at]);
      this.database.execute("UPDATE cash_webhook_signals SET status='failed',attempt_count=attempt_count+1,last_error_code=? WHERE status='pending'", [code]);
      throw error;
    }
  }

  async dispatchPending(limit = 100) {
    const rows = this.database.query<{ event_id: string; event_type: CashEvent["eventType"]; aggregate_id: string; payload_json: string; created_at: string }>(
      "SELECT event_id,event_type,aggregate_id,payload_json,created_at FROM cash_event_outbox WHERE status IN ('pending','failed') AND available_at<=? ORDER BY created_at,event_id LIMIT ?", [this.now().toISOString(), limit]);
    let delivered = 0;
    for (const row of rows) {
      const event: CashEvent = {
        eventId: row.event_id, eventType: row.event_type, eventVersion: 1, producer: "cash",
        aggregateId: row.aggregate_id, occurredAt: row.created_at, payload: JSON.parse(row.payload_json)
      } as CashEvent;
      const body = JSON.stringify(event);
      const timestamp = this.now().toISOString();
      try {
        const response = await (this.options.fetcher ?? fetch)(`${this.options.coreBaseUrl}/internal/v1/events/cash`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-dvorik-timestamp": timestamp, "x-dvorik-signature": signInternalRequest(this.options.internalSecret, timestamp, body) },
          body
        });
        if (!response.ok) throw new Error(`CORE_HTTP_${response.status}`);
        const result = await response.json() as EventDeliveryResult;
        this.database.execute("UPDATE cash_event_outbox SET status=?,sent_at=?,result_json=?,last_error_code=? WHERE event_id=?", [
          result.status === "requires_action" ? "requires_action" : "sent", this.now().toISOString(), JSON.stringify(result), result.code ?? null, row.event_id
        ]);
        const payload = event.payload as Partial<CashStockDeltaPayload>;
        if (payload.externalSaleKey && payload.externalLineKey) {
          this.database.execute("UPDATE cash_sale_lines SET delivery_status=?,updated_at=? WHERE external_sale_key=? AND external_line_key=?", [
            result.status === "requires_action" ? "requires_action" : "delivered", this.now().toISOString(), payload.externalSaleKey, payload.externalLineKey
          ]);
        }
        delivered += 1;
      } catch (error) {
        const attempts = this.database.query<{ attempt_count: number }>("SELECT attempt_count FROM cash_event_outbox WHERE event_id=?", [row.event_id])[0]?.attempt_count ?? 0;
        const delay = Math.min(15 * 60_000, 2 ** Math.min(attempts, 10) * 1000);
        this.database.execute("UPDATE cash_event_outbox SET status='failed',attempt_count=attempt_count+1,available_at=?,last_error_code=? WHERE event_id=?", [
          new Date(this.now().getTime() + delay).toISOString(), error instanceof Error ? error.message : "DELIVERY_FAILED", row.event_id
        ]);
      }
    }
    return delivered;
  }

  hasPendingWork() {
    return (this.database.query<{ count: number }>("SELECT count(*) count FROM cash_webhook_signals WHERE status='pending'")[0]?.count ?? 0) > 0;
  }

  private applySale(sale: NormalizedCashSale) {
    return this.database.transaction((db) => {
      const existing = db.query<{ revision_sha256: string }>("SELECT revision_sha256 FROM cash_sales WHERE external_key=?", [sale.key])[0];
      if (existing?.revision_sha256 === sale.revision) return false;
      const at = this.now().toISOString();
      const oldLines = new Map(db.query<{ external_line_key: string; emitted_package_milli: number; emitted_revenue_kopecks: number; mapped_product_id: string | null }>(
        "SELECT external_line_key,emitted_package_milli,emitted_revenue_kopecks,mapped_product_id FROM cash_sale_lines WHERE external_sale_key=?", [sale.key]).map((row) => [row.external_line_key, row]));
      db.execute(`INSERT INTO cash_sales(external_key,point_id,state,is_return,business_time,external_updated_at,total_kopecks,revision_sha256,raw_json,received_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET state=excluded.state,is_return=excluded.is_return,
        business_time=excluded.business_time,external_updated_at=excluded.external_updated_at,total_kopecks=excluded.total_kopecks,
        revision_sha256=excluded.revision_sha256,raw_json=excluded.raw_json,received_at=excluded.received_at,updated_at=excluded.updated_at`,
      [sale.key, sale.pointId, sale.state, sale.isReturn ? 1 : 0, sale.businessTime, sale.externalUpdatedAt, sale.totalKopecks, sale.revision, sale.raw, at, at]);
      for (const line of sale.lines) {
        db.execute(`INSERT INTO cash_external_items(nomenclature_uuid,name,first_seen_at,last_seen_at) VALUES (?,?,?,?)
          ON CONFLICT(nomenclature_uuid) DO UPDATE SET name=excluded.name,last_seen_at=excluded.last_seen_at`, [line.uuid, line.name, at, at]);
        this.applyLine(db, sale, line, oldLines.get(line.key), at);
        oldLines.delete(line.key);
      }
      for (const [key, old] of oldLines) {
        const mapping = old.mapped_product_id
          ? db.query<Mapping>("SELECT product_id,package_mass_grams,inventory_kind FROM cash_product_mappings WHERE product_id=? ORDER BY updated_at DESC LIMIT 1", [old.mapped_product_id])[0]
          : undefined;
        this.emitDelta(db, sale, { key, uuid: "", name: "", quantityMilli: 1, totalKopecks: 0, discountKopecks: 0, refused: true }, old, mapping, at);
        db.execute("UPDATE cash_sale_lines SET refused=1,emitted_package_milli=0,emitted_revenue_kopecks=0,delivery_status='not_applicable',updated_at=? WHERE external_sale_key=? AND external_line_key=?", [at, sale.key, key]);
      }
      return true;
    }, { mode: "immediate" });
  }

  private applyLine(db: DatabaseContext, sale: NormalizedCashSale, line: NormalizedCashLine, old: StoredLine | undefined, at: string, mappingOverride?: Mapping) {
    const mapping = mappingOverride ?? db.query<Mapping>("SELECT product_id,package_mass_grams,inventory_kind FROM cash_product_mappings WHERE nomenclature_uuid=?", [line.uuid])[0];
    const emitted = this.emitDelta(db, sale, line, old, mapping, at);
    db.execute(`INSERT INTO cash_sale_lines(external_sale_key,external_line_key,nomenclature_uuid,name,quantity_milli,total_kopecks,discount_kopecks,refused,mapped_product_id,emitted_package_milli,emitted_revenue_kopecks,delivery_status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?) ON CONFLICT(external_sale_key,external_line_key) DO UPDATE SET nomenclature_uuid=excluded.nomenclature_uuid,
      name=excluded.name,quantity_milli=excluded.quantity_milli,total_kopecks=excluded.total_kopecks,discount_kopecks=excluded.discount_kopecks,
      refused=excluded.refused,mapped_product_id=excluded.mapped_product_id,emitted_package_milli=excluded.emitted_package_milli,
      emitted_revenue_kopecks=excluded.emitted_revenue_kopecks,delivery_status=excluded.delivery_status,updated_at=excluded.updated_at`,
    [sale.key, line.key, line.uuid, line.name, line.quantityMilli, line.totalKopecks, line.discountKopecks, line.refused ? 1 : 0, mapping?.product_id ?? null, emitted.packageMilli, emitted.revenue, emitted.status, at]);
  }

  private emitDelta(db: DatabaseContext, sale: NormalizedCashSale, line: NormalizedCashLine, old: StoredLine | undefined, mapping: Mapping | undefined, at: string) {
    const applicable = sale.state === "completed" && !line.refused && Boolean(mapping);
    const packageMilli = !applicable ? 0 : mapping!.inventory_kind === "weight"
      ? Math.round(line.quantityMilli * 1000 / Number(mapping!.package_mass_grams))
      : line.quantityMilli;
    const desiredSigned = sale.isReturn ? -packageMilli : packageMilli;
    const oldSigned = old?.emitted_package_milli ?? 0;
    const delta = desiredSigned - oldSigned;
    const desiredRevenue = applicable ? (sale.isReturn ? -Math.abs(line.totalKopecks) : Math.abs(line.totalKopecks)) : 0;
    const revenueDelta = desiredRevenue - (old?.emitted_revenue_kopecks ?? 0);
    if (!mapping && sale.state === "completed" && !line.refused) {
      this.enqueue(db, "CashExceptionRaised", sale.key, { code: "UNMAPPED_PRODUCT", externalSaleKey: sale.key, externalLineKey: line.key }, at);
      return { packageMilli: 0, revenue: 0, status: "unmapped" as const };
    }
    if (!mapping) return { packageMilli: 0, revenue: 0, status: "not_applicable" as const };
    if (delta !== 0 || revenueDelta !== 0) {
      const isReturn = delta < 0;
      const payload: CashStockDeltaPayload = {
        externalSaleKey: sale.key, externalLineKey: line.key, revision: sale.revision, productId: mapping.product_id,
        quantityPackageMilli: Math.abs(delta), revenueDeltaKopecks: revenueDelta, isReturn
      };
      this.enqueue(db, isReturn ? "ReturnRecorded" : "SaleStockDelta", sale.key, payload, at);
    }
    return { packageMilli: desiredSigned, revenue: desiredRevenue, status: applicable ? "pending" as const : "not_applicable" as const };
  }

  private enqueue(db: DatabaseContext, eventType: CashEvent["eventType"], aggregateId: string, payload: object, at: string) {
    db.execute(`INSERT INTO cash_event_outbox(event_id,event_type,aggregate_id,payload_json,status,available_at,created_at)
      VALUES (?,?,?,?,'pending',?,?)`, [nanoid(), eventType, aggregateId, JSON.stringify(payload), at, at]);
  }

  private now() { return this.options.now?.() ?? new Date(); }
}
