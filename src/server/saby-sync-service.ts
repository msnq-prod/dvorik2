import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { DatabaseError, type DatabaseAdapter, type DatabaseContext } from "./database";
import { isObject, type SabyClient, type SabyOrder } from "./saby-client";

type NormalizedLine = Readonly<{
  key: string; uuid: string; name: string; barcode: string; article: string;
  quantityMilli: number; totalKopecks: number; discountKopecks: number; refused: boolean;
}>;
type NormalizedSale = Readonly<{
  key: string; saleId?: number; pointId: number; state: "completed" | "deleted" | "nonfiscal";
  isReturn: boolean; returnSaleKey?: string; businessTime: string; externalUpdatedAt: string;
  totalKopecks: number; revision: string; raw: string; lines: readonly NormalizedLine[];
}>;
type StoredLine = Readonly<{ key: string; uuid: string; appliedQuantityMilli: number }>;

export class SabyContractError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SabyContractError"; }
}

export class SabySyncService {
  constructor(
    private readonly database: DatabaseAdapter,
    private readonly client: Pick<SabyClient, "listOrders">,
    private readonly options: Readonly<{ pointId: number; timezone: string; overlapMinutes: number; initialLookbackHours: number; outboxMaxAttempts?: number; now?: () => Date }>
  ) {}

  recordWebhookSignal(payload: unknown) {
    const at = this.now().toISOString();
    const raw = canonicalJson(payload);
    const id = nanoid();
    this.database.transaction((db) => {
      db.execute("INSERT INTO saby_webhook_signals(id,payload_json,payload_sha256,status,attempt_count,received_at,updated_at) VALUES (?,?,?,'pending',0,?,?)", [id, raw, sha256(raw), at, at]);
    }, { mode: "immediate" });
    return { id, accepted: true } as const;
  }

  hasPendingSignal() {
    return (this.database.query<{ count: number }>("SELECT count(*) count FROM saby_webhook_signals WHERE status='pending'")[0]?.count ?? 0) > 0;
  }

  async synchronize(explicit?: Readonly<{ from: Date; to: Date }>) {
    const now = this.now();
    const state = this.database.query<{ cursor_updated_at: string | null }>("SELECT cursor_updated_at FROM saby_sync_state WHERE scope='retail_sales'")[0];
    const cursor = state?.cursor_updated_at ? parseSabyDateTime(state.cursor_updated_at, this.options.timezone) : undefined;
    const from = explicit?.from ?? new Date((cursor?.getTime() ?? now.getTime() - this.options.initialLookbackHours * 3_600_000) - this.options.overlapMinutes * 60_000);
    const to = explicit?.to ?? now;
    const runId = nanoid();
    const startedAt = now.toISOString();
    this.database.execute("INSERT INTO saby_reconciliation_runs(id,from_time,to_time,status,started_at) VALUES (?,?,?,'running',?)", [runId, from.toISOString(), to.toISOString(), startedAt]);
    try {
      const orders = await this.client.listOrders({ fromDateTime: formatSabyDateTime(from, this.options.timezone), toDateTime: formatSabyDateTime(to, this.options.timezone) });
      let changed = 0;
      let maxUpdated = state?.cursor_updated_at ?? "";
      for (const order of orders) {
        const normalized = normalizeSabyOrder(order, this.options.pointId);
        if (normalized.externalUpdatedAt > maxUpdated) maxUpdated = normalized.externalUpdatedAt;
        if (this.apply(normalized)) changed += 1;
      }
      const finishedAt = this.now().toISOString();
      this.database.transaction((db) => {
        db.execute("UPDATE saby_reconciliation_runs SET orders_seen=?,orders_changed=?,status='completed',completed_at=? WHERE id=?", [orders.length, changed, finishedAt, runId]);
        db.execute("UPDATE saby_sync_state SET cursor_updated_at=?,last_success_at=?,last_error_code=NULL,version=version+1,updated_at=? WHERE scope='retail_sales'", [maxUpdated || formatSabyDateTime(to, this.options.timezone), finishedAt, finishedAt]);
        db.execute("UPDATE saby_webhook_signals SET status='processed',processed_at=?,last_error_code=NULL,updated_at=? WHERE status IN ('pending','processing','failed')", [finishedAt, finishedAt]);
      }, { mode: "immediate" });
      return { runId, ordersSeen: orders.length, ordersChanged: changed, from: from.toISOString(), to: to.toISOString() } as const;
    } catch (error) {
      const code = error instanceof SabyContractError ? error.code : isObject(error) && typeof error.code === "string" ? error.code : "SABY_SYNC_FAILED";
      const failedAt = this.now().toISOString();
      this.database.transaction((db) => {
        db.execute("UPDATE saby_reconciliation_runs SET status='failed',error_code=?,completed_at=? WHERE id=?", [code, failedAt, runId]);
        db.execute("UPDATE saby_sync_state SET last_error_code=?,version=version+1,updated_at=? WHERE scope='retail_sales'", [code, failedAt]);
        db.execute("UPDATE saby_webhook_signals SET status='failed',attempt_count=attempt_count+1,last_error_code=?,updated_at=? WHERE status IN ('pending','processing')", [code, failedAt]);
      }, { mode: "immediate" });
      throw error;
    }
  }

