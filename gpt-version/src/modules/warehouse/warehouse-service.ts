import { nanoid } from "nanoid";
import type { CashStockDeltaPayload, DomainEventEnvelope, EventDeliveryResult, WarehouseProfitabilityUpdatedPayload } from "../../contracts/events";
import type { ProductProfitability } from "../../contracts/cash";
import type { DatabaseAdapter, DatabaseContext } from "../../server/database";
import { validateScan, type ScanFormat } from "../../warehouse/scan-contract";

export type AcceptSupplyCommand = Readonly<{
  id?: string;
  supplierId: string;
  invoiceNumber?: string;
  deliveredAt: string;
  actorId: string;
  idempotencyKey?: string;
  lines: readonly Readonly<{
    productId: string;
    packageCount: number;
    packageMassGrams?: number;
    purchaseCostKopecks: number;
    allocatedDeliveryCostKopecks?: number;
  }>[];
}>;

export type ConsumeLotsCommand = Readonly<{
  eventId: string;
  productId: string;
  quantityPackageMilli: number;
  externalReference: string;
  occurredAt: string;
}>;

export type SupplyResult = Readonly<{ supplyId: string; lotIds: string[] }>;
export type OpeningLotCommand = Readonly<{
  id?: string;
  productId: string;
  packageCount: number;
  packageMassGrams?: number;
  totalCostKopecks: number;
  observedAccountingQuantityMinor: number;
  actorId: string;
  recordedAt: string;
  idempotencyKey?: string;
}>;
export type WarehouseReconciliationRow = Readonly<{
  productId: string;
  accountingQuantityMinor: number;
  fifoQuantityMinor: number;
  difference: number;
}>;
export type WarehouseWriteOffCommand = Readonly<{ productId: string; quantityPackageMilli: number; reason: string; actorId: string; occurredAt?: string; idempotencyKey?: string }>;
export type WarehouseAdjustmentCommand = Readonly<{ productId: string; deltaPackageMilli: number; totalCostKopecks?: number; reason: string; actorId: string; occurredAt?: string; idempotencyKey?: string }>;
export type SupplyDraftRowInput = Readonly<{ sourceName: string; sourceArticle?: string; packageCount?: number; packageMassGrams?: number; purchaseCostKopecks?: number }>;
export type SupplyDraftLineInput = Readonly<{ id?: string; productId: string; packageCount: number; packageMassGrams: number; purchaseCostKopecks: number }>;
export type SupplyDraftCommand = Readonly<{ supplierId: string; deliveryCostKopecks: number; fileName: string; actorId: string; rows: readonly SupplyDraftRowInput[] }>;
export type PriceCategoryCommand = Readonly<{ name: string; inventoryKind: "piece" | "weight"; actorId: string }>;
export type CreateWarehouseProductCommand = Readonly<{
  officialName: string;
  localName?: string;
  article?: string;
  supplierId?: string;
  inventoryKind: "piece" | "weight";
  packageMassGrams: number;
  actorId: string;
}>;

type LotRow = Readonly<{
  id: string;
  received_package_milli: number;
  remaining_package_milli: number;
  total_cost_kopecks: number;
  received_at: string;
  package_mass_grams: number | null;
  allocated_cost_kopecks: number;
}>;

export class WarehouseService {
  constructor(private readonly database: DatabaseAdapter, private readonly now: () => string = () => new Date().toISOString()) {}

  resolveScan(input: Readonly<{ rawValue: string; format: ScanFormat }>) {
    const validation = validateScan(input.rawValue, input.format);
    if (!validation.ok) throw new Error(validation.code);
    const row = this.database.query<{ product_id: string }>("SELECT product_id FROM warehouse_product_identifiers WHERE format=? AND canonical_value=?", [input.format, validation.canonical])[0];
    if (!row) throw new Error("LINEAR_NOT_FOUND");
    const product = this.catalog().find((item) => item.id === row.product_id);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    return { product, balances: this.balances().filter((balance) => balance.productId === product.id) };
  }