  listMappings() {
    return this.database.query<Record<string, unknown>>(`SELECT i.nomenclature_uuid AS nomenclatureUuid,i.name,i.barcode,i.article,m.product_id AS productId,
      (SELECT count(*) FROM saby_sale_lines l WHERE l.nomenclature_uuid=i.nomenclature_uuid) AS occurrences
      FROM saby_external_items i LEFT JOIN saby_product_mappings m ON m.nomenclature_uuid=i.nomenclature_uuid
      ORDER BY (m.product_id IS NULL) DESC,i.last_seen_at DESC,i.nomenclature_uuid`);
  }

  status() {
    const state = this.database.query<Record<string, unknown>>("SELECT scope,cursor_updated_at AS cursorUpdatedAt,last_success_at AS lastSuccessAt,last_error_code AS lastErrorCode,version,updated_at AS updatedAt FROM saby_sync_state WHERE scope='retail_sales'")[0];
    const pendingSignals = this.database.query<{ count: number }>("SELECT count(*) count FROM saby_webhook_signals WHERE status IN ('pending','failed')")[0]?.count ?? 0;
    return { pendingSignals, state } as const;
  }

  saveMapping(input: Readonly<{ uuid: string; productId: string; actorId: string; idempotencyKey: string }>) {
    const at = this.now().toISOString();
    try {
      return this.database.transaction((db) => {
      const scope = "saby.mapping.save";
      const requestHash = sha256(canonicalJson({ uuid: input.uuid, productId: input.productId }));
      const existing = db.query<{ request_hash: string; status: string; response_json: string | null }>("SELECT request_hash,status,response_json FROM idempotency_keys WHERE scope=? AND key=?", [scope, input.idempotencyKey])[0];
      if (existing) {
        if (existing.request_hash !== requestHash) throw new SabyContractError("IDEMPOTENCY_CONFLICT");
        if (existing.status !== "completed" || !existing.response_json) throw new SabyContractError("IDEMPOTENCY_IN_PROGRESS");
        const replay = JSON.parse(existing.response_json) as { value: { nomenclatureUuid: string; productId: string } };
        return replay.value;
      }
      db.execute("INSERT INTO idempotency_keys(scope,key,request_hash,status,created_at,version,updated_at) VALUES (?,?,?,'processing',?,0,?)", [scope, input.idempotencyKey, requestHash, at, at]);
      if (!db.query("SELECT id FROM products WHERE id=? AND status='active'", [input.productId]).length) throw new SabyContractError("PRODUCT_NOT_FOUND");
      if (!db.query("SELECT nomenclature_uuid FROM saby_external_items WHERE nomenclature_uuid=?", [input.uuid]).length) throw new SabyContractError("SABY_ITEM_NOT_FOUND");
      db.execute(`INSERT INTO saby_product_mappings(nomenclature_uuid,product_id,created_by_user_id,created_at,version,updated_at) VALUES (?,?,?,?,0,?)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET product_id=excluded.product_id,created_by_user_id=excluded.created_by_user_id,version=version+1,updated_at=excluded.updated_at`, [input.uuid, input.productId, input.actorId, at, at]);
      db.execute("INSERT INTO product_aliases(id,product_id,alias,normalized_alias,source,created_at) SELECT ?,?,name,dvorik_normalize_search(name),'saby',? FROM saby_external_items WHERE nomenclature_uuid=? AND name<>'' ON CONFLICT DO NOTHING", [nanoid(), input.productId, at, input.uuid]);
      this.audit(db, input.actorId, "saby_mapping", input.uuid, "upsert", { productId: input.productId }, at);
      this.reapplyUuid(db, input.uuid, at);
      const response = { nomenclatureUuid: input.uuid, productId: input.productId } as const;
      db.execute("UPDATE idempotency_keys SET status='completed',response_status=200,response_json=?,completed_at=?,expires_at=?,version=version+1,updated_at=? WHERE scope=? AND key=?", [JSON.stringify({ schemaVersion: 1, value: response }), at, new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), at, scope, input.idempotencyKey]);
      return response;
      }, { mode: "immediate" });
    } catch (error) {
      if (error instanceof DatabaseError && error.causeCode) throw new SabyContractError(error.causeCode.startsWith("SQLITE_CONSTRAINT") ? "SABY_MAPPING_CONFLICT" : error.causeCode);
      throw error;
    }
  }

  retryQueuedStock() {
    const at = this.now().toISOString();
    return this.database.transaction((db) => {
      const uuids = db.query<{ nomenclature_uuid: string }>("SELECT DISTINCT nomenclature_uuid FROM saby_sale_lines WHERE stock_status IN ('queued_inventory','blocked_negative','unmapped')");
      for (const row of uuids) this.reapplyUuid(db, row.nomenclature_uuid, at);
      return uuids.length;
    }, { mode: "immediate" });
  }

  private apply(sale: NormalizedSale) {
    return this.database.transaction((db) => {
      const existing = db.query<{ revision_sha256: string; total_kopecks: number; state: string }>("SELECT revision_sha256,total_kopecks,state FROM saby_sales WHERE external_key=?", [sale.key])[0];
      if (existing?.revision_sha256 === sale.revision) return false;
      const at = this.now().toISOString();
      const oldLines = db.query<{ external_line_key: string; nomenclature_uuid: string; applied_quantity_milli: number }>("SELECT external_line_key,nomenclature_uuid,applied_quantity_milli FROM saby_sale_lines WHERE external_sale_key=?", [sale.key])
        .map((row): StoredLine => ({ key: row.external_line_key, uuid: row.nomenclature_uuid, appliedQuantityMilli: row.applied_quantity_milli }));
      for (const line of sale.lines) db.execute(`INSERT INTO saby_external_items(nomenclature_uuid,name,barcode,article,first_seen_at,last_seen_at,version) VALUES (?,?,?,?,?,?,0)
        ON CONFLICT(nomenclature_uuid) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,article=excluded.article,last_seen_at=excluded.last_seen_at,version=version+1`, [line.uuid, line.name, line.barcode, line.article, at, at]);
      db.execute(`INSERT INTO saby_sales(external_key,external_sale_id,point_id,state,is_return,return_sale_key,business_time,external_updated_at,total_kopecks,revision_sha256,raw_json,received_at,version,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(external_key) DO UPDATE SET external_sale_id=excluded.external_sale_id,point_id=excluded.point_id,state=excluded.state,is_return=excluded.is_return,return_sale_key=excluded.return_sale_key,business_time=excluded.business_time,external_updated_at=excluded.external_updated_at,total_kopecks=excluded.total_kopecks,revision_sha256=excluded.revision_sha256,raw_json=excluded.raw_json,received_at=excluded.received_at,version=version+1,updated_at=excluded.updated_at`,
      [sale.key, sale.saleId ?? null, sale.pointId, sale.state, sale.isReturn ? 1 : 0, sale.returnSaleKey ?? null, sale.businessTime, sale.externalUpdatedAt, sale.totalKopecks, sale.revision, sale.raw, at, at]);
      const oldRevenue = existing?.state === "completed" ? existing.total_kopecks : 0;
      const revenueDelta = sale.totalKopecks - oldRevenue;
      db.execute("INSERT INTO saby_sale_deltas(id,external_sale_key,revision_sha256,revenue_delta_kopecks,reason,created_at) VALUES (?,?,?,?,?,?)", [nanoid(), sale.key, sale.revision, revenueDelta, !existing ? (sale.isReturn ? "return" : "initial") : sale.state === "deleted" ? "deleted" : sale.state === "nonfiscal" ? "nonfiscal" : "revision", at]);
      const newByKey = new Map(sale.lines.map((line) => [line.key, line]));
      for (const old of oldLines) if (!newByKey.has(old.key)) this.applyLine(db, sale, { key: old.key, uuid: old.uuid, name: "", barcode: "", article: "", quantityMilli: 1, totalKopecks: 0, discountKopecks: 0, refused: true }, old.appliedQuantityMilli, at, true);
      for (const line of sale.lines) this.applyLine(db, sale, line, oldLines.find((old) => old.key === line.key)?.appliedQuantityMilli ?? 0, at, false);
      db.execute("UPDATE saby_sales SET applied_at=? WHERE external_key=?", [at, sale.key]);
      this.audit(db, undefined, "saby_sale", sale.key, existing ? "revise" : "ingest", { state: sale.state, revision: sale.revision, revenueDeltaKopecks: revenueDelta }, at);
      return true;
    }, { mode: "immediate" });
  }

  private applyLine(db: DatabaseContext, sale: NormalizedSale, line: NormalizedLine, alreadyApplied: number, at: string, removed: boolean) {
    const mapping = db.query<{ product_id: string; inventory_kind: string }>("SELECT m.product_id,p.inventory_kind FROM saby_product_mappings m JOIN products p ON p.id=m.product_id WHERE m.nomenclature_uuid=? AND p.status='active'", [line.uuid])[0];
    const inventoryOpen = db.query<{ id: string }>("SELECT id FROM inventory_sessions WHERE status IN ('active','closing') LIMIT 1").length > 0;
    let status: "not_applicable" | "unmapped" | "queued_inventory" | "blocked_negative" | "applied" = removed || line.refused || sale.state !== "completed" ? "not_applicable" : !mapping ? "unmapped" : mapping.inventory_kind !== "piece" ? "not_applicable" : inventoryOpen ? "queued_inventory" : "applied";
    const desired = status === "applied" ? (sale.isReturn ? line.quantityMilli : -line.quantityMilli) : 0;
    const delta = desired - alreadyApplied;
    let applied = alreadyApplied;
    if (mapping && delta !== 0 && status !== "queued_inventory") {
      const balance = db.query<{ quantity_minor: number; version: number }>("SELECT quantity_minor,version FROM inventory_balances WHERE product_id=?", [mapping.product_id])[0];
      const current = balance?.quantity_minor ?? 0;
      if (current + delta < 0) status = "blocked_negative";
      else {
        if (balance) db.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [current + delta, at, mapping.product_id, balance.version]);
        else db.execute("INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES (?,?,0,?)", [mapping.product_id, delta, at]);
        applied = desired;
        db.execute("INSERT INTO stock_operations(id,type,product_id,quantity,quantity_minor,actor_id,reason,idempotency_key,metadata_json,created_at) VALUES (?,?,?,?,?,'system-saby',?,?,?,?)", [nanoid(), delta < 0 ? "write_off" : "correction", mapping.product_id, Math.abs(delta) / 1000, Math.abs(delta), `Saby ${sale.isReturn ? "return" : "sale"} ${sale.key}`, `saby:${sale.key}:${line.key}:${sale.revision}`, JSON.stringify({ schemaVersion: 1, value: { source: "saby", externalSaleKey: sale.key, externalLineKey: line.key, deltaMilli: delta } }), at]);
      }
    }
    db.execute(`INSERT INTO saby_sale_lines(external_sale_key,external_line_key,nomenclature_uuid,name,barcode,article,quantity_milli,total_kopecks,discount_kopecks,refused,stock_status,applied_quantity_milli,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(external_sale_key,external_line_key) DO UPDATE SET nomenclature_uuid=excluded.nomenclature_uuid,name=excluded.name,barcode=excluded.barcode,article=excluded.article,quantity_milli=excluded.quantity_milli,total_kopecks=excluded.total_kopecks,discount_kopecks=excluded.discount_kopecks,refused=excluded.refused,stock_status=excluded.stock_status,applied_quantity_milli=excluded.applied_quantity_milli,updated_at=excluded.updated_at`,
    [sale.key, line.key, line.uuid, line.name, line.barcode, line.article, line.quantityMilli, line.totalKopecks, line.discountKopecks, removed || line.refused ? 1 : 0, status, applied, at]);
    if (status === "unmapped" || status === "blocked_negative") this.notifyManagers(db, status === "unmapped" ? "saby.mapping_required" : "saby.negative_stock", `${sale.key}:${line.key}:${status}`, { saleKey: sale.key, lineKey: line.key, nomenclatureUuid: line.uuid, productId: mapping?.product_id ?? null }, at);
  }

  private reapplyUuid(db: DatabaseContext, uuid: string, at: string) {
    const rows = db.query<{ external_sale_key: string }>("SELECT DISTINCT external_sale_key FROM saby_sale_lines WHERE nomenclature_uuid=? ORDER BY external_sale_key", [uuid]);
    for (const row of rows) {
      const saleRow = db.query<Record<string, unknown>>("SELECT * FROM saby_sales WHERE external_key=?", [row.external_sale_key])[0];
      const lines = db.query<Record<string, unknown>>("SELECT * FROM saby_sale_lines WHERE external_sale_key=? AND nomenclature_uuid=?", [row.external_sale_key, uuid]);
      if (!saleRow) continue;
      const sale = storedSale(saleRow);
      for (const raw of lines) {
        const line = storedNormalizedLine(raw);
        this.applyLine(db, sale, line, Number(raw.applied_quantity_milli), at, Boolean(raw.refused));
      }
    }
  }

  private notifyManagers(db: DatabaseContext, type: string, key: string, value: Record<string, unknown>, at: string) {
    const users = db.query<{ id: string }>("SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.status='active' AND ur.role_id IN ('admin','super_admin')");
    for (const user of users) {
      const payload = JSON.stringify({ schemaVersion: 1, value: { schemaVersion: 1, eventType: type, ...value } });
      db.execute("INSERT INTO webapp_notifications(id,recipient_user_id,type,payload_json,is_read,created_at,version,updated_at) VALUES (?,?,?,?,0,?,0,?)", [nanoid(), user.id, type, payload, at, at]);
      db.execute("INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,idempotency_key,attempt_count,max_attempts,available_at,created_at,version,updated_at) VALUES (?,'telegram',?,?,?,'pending',?,0,?,?,?,0,?) ON CONFLICT DO NOTHING", [nanoid(), user.id, type, payload, `saby:${key}:${user.id}`, this.options.outboxMaxAttempts ?? 8, at, at, at]);
    }
  }

  private audit(db: DatabaseContext, actorId: string | undefined, entity: string, entityId: string, action: string, value: Record<string, unknown>, at: string) {
    db.execute("INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,changes_json,request_id,created_at,version,updated_at) VALUES (?,?,?,?,?,?,?,?,0,?)", [nanoid(), actorId ?? null, entity, entityId, action, JSON.stringify({ schemaVersion: 1, value }), `saby:${entityId}:${action}`, at, at]);
  }

  private now() { return this.options.now?.() ?? new Date(); }
}

export function normalizeSabyOrder(order: SabyOrder, pointId: number): NormalizedSale {
  const key = text(order.Key) || (integer(order.Sale) !== undefined ? String(integer(order.Sale)) : "");
  if (!key) throw new SabyContractError("SABY_ORDER_KEY_MISSING");
  const deleted = order.Deleted === true;
  const payments = Array.isArray(order.Payments) ? order.Payments.filter(isObject) : [];
  const fiscal = payments.some((payment) => payment.Nonfiscal !== true && Boolean(text(payment.ClosedWTZ) || text(payment.CarriedWTZ) || text(payment.FiscalNumber)));
  const state: NormalizedSale["state"] = deleted ? "deleted" : fiscal ? "completed" : "nonfiscal";
  const isReturn = order.Return === true;
  const total = money(order.TotalPrice);
  const linesRaw = Array.isArray(order.SaleNomenclatures) ? order.SaleNomenclatures.filter(isObject) : [];
  const lines = linesRaw.flatMap((line, index): NormalizedLine[] => {
    const uuid = text(line.NomenclatureUUID);
    if (!uuid) return [];
    const quantityMilli = quantity(line.Quantity);
    if (quantityMilli <= 0) return [];
    return [{ key: text(line.Key) || `${uuid}:${integer(line.Number) ?? index}`, uuid, name: text(line.Name) || text(line.ShortName), barcode: text(line.Barcode), article: text(line.NomenclatureNumber), quantityMilli, totalKopecks: money(line.TotalPrice), discountKopecks: money(line.TotalDiscount), refused: line.Refused === true }];
  });
  const businessTime = text(order.ClosedWTZ) || text(order.DateWTZ);
  const externalUpdatedAt = text(order.Updated) || businessTime;
  if (!businessTime || !externalUpdatedAt) throw new SabyContractError("SABY_ORDER_TIME_MISSING");
  const normalized = { key, saleId: integer(order.Sale), pointId, state, isReturn, returnSaleKey: text(order.ReturnSaleKey) || undefined, businessTime, externalUpdatedAt, totalKopecks: state === "completed" ? (isReturn ? -Math.abs(total) : Math.abs(total)) : 0, lines };
  const raw = canonicalJson(order);
  return { ...normalized, revision: sha256(canonicalJson(normalized)), raw };
}