  acceptSupply(command: AcceptSupplyCommand): SupplyResult {
    if (!command.lines.length) throw new Error("SUPPLY_LINES_REQUIRED");
    if (!command.supplierId || !command.actorId || !command.deliveredAt) throw new Error("SUPPLY_FIELDS_REQUIRED");
    return this.idempotent("supply", command.idempotencyKey, command, (db) => {
      this.ensureActor(db, command.actorId);
      if (!db.query("SELECT id FROM suppliers WHERE id=?", [command.supplierId]).length) throw new Error("SUPPLIER_NOT_FOUND");
      const at = this.now();
      const supplyId = command.id ?? nanoid();
      db.execute(`INSERT INTO supplies(id,supplier_id,invoice_number,delivered_at,status,accepted_by_user_id,accepted_at,created_at,updated_at)
        VALUES (?,?,?,?,'accepted',?,?,?,?)`, [supplyId, command.supplierId, command.invoiceNumber?.trim() ?? "", command.deliveredAt, command.actorId, at, at, at]);
      const lotIds: string[] = [];
      for (const line of command.lines) {
        const product = this.validateSupplyLine(db, line);
        const lineId = nanoid();
        const lotId = nanoid();
        const deliveryCost = line.allocatedDeliveryCostKopecks ?? 0;
        db.execute(`INSERT INTO supply_lines(id,supply_id,product_id,package_count,package_mass_grams,purchase_cost_kopecks,allocated_delivery_cost_kopecks,created_at)
          VALUES (?,?,?,?,?,?,?,?)`, [lineId, supplyId, line.productId, line.packageCount, line.packageMassGrams ?? null, line.purchaseCostKopecks, deliveryCost, at]);
        const packageMilli = line.packageCount * 1000;
        db.execute(`INSERT INTO inventory_lots(id,supply_line_id,product_id,received_package_milli,remaining_package_milli,package_mass_grams,total_cost_kopecks,received_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [lotId, lineId, line.productId, packageMilli, packageMilli, line.packageMassGrams ?? null, line.purchaseCostKopecks + deliveryCost, command.deliveredAt, at, at]);
        this.incrementAccountingBalance(db, line.productId, product.inventory_kind === "weight"
          ? line.packageCount * Number(line.packageMassGrams)
          : packageMilli, at);
        this.writeOutbox(db, {
          eventId:nanoid(),eventType:"StockChanged",eventVersion:1,producer:"warehouse",aggregateId:line.productId,occurredAt:at,
          payload:{productId:line.productId,quantityPackageMilliDelta:packageMilli,accountingQuantityMinorDelta:product.inventory_kind==="weight"?line.packageCount*Number(line.packageMassGrams):packageMilli,reason:"supply"}
        });
        lotIds.push(lotId);
      }
      this.writeOutbox(db, {
        eventId: nanoid(), eventType: "SupplyAccepted", eventVersion: 1, producer: "warehouse",
        aggregateId: supplyId, occurredAt: at, payload: { supplyId, lotIds }
      });
      return { supplyId, lotIds };
    });
  }

  registerOpeningLot(command: OpeningLotCommand): SupplyResult {
    if (!command.productId || !command.actorId || !command.recordedAt) throw new Error("OPENING_LOT_FIELDS_REQUIRED");
    if (!Number.isSafeInteger(command.packageCount) || command.packageCount <= 0 || !Number.isSafeInteger(command.totalCostKopecks) || command.totalCostKopecks < 0) throw new Error("OPENING_LOT_VALUES_INVALID");
    return this.idempotent("opening-lot", command.idempotencyKey, command, (db) => {
      this.ensureActor(db, command.actorId);
      const product = db.query<{ inventory_kind: "piece" | "weight" }>("SELECT inventory_kind FROM products WHERE id=? AND status='active'", [command.productId])[0];
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      if (product.inventory_kind === "weight" && (!Number.isSafeInteger(command.packageMassGrams) || Number(command.packageMassGrams) <= 0)) throw new Error("PACKAGE_MASS_REQUIRED");
      const expectedQuantity = product.inventory_kind === "weight" ? command.packageCount * Number(command.packageMassGrams) : command.packageCount * 1000;
      const actualQuantity = db.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?", [command.productId])[0]?.quantity_minor ?? 0;
      if (command.observedAccountingQuantityMinor !== actualQuantity || expectedQuantity !== actualQuantity) throw new Error("OPENING_BALANCE_MISMATCH");
      if (db.query("SELECT id FROM inventory_lots WHERE product_id=? LIMIT 1", [command.productId]).length) throw new Error("OPENING_LOT_ALREADY_EXISTS");
      const at = this.now();
      const supplyId = command.id ?? nanoid();
      const lineId = nanoid();
      const lotId = nanoid();
      db.execute("INSERT OR IGNORE INTO suppliers(id,name,status,created_at,updated_at) VALUES ('warehouse-opening-balance','Начальные остатки склада','active',?,?)", [at, at]);
      db.execute(`INSERT INTO supplies(id,supplier_id,invoice_number,delivered_at,status,accepted_by_user_id,accepted_at,created_at,updated_at)
        VALUES (?,'warehouse-opening-balance',?,?,'accepted',?,?,?,?)`, [supplyId, `OPENING:${command.productId}`, command.recordedAt, command.actorId, at, at, at]);
      const packageMilli = command.packageCount * 1000;
      db.execute(`INSERT INTO supply_lines(id,supply_id,product_id,package_count,package_mass_grams,purchase_cost_kopecks,allocated_delivery_cost_kopecks,created_at)
        VALUES (?,?,?,?,?,?,0,?)`, [lineId, supplyId, command.productId, command.packageCount, command.packageMassGrams ?? null, command.totalCostKopecks, at]);
      db.execute(`INSERT INTO inventory_lots(id,supply_line_id,product_id,received_package_milli,remaining_package_milli,package_mass_grams,total_cost_kopecks,received_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [lotId, lineId, command.productId, packageMilli, packageMilli, command.packageMassGrams ?? null, command.totalCostKopecks, command.recordedAt, at, at]);
      this.writeOutbox(db, { eventId: nanoid(), eventType: "SupplyAccepted", eventVersion: 1, producer: "warehouse", aggregateId: supplyId, occurredAt: at, payload: { supplyId, lotIds: [lotId] } });
      this.writeOutbox(db, { eventId:nanoid(),eventType:"StockChanged",eventVersion:1,producer:"warehouse",aggregateId:command.productId,occurredAt:at,payload:{productId:command.productId,quantityPackageMilliDelta:packageMilli,accountingQuantityMinorDelta:expectedQuantity,reason:"supply"} });
      return { supplyId, lotIds: [lotId] };
    });
  }

  writeOff(command: WarehouseWriteOffCommand) {
    if (!command.productId || !command.actorId || !command.reason.trim() || !Number.isSafeInteger(command.quantityPackageMilli) || command.quantityPackageMilli <= 0) throw new Error("WAREHOUSE_WRITE_OFF_INVALID");
    return this.idempotent("write-off", command.idempotencyKey, command, (db) => {
      this.ensureActor(db, command.actorId);
      const occurredAt = command.occurredAt ?? this.now();
      const eventId = nanoid();
      const accountingBefore = db.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?", [command.productId])[0]?.quantity_minor ?? 0;
      const costKopecks = this.consumeLotsInTransaction(db, { eventId, productId: command.productId, quantityPackageMilli: command.quantityPackageMilli, externalReference: `write-off:${command.actorId}:${command.reason.trim()}`, occurredAt });
      const accountingAfter = db.query<{ quantity_minor: number }>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?", [command.productId])[0]?.quantity_minor ?? 0;
      const accountingDelta = accountingBefore - accountingAfter;
      this.writeOutbox(db, { eventId: nanoid(), eventType: "StockChanged", eventVersion: 1, producer: "warehouse", aggregateId: command.productId, occurredAt, payload: { productId: command.productId, quantityPackageMilliDelta: -command.quantityPackageMilli, accountingQuantityMinorDelta: -accountingDelta, reason: "write_off" } });
      this.writeOutbox(db, { eventId: nanoid(), eventType: "LotConsumed", eventVersion: 1, producer: "warehouse", aggregateId: command.productId, occurredAt, payload: { productId: command.productId, sourceEventId: eventId, quantityPackageMilli: command.quantityPackageMilli, costKopecks } });
      this.writeOutbox(db, { eventId: nanoid(), eventType: "CostRecognized", eventVersion: 1, producer: "warehouse", aggregateId: command.productId, occurredAt, payload: { productId: command.productId, sourceEventId: eventId, costDeltaKopecks: costKopecks } });
      return { eventId, costKopecks };
    });
  }

  adjust(command: WarehouseAdjustmentCommand) {
    if (!command.productId || !command.actorId || !command.reason.trim() || !Number.isSafeInteger(command.deltaPackageMilli) || command.deltaPackageMilli === 0) throw new Error("WAREHOUSE_ADJUSTMENT_INVALID");
    const occurredAt = command.occurredAt ?? this.now();
    if (command.deltaPackageMilli < 0) return this.writeOff({ productId: command.productId, quantityPackageMilli: -command.deltaPackageMilli, reason: `adjustment:${command.reason.trim()}`, actorId: command.actorId, occurredAt, idempotencyKey: command.idempotencyKey });
    if (!Number.isSafeInteger(command.totalCostKopecks) || Number(command.totalCostKopecks) < 0) throw new Error("ADJUSTMENT_COST_REQUIRED");
    const product = this.database.query<{ inventory_kind: "piece" | "weight"; package_mass_grams: number | null }>("SELECT inventory_kind,package_mass_grams FROM products WHERE id=? AND status='active'", [command.productId])[0];
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (command.deltaPackageMilli % 1000 !== 0) throw new Error("POSITIVE_ADJUSTMENT_REQUIRES_WHOLE_PACKAGES");
    return this.acceptSupply({ supplierId: this.adjustmentSupplier(occurredAt), invoiceNumber: `ADJUSTMENT:${nanoid()}`, deliveredAt: occurredAt, actorId: command.actorId, idempotencyKey: command.idempotencyKey, lines: [{ productId: command.productId, packageCount: command.deltaPackageMilli / 1000, ...(product.inventory_kind === "weight" ? { packageMassGrams: Number(product.package_mass_grams) } : {}), purchaseCostKopecks: Number(command.totalCostKopecks) }] });
  }

  applyCashEvent(event: DomainEventEnvelope<string, CashStockDeltaPayload>): EventDeliveryResult {
    return this.database.transaction((db) => {
      const existing = db.query<{ status: string; result_code: string | null }>("SELECT status,result_code FROM integration_inbox WHERE event_id=?", [event.eventId])[0];
      if (existing) return { eventId: event.eventId, status: existing.status === "requires_action" ? "requires_action" : "duplicate", ...(existing.result_code ? { code: existing.result_code } : {}) };
      db.execute(`INSERT INTO integration_inbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,received_at)
        VALUES (?,?,?,?,?,?, 'processing',?)`, [event.eventId, event.producer, event.eventType, event.eventVersion, event.aggregateId, JSON.stringify(event.payload), this.now()]);
      try {
        this.assertProductReconciled(db, event.payload.productId);
        const isReturn = event.eventType === "ReturnRecorded" || event.payload.isReturn;
        const accountingBefore=db.query<{quantity_minor:number}>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?",[event.payload.productId])[0]?.quantity_minor??0;
        const cost = isReturn ? this.returnToLatestLot(db, {
          eventId: event.eventId, productId: event.payload.productId, quantityPackageMilli: Math.abs(event.payload.quantityPackageMilli),
          externalReference: this.saleLineReference(event.payload), occurredAt: event.occurredAt
        }) : this.consumeLotsInTransaction(db, {
          eventId: event.eventId, productId: event.payload.productId, quantityPackageMilli: Math.abs(event.payload.quantityPackageMilli),
          externalReference: this.saleLineReference(event.payload), occurredAt: event.occurredAt
        });
        const projection = this.updateProfitability(db, event.payload.productId, event.payload.revenueDeltaKopecks, isReturn ? -cost : cost, event.occurredAt);
        const accountingAfter=db.query<{quantity_minor:number}>("SELECT quantity_minor FROM inventory_balances WHERE product_id=?",[event.payload.productId])[0]?.quantity_minor??0;
        const accountingDelta=Math.abs(accountingAfter-accountingBefore);
        this.writeOutbox(db,{eventId:nanoid(),eventType:"StockChanged",eventVersion:1,producer:"warehouse",aggregateId:event.payload.productId,occurredAt:event.occurredAt,payload:{productId:event.payload.productId,quantityPackageMilliDelta:(isReturn?1:-1)*Math.abs(event.payload.quantityPackageMilli),accountingQuantityMinorDelta:(isReturn?1:-1)*accountingDelta,reason:isReturn?"return":"sale"}});
        if(!isReturn)this.writeOutbox(db,{eventId:nanoid(),eventType:"LotConsumed",eventVersion:1,producer:"warehouse",aggregateId:event.payload.productId,occurredAt:event.occurredAt,payload:{productId:event.payload.productId,sourceEventId:event.eventId,quantityPackageMilli:Math.abs(event.payload.quantityPackageMilli),costKopecks:cost}});
        this.writeOutbox(db,{eventId:nanoid(),eventType:"CostRecognized",eventVersion:1,producer:"warehouse",aggregateId:event.payload.productId,occurredAt:event.occurredAt,payload:{productId:event.payload.productId,sourceEventId:event.eventId,costDeltaKopecks:isReturn?-cost:cost}});
        this.writeOutbox(db, {
          eventId: nanoid(), eventType: "ProductProfitabilityUpdated", eventVersion: 1, producer: "warehouse",
          aggregateId: event.payload.productId, occurredAt: event.occurredAt, payload: projection
        });
        db.execute("UPDATE integration_inbox SET status='applied',completed_at=? WHERE event_id=?", [this.now(), event.eventId]);
        return { eventId: event.eventId, status: "applied" };
      } catch (error) {
        const code = error instanceof Error ? error.message : "WAREHOUSE_EVENT_FAILED";
        if (!["NEGATIVE_STOCK", "COST_BASIS_MISSING", "WAREHOUSE_CUTOVER_REQUIRED"].includes(code)) throw error;
        db.execute("UPDATE integration_inbox SET status='requires_action',result_code=?,completed_at=? WHERE event_id=?", [code, this.now(), event.eventId]);
        return { eventId: event.eventId, status: "requires_action", code };
      }
    }, { mode: "immediate" });
  }

  profitability(productId: string, cashAvailable: boolean): ProductProfitability {
    const price = this.database.query<{ price_kopecks: number; price_unit: "piece" | "kilogram" }>(`SELECT price_kopecks,price_unit FROM product_price_history
      WHERE (product_id=? OR group_id=(SELECT group_id FROM products WHERE id=?)) AND effective_from<=?
      ORDER BY CASE WHEN product_id=? THEN 0 ELSE 1 END,effective_from DESC,id DESC LIMIT 1`, [productId, productId, this.now(), productId])[0];
    const product = this.database.query<{ package_mass_grams: number | null }>("SELECT package_mass_grams FROM products WHERE id=?", [productId])[0];
    const lots = this.database.query<{ remaining_package_milli: number; total_cost_kopecks: number; received_package_milli: number }>(
      "SELECT remaining_package_milli,total_cost_kopecks,received_package_milli FROM inventory_lots WHERE product_id=? AND remaining_package_milli>0", [productId]);
    const remaining = lots.reduce((sum, lot) => sum + lot.remaining_package_milli, 0);
    const remainingCost = lots.reduce((sum, lot) => sum + Math.round(lot.total_cost_kopecks * lot.remaining_package_milli / lot.received_package_milli), 0);
    const costPerPackage = remaining ? Math.round(remainingCost * 1000 / remaining) : undefined;
    const projection = this.database.query<{ actual_revenue_kopecks: number; actual_cost_kopecks: number; actual_completeness: "complete" | "partial" | "unavailable" }>(
      "SELECT actual_revenue_kopecks,actual_cost_kopecks,actual_completeness FROM product_profitability_projection WHERE product_id=?", [productId])[0];
    const salePricePerPackage = price
      ? price.price_unit === "kilogram" ? (product?.package_mass_grams ? Math.round(price.price_kopecks * product.package_mass_grams / 1000) : undefined) : price.price_kopecks
      : undefined;
    return {
      productId,
      estimated: salePricePerPackage !== undefined && costPerPackage !== undefined
        ? { availability: "available", salePriceKopecks: salePricePerPackage, costPerPackageKopecks: costPerPackage, marginPerPackageKopecks: salePricePerPackage - costPerPackage }
        : { availability: "unavailable" },
      actual: cashAvailable && projection
        ? { availability: projection.actual_completeness === "complete" ? "available" : "partial", revenueKopecks: projection.actual_revenue_kopecks, costKopecks: projection.actual_cost_kopecks, marginKopecks: projection.actual_revenue_kopecks - projection.actual_cost_kopecks }
        : { availability: "unavailable" }
    };
  }

  reconciliation(): readonly WarehouseReconciliationRow[] {
    return this.database.query<{ product_id: string; accounting_quantity_minor: number; fifo_quantity_minor: number }>(`
      SELECT p.id product_id,COALESCE(b.quantity_minor,0) accounting_quantity_minor,
        COALESCE((SELECT sum(CASE WHEN p.inventory_kind='weight'
          THEN l.remaining_package_milli*l.package_mass_grams/1000 ELSE l.remaining_package_milli END)
          FROM inventory_lots l WHERE l.product_id=p.id),0) fifo_quantity_minor
      FROM products p LEFT JOIN inventory_balances b ON b.product_id=p.id
      WHERE COALESCE(b.quantity_minor,0)<>0 OR EXISTS (SELECT 1 FROM inventory_lots l WHERE l.product_id=p.id)
      ORDER BY p.id`).map((row) => ({
      productId: row.product_id,
      accountingQuantityMinor: row.accounting_quantity_minor,
      fifoQuantityMinor: row.fifo_quantity_minor,
      difference: row.accounting_quantity_minor - row.fifo_quantity_minor
    }));
  }

  cutoverReadiness() {
    const discrepancies = this.reconciliation().filter((row) => row.difference !== 0);
    return { ready: discrepancies.length === 0, discrepancies };
  }

  status() {
    const pending=this.database.query<{count:number;oldest:string|null}>("SELECT count(*) count,min(created_at) oldest FROM domain_outbox WHERE producer='warehouse' AND status IN ('pending','failed')")[0];
    const failed=this.database.query<{count:number}>("SELECT count(*) count FROM domain_outbox WHERE producer='warehouse' AND status='failed'")[0]?.count??0;
    const requiresAction=this.database.query<{count:number}>("SELECT count(*) count FROM integration_inbox WHERE status='requires_action'")[0]?.count??0;
    return {cutover:this.cutoverReadiness(),outbox:{pending:pending?.count??0,failed,oldestPendingAt:pending?.oldest??undefined},inbox:{requiresAction}};
  }

  lots(productId?:string) {
    return this.database.query<{id:string;product_id:string;received_package_milli:number;remaining_package_milli:number;package_mass_grams:number|null;total_cost_kopecks:number;received_at:string}>(
      `SELECT id,product_id,received_package_milli,remaining_package_milli,package_mass_grams,total_cost_kopecks,received_at FROM inventory_lots ${productId?"WHERE product_id=?":""} ORDER BY received_at,id`,
      productId?[productId]:[]
    ).map((row)=>({id:row.id,productId:row.product_id,receivedPackageMilli:row.received_package_milli,remainingPackageMilli:row.remaining_package_milli,packageMassGrams:row.package_mass_grams??undefined,totalCostKopecks:row.total_cost_kopecks,receivedAt:row.received_at}));
  }

  suppliers() {
    return this.database.query<{ id: string; name: string }>("SELECT id,name FROM suppliers WHERE status='active' ORDER BY name COLLATE NOCASE,id")
      .map((row) => ({ id: row.id, name: row.name }));
  }

  balances() {
    return this.database.query<{ product_id: string; official_name: string; local_name: string; quantity_minor: number; package_milli: number; inventory_kind: "piece" | "weight"; package_mass_grams: number | null }>(`
      SELECT p.id product_id,p.official_name,p.local_name,COALESCE(b.quantity_minor,0) quantity_minor,
        COALESCE((SELECT sum(remaining_package_milli) FROM inventory_lots l WHERE l.product_id=p.id),0) package_milli,
        p.inventory_kind,p.package_mass_grams
      FROM products p LEFT JOIN inventory_balances b ON b.product_id=p.id
      WHERE p.status='active' ORDER BY COALESCE(NULLIF(p.local_name,''),p.official_name) COLLATE NOCASE,p.id`).map((row) => ({ productId: row.product_id, officialName: row.official_name, localName: row.local_name || undefined, accountingQuantityMinor: row.quantity_minor, remainingPackageMilli: row.package_milli, inventoryKind: row.inventory_kind, packageMassGrams: row.package_mass_grams ?? undefined }));
  }

  catalog() {
    return this.database.query<{ id: string; official_name: string; local_name: string; unit: "шт" | "кг" | "л" | "м"; article: string; group_id: string | null; inventory_kind: "piece" | "weight"; package_mass_grams: number | null; status: "active" | "archived" | "deleted" }>(`
      SELECT id,official_name,local_name,unit,article,group_id,inventory_kind,package_mass_grams,status
      FROM products ORDER BY COALESCE(NULLIF(local_name,''),official_name) COLLATE NOCASE,id`).map((row) => ({
      id: row.id, officialName: row.official_name, localName: row.local_name || row.official_name,
      unit: row.unit, article: row.article, groupId: row.group_id ?? undefined, inventoryKind: row.inventory_kind, packageMassGrams: row.package_mass_grams ?? undefined, status: row.status
    }));
  }

  createCatalogProduct(command: CreateWarehouseProductCommand) {
    const officialName = command.officialName.trim();
    const localName = command.localName?.trim() || officialName;
    const article = command.article?.trim() || "";
    if (!officialName || !["piece", "weight"].includes(command.inventoryKind)) throw new Error("PRODUCT_INVALID");
    if (!Number.isSafeInteger(command.packageMassGrams) || command.packageMassGrams <= 0) throw new Error("PACKAGE_MASS_REQUIRED");
    if (command.supplierId && !this.database.query("SELECT id FROM suppliers WHERE id=? AND status='active'", [command.supplierId]).length) throw new Error("SUPPLIER_NOT_FOUND");
    if (article && this.database.query("SELECT id FROM products WHERE article=? COLLATE NOCASE AND status='active'", [article]).length) throw new Error("PRODUCT_ARTICLE_CONFLICT");
    this.ensureActor(this.database, command.actorId);
    const id = nanoid();
    const at = this.now();
    this.database.transaction((db) => {
      db.execute(`INSERT INTO products(
        id,official_name,local_name,unit,photo_url,category,tags_json,status,low_stock_threshold,low_stock_threshold_minor,
        group_id,manufacturer_id,inventory_kind,package_mass_grams,article,created_at,updated_at
      ) VALUES (?,?,?,?,'','Без категории','[]','active',?,?,NULL,NULL,?,?,?,?,?)`, [
        id, officialName, localName, command.inventoryKind === "weight" ? "кг" : "шт",
        command.inventoryKind === "weight" ? 1 : 5, command.inventoryKind === "weight" ? 1000 : 5000,
        command.inventoryKind, command.packageMassGrams, article, at, at
      ]);
      db.execute("INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES (?,0,0,?)", [id, at]);
      if (article && command.supplierId) {
        const normalized = article.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, "");
        db.execute("INSERT INTO supplier_skus(id,supplier_id,product_id,sku,normalized_sku,source_json,created_at,updated_at) VALUES (?,?,?,?,?,'{}',?,?)", [nanoid(), command.supplierId, id, article, normalized, at, at]);
        db.execute("INSERT INTO product_identifiers(id,product_id,supplier_id,type,value,normalized_value,created_at) VALUES (?,?,?,'supplier_article',?,?,?)", [nanoid(), id, command.supplierId, article, normalized, at]);
      }
    }, { mode: "immediate" });
    return this.catalog().find((product) => product.id === id)!;
  }

  recentlyDepleted(since: string, limit = 8) {
    return this.database.query<{ product_id: string; product_name: string; depleted_at: string }>(`
      SELECT p.id product_id,COALESCE(NULLIF(p.local_name,''),p.official_name) product_name,max(l.updated_at) depleted_at
      FROM products p JOIN inventory_lots l ON l.product_id=p.id
      WHERE p.status='active'
      GROUP BY p.id,p.local_name,p.official_name
      HAVING sum(l.remaining_package_milli)=0 AND max(l.updated_at)>=?
      ORDER BY depleted_at DESC,p.id LIMIT ?`, [since, Math.max(1, Math.min(50, limit))])
      .map((row) => ({ productId: row.product_id, productName: row.product_name, depletedAt: row.depleted_at }));
  }

  priceCategories() {
    const now = this.now();
    return this.database.query<{ id: string; name: string; inventory_kind: "piece" | "weight"; status: "active" | "archived"; version: number; product_count: number; price_kopecks: number | null; effective_from: string | null }>(`
      SELECT g.id,g.name,g.inventory_kind,g.status,g.version,
        (SELECT count(*) FROM products p WHERE p.group_id=g.id AND p.status='active') product_count,
        (SELECT h.price_kopecks FROM product_price_history h WHERE h.group_id=g.id AND h.effective_from<=? ORDER BY h.effective_from DESC,h.id DESC LIMIT 1) price_kopecks,
        (SELECT h.effective_from FROM product_price_history h WHERE h.group_id=g.id AND h.effective_from<=? ORDER BY h.effective_from DESC,h.id DESC LIMIT 1) effective_from
      FROM product_groups g ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END,g.name COLLATE NOCASE,g.id`, [now, now])
      .map((row) => ({
        id: row.id, name: row.name, inventoryKind: row.inventory_kind, status: row.status, version: row.version,
        productCount: row.product_count, currentPriceKopecks: row.price_kopecks ?? undefined, effectiveFrom: row.effective_from ?? undefined
      }));
  }

  priceCategory(categoryId: string) {
    const category = this.priceCategories().find((item) => item.id === categoryId);
    if (!category) throw new Error("CATEGORY_NOT_FOUND");
    const products = this.database.query<{ id: string; official_name: string; local_name: string; article: string }>(
      "SELECT id,official_name,local_name,article FROM products WHERE group_id=? AND status='active' ORDER BY COALESCE(NULLIF(local_name,''),official_name) COLLATE NOCASE,id", [categoryId])
      .map((row) => ({ id: row.id, name: row.local_name || row.official_name, officialName: row.official_name, article: row.article }));
    const prices = this.database.query<{ id: string; price_kopecks: number; price_unit: "piece" | "kilogram"; effective_from: string; created_at: string }>(
      "SELECT id,price_kopecks,price_unit,effective_from,created_at FROM product_price_history WHERE group_id=? ORDER BY effective_from DESC,id DESC", [categoryId])
      .map((row) => ({ id: row.id, priceKopecks: row.price_kopecks, priceUnit: row.price_unit, effectiveFrom: row.effective_from, createdAt: row.created_at }));
    return { ...category, products, prices };
  }

  createPriceCategory(command: PriceCategoryCommand) {
    const name = command.name.trim();
    if (!name || !["piece", "weight"].includes(command.inventoryKind)) throw new Error("CATEGORY_INVALID");
    this.ensureActor(this.database, command.actorId);
    const at = this.now();
    const category = { id: nanoid(), name, inventoryKind: command.inventoryKind, status: "active" as const, version: 0 };
    this.database.execute("INSERT INTO product_groups(id,name,inventory_kind,status,created_at,updated_at,version) VALUES (?,?,?,'active',?,?,0)", [category.id, name, command.inventoryKind, at, at]);
    return { ...category, productCount: 0 };
  }

  updatePriceCategory(categoryId: string, input: Readonly<{ name?: string; status?: "active" | "archived"; actorId: string }>) {
    this.ensureActor(this.database, input.actorId);
    const current = this.database.query<{ name: string; status: "active" | "archived"; version: number }>("SELECT name,status,version FROM product_groups WHERE id=?", [categoryId])[0];
    if (!current) throw new Error("CATEGORY_NOT_FOUND");
    const name = input.name === undefined ? current.name : input.name.trim();
    const status = input.status ?? current.status;
    if (!name || !["active", "archived"].includes(status)) throw new Error("CATEGORY_INVALID");
    this.database.execute("UPDATE product_groups SET name=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=?", [name, status, this.now(), categoryId, current.version]);
    return this.priceCategory(categoryId);
  }

  assignProductToCategory(categoryId: string, input: Readonly<{ productId: string; actorId: string }>) {
    this.ensureActor(this.database, input.actorId);
    const category = this.database.query<{ inventory_kind: "piece" | "weight"; status: string }>("SELECT inventory_kind,status FROM product_groups WHERE id=?", [categoryId])[0];
    const product = this.database.query<{ inventory_kind: "piece" | "weight" }>("SELECT inventory_kind FROM products WHERE id=? AND status='active'", [input.productId])[0];
    if (!category || category.status !== "active") throw new Error("CATEGORY_NOT_FOUND");
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (category.inventory_kind !== product.inventory_kind) throw new Error("CATEGORY_PRODUCT_KIND_MISMATCH");
    this.database.execute("UPDATE products SET group_id=?,updated_at=? WHERE id=?", [categoryId, this.now(), input.productId]);
    return this.priceCategory(categoryId);
  }

  removeProductFromCategory(categoryId: string, productId: string, input: Readonly<{ actorId: string }>) {
    this.ensureActor(this.database, input.actorId);
    this.database.execute("UPDATE products SET group_id=NULL,updated_at=? WHERE id=? AND group_id=?", [this.now(), productId, categoryId]);
    return this.priceCategory(categoryId);
  }

  addCategoryPrice(categoryId: string, input: Readonly<{ priceKopecks: number; effectiveFrom: string; actorId: string }>) {
    this.ensureActor(this.database, input.actorId);
    const category = this.database.query<{ inventory_kind: "piece" | "weight" }>("SELECT inventory_kind FROM product_groups WHERE id=? AND status='active'", [categoryId])[0];
    if (!category) throw new Error("CATEGORY_NOT_FOUND");
    if (!Number.isSafeInteger(input.priceKopecks) || input.priceKopecks < 0 || !input.effectiveFrom) throw new Error("PRICE_INVALID");
    const price = { id: nanoid(), priceKopecks: input.priceKopecks, priceUnit: category.inventory_kind === "weight" ? "kilogram" as const : "piece" as const, effectiveFrom: input.effectiveFrom, createdAt: this.now() };
    this.database.execute("INSERT INTO product_price_history(id,group_id,product_id,price_kopecks,price_unit,effective_from,created_at) VALUES (?,?,NULL,?,?,?,?)", [price.id, categoryId, price.priceKopecks, price.priceUnit, price.effectiveFrom, price.createdAt]);
    return price;
  }

  createSupplyDraft(command: SupplyDraftCommand) {
    if (!command.supplierId || !command.fileName.trim() || !command.rows.length || !Number.isSafeInteger(command.deliveryCostKopecks) || command.deliveryCostKopecks < 0) throw new Error("SUPPLY_DRAFT_INVALID");
    if (!this.database.query("SELECT id FROM suppliers WHERE id=? AND status='active'", [command.supplierId]).length) throw new Error("SUPPLIER_NOT_FOUND");
    this.ensureActor(this.database, command.actorId);
    const id = nanoid();
    const at = this.now();
    this.database.transaction((db) => {
      db.execute("INSERT INTO supply_receipt_drafts(id,supplier_id,delivery_cost_kopecks,file_name,status,actor_id,created_at,updated_at) VALUES (?,?,?,?,'draft',?,?,?)", [id, command.supplierId, command.deliveryCostKopecks, command.fileName.trim(), command.actorId, at, at]);
      command.rows.forEach((row, position) => {
        const productId = this.matchDraftProduct(db, row);
        db.execute(`INSERT INTO supply_receipt_draft_lines(id,draft_id,source_name,source_article,product_id,package_count,package_mass_grams,purchase_cost_kopecks,position)
          VALUES (?,?,?,?,?,?,?,?,?)`, [nanoid(), id, row.sourceName.trim(), row.sourceArticle?.trim() || null, productId, row.packageCount ?? null, row.packageMassGrams ?? null, row.purchaseCostKopecks ?? null, position]);
      });
    }, { mode: "immediate" });
    return this.supplyDraft(id);
  }

  supplyDraft(draftId: string) {
    const draft = this.database.query<{ id: string; supplier_id: string; delivery_cost_kopecks: number; file_name: string; status: "draft" | "accepted"; accepted_supply_id: string | null; created_at: string }>(
      "SELECT id,supplier_id,delivery_cost_kopecks,file_name,status,accepted_supply_id,created_at FROM supply_receipt_drafts WHERE id=?", [draftId])[0];
    if (!draft) throw new Error("SUPPLY_DRAFT_NOT_FOUND");
    const lines = this.database.query<{ id: string; source_name: string; source_article: string | null; product_id: string | null; package_count: number | null; package_mass_grams: number | null; purchase_cost_kopecks: number | null }>(
      "SELECT id,source_name,source_article,product_id,package_count,package_mass_grams,purchase_cost_kopecks FROM supply_receipt_draft_lines WHERE draft_id=? ORDER BY position", [draftId])
      .map((line) => ({
        id: line.id, sourceName: line.source_name, sourceArticle: line.source_article ?? undefined, productId: line.product_id ?? undefined,
        packageCount: line.package_count ?? undefined, packageMassGrams: line.package_mass_grams ?? undefined, purchaseCostKopecks: line.purchase_cost_kopecks ?? undefined,
        complete: Boolean(line.product_id && line.package_count && line.package_mass_grams && line.purchase_cost_kopecks !== null)
      }));
    return {
      id: draft.id, supplierId: draft.supplier_id, deliveryCostKopecks: draft.delivery_cost_kopecks, fileName: draft.file_name,
      status: draft.status, acceptedSupplyId: draft.accepted_supply_id ?? undefined, createdAt: draft.created_at, lines
    };
  }

  acceptSupplyDraft(draftId: string, input: Readonly<{ invoiceNumber?: string; deliveredAt: string; actorId: string; idempotencyKey?: string; lines: readonly SupplyDraftLineInput[] }>) {
    const draft = this.supplyDraft(draftId);
    if (draft.status === "accepted" && draft.acceptedSupplyId) return { supplyId: draft.acceptedSupplyId, lotIds: [] };
    if (!input.lines.length || !input.deliveredAt) throw new Error("SUPPLY_DRAFT_INVALID");
    const allocations = allocateDeliveryByMass(draft.deliveryCostKopecks, input.lines);
    const result = this.acceptSupply({
      supplierId: draft.supplierId, invoiceNumber: input.invoiceNumber, deliveredAt: input.deliveredAt, actorId: input.actorId, idempotencyKey: input.idempotencyKey,
      lines: input.lines.map((line, index) => ({ productId: line.productId, packageCount: line.packageCount, packageMassGrams: line.packageMassGrams, purchaseCostKopecks: line.purchaseCostKopecks, allocatedDeliveryCostKopecks: allocations[index] }))
    });
    this.database.execute("UPDATE supply_receipt_drafts SET status='accepted',accepted_supply_id=?,updated_at=? WHERE id=? AND status='draft'", [result.supplyId, this.now(), draftId]);
    return result;
  }

  journal(from?: string, to?: string) {
    const params: string[] = [];
    const dateFilter = (column: string) => {
      const filters: string[] = [];
      if (from) { filters.push(`${column}>=?`); params.push(from); }
      if (to) { filters.push(`${column}<=?`); params.push(`${to}T23:59:59.999Z`); }
      return filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    };
    const supplyFilter = dateFilter("s.delivered_at");
    const allocationFilter = dateFilter("a.created_at");
    return this.database.query<{ occurred_at: string; type: string; product_id: string; product_name: string; quantity_package_milli: number; reason: string }>(`
      SELECT s.delivered_at occurred_at,'supply' type,p.id product_id,COALESCE(NULLIF(p.local_name,''),p.official_name) product_name,l.package_count*1000 quantity_package_milli,COALESCE(s.invoice_number,'') reason
      FROM supplies s JOIN supply_lines l ON l.supply_id=s.id JOIN products p ON p.id=l.product_id ${supplyFilter}
      UNION ALL
      SELECT a.created_at occurred_at,a.direction type,p.id product_id,COALESCE(NULLIF(p.local_name,''),p.official_name) product_name,a.quantity_package_milli,a.external_reference reason
      FROM fifo_allocations a JOIN products p ON p.id=a.product_id ${allocationFilter}
      ORDER BY occurred_at DESC,product_name COLLATE NOCASE`, params).map((row) => ({
      occurredAt: row.occurred_at, type: row.type, productId: row.product_id, productName: row.product_name,
      quantityPackageMilli: row.quantity_package_milli, reason: row.reason
    }));
  }

  private adjustmentSupplier(at: string) {
    this.database.execute("INSERT OR IGNORE INTO suppliers(id,name,status,created_at,updated_at) VALUES ('warehouse-adjustments','Корректировки склада','active',?,?)", [at, at]);
    return "warehouse-adjustments";
  }

  private matchDraftProduct(db: DatabaseContext, row: SupplyDraftRowInput) {
    if (row.sourceArticle?.trim()) {
      const byArticle = db.query<{ id: string }>("SELECT id FROM products WHERE status='active' AND article=? COLLATE NOCASE LIMIT 1", [row.sourceArticle.trim()])[0];
      if (byArticle) return byArticle.id;
    }
    const normalized = row.sourceName.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
    const products = db.query<{ id: string; official_name: string; local_name: string }>("SELECT id,official_name,local_name FROM products WHERE status='active'");
    return products.find((product) => [product.official_name, product.local_name].some((name) => name.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е") === normalized))?.id ?? null;
  }

  private ensureActor(db: DatabaseContext, actorId: string) {
    // Core identities are external to Warehouse. Keep only an auditable actor
    // reference locally, so a new Core user never blocks a stock command.
    db.execute("INSERT OR IGNORE INTO users(id,status) VALUES (?,'active')", [actorId]);
  }

  private idempotent<T>(scope: string, key: string | undefined, input: unknown, run: (db: DatabaseContext) => T): T {
    if (!key?.trim()) return this.database.transaction(run, { mode: "immediate" });
    const request = JSON.stringify(input);
    return this.database.transaction((db) => {
      const existing = db.query<{ request_json: string; response_json: string }>("SELECT request_json,response_json FROM warehouse_idempotency_keys WHERE scope=? AND key=?", [scope, key])[0];
      if (existing) {
        if (existing.request_json !== request) throw new Error("IDEMPOTENCY_KEY_REUSED");
        return JSON.parse(existing.response_json) as T;
      }
      const result = run(db);
      db.execute("INSERT INTO warehouse_idempotency_keys(scope,key,request_json,response_json,created_at) VALUES (?,?,?,?,?)", [scope, key, request, JSON.stringify(result), this.now()]);
      return result;
    }, { mode: "immediate" });
  }

  private saleLineReference(payload: CashStockDeltaPayload) {
    return `${payload.externalSaleKey}:${payload.externalLineKey}`;
  }

  private validateSupplyLine(db: DatabaseContext, line: AcceptSupplyCommand["lines"][number]) {
    if (!Number.isSafeInteger(line.packageCount) || line.packageCount <= 0) throw new Error("PACKAGE_COUNT_INVALID");
    if (!Number.isSafeInteger(line.purchaseCostKopecks) || line.purchaseCostKopecks < 0) throw new Error("PURCHASE_COST_INVALID");
    const product = db.query<{ inventory_kind: string; package_mass_grams: number | null }>("SELECT inventory_kind,package_mass_grams FROM products WHERE id=? AND status='active'", [line.productId])[0];
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (!Number.isSafeInteger(line.packageMassGrams) || Number(line.packageMassGrams) <= 0) throw new Error("PACKAGE_MASS_REQUIRED");
    return product;
  }

  private consumeLotsInTransaction(db: DatabaseContext, command: ConsumeLotsCommand) {
    if (!Number.isSafeInteger(command.quantityPackageMilli) || command.quantityPackageMilli <= 0) throw new Error("QUANTITY_INVALID");
    const lots = db.query<LotRow>(`SELECT l.id,l.received_package_milli,l.remaining_package_milli,l.total_cost_kopecks,l.received_at,
      l.package_mass_grams,COALESCE((SELECT sum(CASE WHEN a.direction='consume' THEN a.cost_kopecks ELSE -a.cost_kopecks END) FROM fifo_allocations a WHERE a.lot_id=l.id),0) allocated_cost_kopecks
      FROM inventory_lots l WHERE l.product_id=? AND l.remaining_package_milli>0 ORDER BY l.received_at,l.id`, [command.productId]);
    if (!lots.length) throw new Error("COST_BASIS_MISSING");
    if (lots.reduce((sum, lot) => sum + lot.remaining_package_milli, 0) < command.quantityPackageMilli) throw new Error("NEGATIVE_STOCK");
    let remaining = command.quantityPackageMilli;
    let totalCost = 0;
    let accountingQuantity = 0;
    for (const lot of lots) {
      if (!remaining) break;
      const quantity = Math.min(remaining, lot.remaining_package_milli);
      const cost = quantity === lot.remaining_package_milli
        ? lot.total_cost_kopecks - lot.allocated_cost_kopecks
        : Math.round(lot.total_cost_kopecks * quantity / lot.received_package_milli);
      db.execute("UPDATE inventory_lots SET remaining_package_milli=remaining_package_milli-?,version=version+1,updated_at=? WHERE id=? AND remaining_package_milli>=?", [quantity, this.now(), lot.id, quantity]);
      db.execute(`INSERT INTO fifo_allocations(id,event_id,lot_id,product_id,quantity_package_milli,cost_kopecks,direction,external_reference,created_at)
        VALUES (?,?,?,?,?,?,'consume',?,?)`, [nanoid(), command.eventId, lot.id, command.productId, quantity, cost, command.externalReference, command.occurredAt]);
      totalCost += cost;
      accountingQuantity += this.accountingQuantityForLot(lot, quantity);
      remaining -= quantity;
    }
    this.incrementAccountingBalance(db, command.productId, -accountingQuantity, command.occurredAt);
    return totalCost;
  }

  private returnToLatestLot(db: DatabaseContext, command: ConsumeLotsCommand) {
    const allocations = db.query<{
      lot_id: string; package_mass_grams: number | null; consumed_quantity: number; consumed_cost: number; returned_quantity: number; returned_cost: number;
    }>(`SELECT c.lot_id,l.package_mass_grams,sum(c.quantity_package_milli) consumed_quantity,sum(c.cost_kopecks) consumed_cost,
      COALESCE((SELECT sum(r.quantity_package_milli) FROM fifo_allocations r WHERE r.lot_id=c.lot_id AND r.external_reference=c.external_reference AND r.direction='return'),0) returned_quantity,
      COALESCE((SELECT sum(r.cost_kopecks) FROM fifo_allocations r WHERE r.lot_id=c.lot_id AND r.external_reference=c.external_reference AND r.direction='return'),0) returned_cost
      FROM fifo_allocations c JOIN inventory_lots l ON l.id=c.lot_id WHERE c.product_id=? AND c.external_reference=? AND c.direction='consume'
      GROUP BY c.lot_id,l.package_mass_grams ORDER BY max(c.created_at) DESC,c.lot_id DESC`, [command.productId, command.externalReference]);
    if (allocations.reduce((sum, row) => sum + row.consumed_quantity - row.returned_quantity, 0) < command.quantityPackageMilli) throw new Error("COST_BASIS_MISSING");
    let remaining = command.quantityPackageMilli;
    let totalCost = 0;
    let accountingQuantity = 0;
    for (const allocation of allocations) {
      if (!remaining) break;
      const available = allocation.consumed_quantity - allocation.returned_quantity;
      if (available <= 0) continue;
      const quantity = Math.min(available, remaining);
      const cost = quantity === available
        ? allocation.consumed_cost - allocation.returned_cost
        : Math.round(allocation.consumed_cost * quantity / allocation.consumed_quantity);
      db.execute("UPDATE inventory_lots SET remaining_package_milli=remaining_package_milli+?,version=version+1,updated_at=? WHERE id=? AND remaining_package_milli+?<=received_package_milli", [quantity, this.now(), allocation.lot_id, quantity]);
      db.execute(`INSERT INTO fifo_allocations(id,event_id,lot_id,product_id,quantity_package_milli,cost_kopecks,direction,external_reference,created_at)
        VALUES (?,?,?,?,?,?,'return',?,?)`, [nanoid(), command.eventId, allocation.lot_id, command.productId, quantity, cost, command.externalReference, command.occurredAt]);
      totalCost += cost;
      accountingQuantity += this.accountingQuantityForLot(allocation, quantity);
      remaining -= quantity;
    }
    this.incrementAccountingBalance(db, command.productId, accountingQuantity, command.occurredAt);
    return totalCost;
  }

  private incrementAccountingBalance(db: DatabaseContext, productId: string, delta: number, at: string) {
    const balance = db.query<{ quantity_minor: number; version: number }>("SELECT quantity_minor,version FROM inventory_balances WHERE product_id=?", [productId])[0];
    const after = (balance?.quantity_minor ?? 0) + delta;
    if (after < 0) throw new Error("NEGATIVE_STOCK");
    if (balance) db.execute("UPDATE inventory_balances SET quantity_minor=?,version=version+1,updated_at=? WHERE product_id=? AND version=?", [after, at, productId, balance.version]);
    else db.execute("INSERT INTO inventory_balances(product_id,quantity_minor,version,updated_at) VALUES (?,?,0,?)", [productId, after, at]);
  }

  private assertProductReconciled(db: DatabaseContext, productId: string) {
    const row = db.query<{ accounting_quantity_minor: number; fifo_quantity_minor: number }>(`SELECT COALESCE(b.quantity_minor,0) accounting_quantity_minor,
      COALESCE((SELECT sum(CASE WHEN p.inventory_kind='weight' THEN l.remaining_package_milli*l.package_mass_grams/1000 ELSE l.remaining_package_milli END)
        FROM inventory_lots l WHERE l.product_id=p.id),0) fifo_quantity_minor
      FROM products p LEFT JOIN inventory_balances b ON b.product_id=p.id WHERE p.id=?`, [productId])[0];
    if (!row || row.accounting_quantity_minor !== row.fifo_quantity_minor) throw new Error("WAREHOUSE_CUTOVER_REQUIRED");
  }

  private accountingQuantityForLot(lot: Readonly<{ package_mass_grams: number | null }>, packageMilli: number) {
    return lot.package_mass_grams === null ? packageMilli : Math.round(packageMilli * lot.package_mass_grams / 1000);
  }

  private updateProfitability(db: DatabaseContext, productId: string, revenueDelta: number, costDelta: number, at: string): WarehouseProfitabilityUpdatedPayload {
    db.execute(`INSERT INTO product_profitability_projection(product_id,actual_revenue_kopecks,actual_cost_kopecks,actual_completeness,source_updated_at)
      VALUES (?,?,?,'complete',?)
      ON CONFLICT(product_id) DO UPDATE SET actual_revenue_kopecks=actual_revenue_kopecks+excluded.actual_revenue_kopecks,
      actual_cost_kopecks=actual_cost_kopecks+excluded.actual_cost_kopecks,actual_completeness='complete',
      source_updated_at=excluded.source_updated_at,version=version+1`, [productId, revenueDelta, costDelta, at]);
    const projection = db.query<{ actual_revenue_kopecks: number; actual_cost_kopecks: number; actual_completeness: WarehouseProfitabilityUpdatedPayload["completeness"]; source_updated_at: string }>(
      "SELECT actual_revenue_kopecks,actual_cost_kopecks,actual_completeness,source_updated_at FROM product_profitability_projection WHERE product_id=?", [productId])[0];
    if (!projection) throw new Error("PROFITABILITY_PROJECTION_MISSING");
    return { productId, actualRevenueKopecks: projection.actual_revenue_kopecks, actualCostKopecks: projection.actual_cost_kopecks, completeness: projection.actual_completeness, sourceUpdatedAt: projection.source_updated_at };
  }

  private writeOutbox(db: DatabaseContext, event: DomainEventEnvelope<string, unknown>) {
    db.execute(`INSERT INTO domain_outbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,available_at,created_at)
      VALUES (?,?,?,?,?,?,'pending',?,?)`, [event.eventId, event.producer, event.eventType, event.eventVersion, event.aggregateId, JSON.stringify(event.payload), event.occurredAt, event.occurredAt]);
  }
}

export function allocateDeliveryByMass(deliveryCostKopecks: number, lines: readonly SupplyDraftLineInput[]) {
  if (!Number.isSafeInteger(deliveryCostKopecks) || deliveryCostKopecks < 0 || !lines.length) throw new Error("DELIVERY_COST_INVALID");
  const weights = lines.map((line) => {
    if (!line.productId || !Number.isSafeInteger(line.packageCount) || line.packageCount <= 0 || !Number.isSafeInteger(line.packageMassGrams) || line.packageMassGrams <= 0 || !Number.isSafeInteger(line.purchaseCostKopecks) || line.purchaseCostKopecks < 0) throw new Error("SUPPLY_DRAFT_LINE_INCOMPLETE");
    return line.packageCount * line.packageMassGrams;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) throw new Error("DELIVERY_WEIGHT_INVALID");
  const exact = weights.map((weight) => deliveryCostKopecks * weight / totalWeight);
  const result = exact.map(Math.floor);
  let remainder = deliveryCostKopecks - result.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) result[order[index % order.length].index] += 1;
  return result;
}