function storedSale(row: Record<string, unknown>): NormalizedSale {
  return { key: String(row.external_key), saleId: row.external_sale_id === null ? undefined : Number(row.external_sale_id), pointId: Number(row.point_id), state: row.state as NormalizedSale["state"], isReturn: Boolean(row.is_return), returnSaleKey: row.return_sale_key === null ? undefined : String(row.return_sale_key), businessTime: String(row.business_time), externalUpdatedAt: String(row.external_updated_at), totalKopecks: Number(row.total_kopecks), revision: String(row.revision_sha256), raw: String(row.raw_json), lines: [] };
}
function storedNormalizedLine(row: Record<string, unknown>): NormalizedLine {
  return { key: String(row.external_line_key), uuid: String(row.nomenclature_uuid), name: String(row.name), barcode: String(row.barcode), article: String(row.article), quantityMilli: Number(row.quantity_milli), totalKopecks: Number(row.total_kopecks), discountKopecks: Number(row.discount_kopecks), refused: Boolean(row.refused) };
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function integer(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined; }
function money(value: unknown) { if (typeof value !== "number" || !Number.isFinite(value)) return 0; return Math.round((value + Number.EPSILON) * 100); }
function quantity(value: unknown) { if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0; const result = Math.round((value + Number.EPSILON) * 1000); if (Math.abs(result / 1000 - value) > 1e-9) throw new SabyContractError("SABY_QUANTITY_PRECISION"); return result; }
function sha256(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value: unknown): string { return JSON.stringify(sortJson(value)); }
function sortJson(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortJson); if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])])); return value ?? null; }

export function formatSabyDateTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function parseSabyDateTime(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new SabyContractError("SABY_BAD_DATETIME");
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  let candidate = wall;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const formatted = formatSabyDateTime(new Date(candidate), timezone);
    const seen = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(formatted)!;
    const seenWall = Date.UTC(Number(seen[1]), Number(seen[2]) - 1, Number(seen[3]), Number(seen[4]), Number(seen[5]), Number(seen[6]));
    candidate += wall - seenWall;
  }
  return new Date(candidate);
}
