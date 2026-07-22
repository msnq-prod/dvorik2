import type { AuditEntry, EmployeeProfile, HrEvent, InventoryBalance, InventorySnapshotRow, Location, Manufacturer, MovementReportRow, NotificationItem, Product, ProductGroup, ProductPackaging, ProductPriceHistory, ScheduleDay, SellerShiftSwapRequest, Shift, ShiftExchangeRequest, ShiftSwapRequest, StockBalance, StockOperation } from "../shared/types";
import { quantityFromMinor } from "../shared/quantity";
import type { DatabaseContext, SqlValue } from "./database";
import { locationMapper, productIdentifierMapper, productMapper, stockBalanceMapper, stockOperationMapper } from "./mappers/catalog";
import { scheduleDayMapper, shiftAssignmentMapper, shiftMapper, shiftSwapRequestMapper } from "./mappers/schedule";
import { auditEntryFromRow, outboxMessageFromRow, webappNotificationFromRow } from "./mappers/workflows";

type Row = Readonly<Record<string, unknown>>;

function productFromRow(database: DatabaseContext, row: Row): Product {
  const mapped = productMapper.fromRow(row);
  const identifiers = database.query<Row>("SELECT * FROM product_identifiers WHERE product_id = ? ORDER BY id", [mapped.id])
    .map((identifier) => {
      const { normalizedValue: _normalizedValue, createdAt: _createdAt, ...value } = productIdentifierMapper.fromRow(identifier);
      return value;
    });
  const { createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...product } = mapped;
  return { ...product, identifiers };
}

function shiftFromRow(database: DatabaseContext, row: Row): { shift: Shift; revision: string } {
  const mapped = shiftMapper.fromRow(row);
  const employeeIds = database.query<Row>("SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY user_id", [mapped.id])
    .map((assignment) => shiftAssignmentMapper.fromRow(assignment).userId);
  const {
    scheduleDayId: _scheduleDayId, version: _version, createdByUserId: _createdByUserId,
    createdAt: _createdAt, updatedAt: _updatedAt, revision: _revision, ...shift
  } = mapped;
  return { shift: { ...shift, employeeIds }, revision: mapped.revision };
}

/** Read-only SQL adapter for the first DB-107 catalog/stock route slice. */
export class SqlCatalogQueryService {
  constructor(private readonly database: DatabaseContext) {}

  products(input: Readonly<{ status?: string; search?: string; page: number; limit: number }>) {
    const status = input.status && input.status !== "all" ? input.status : undefined;
    const search = input.search?.trim().toLowerCase();
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (status) { clauses.push("p.status = ?"); parameters.push(status); }
    if (search) {
      for (const term of search.split(/\s+/).filter(Boolean)) {
        const like = `%${term}%`;
        clauses.push("(dvorik_normalize_search(p.official_name) LIKE ? OR dvorik_normalize_search(p.local_name) LIKE ? OR dvorik_normalize_search(p.category) LIKE ? OR EXISTS (SELECT 1 FROM json_each(p.tags_json) tag WHERE dvorik_normalize_search(tag.value) LIKE ?) OR EXISTS (SELECT 1 FROM product_identifiers pi WHERE pi.product_id = p.id AND dvorik_normalize_search(pi.value) LIKE ?))");
        parameters.push(like, like, like, like, like);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = this.database.query<{ count: number }>(`SELECT count(*) count FROM products p ${where}`, parameters)[0]?.count ?? 0;
    const rows = this.database.query<Row>(
      `SELECT p.* FROM products p ${where} ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC LIMIT ? OFFSET ?`,
      [...parameters, input.limit, (input.page - 1) * input.limit]
    );
    return { items: rows.map((row) => productFromRow(this.database, row)), total, page: input.page, limit: input.limit };
  }

  productById(id: string): Product | undefined {
    const row = this.database.query<Row>("SELECT * FROM products WHERE id = ?", [id])[0];
    return row ? productFromRow(this.database, row) : undefined;
  }

  groups(): ProductGroup[] {
    return this.database.query<Row>("SELECT * FROM product_groups ORDER BY name COLLATE NOCASE, id").map((row) => ({
      id: String(row.id), name: String(row.name), inventoryKind: row.inventory_kind as ProductGroup["inventoryKind"],
      status: row.status as ProductGroup["status"], version: Number(row.version)
    }));
  }

  manufacturers(): Manufacturer[] {
    return this.database.query<Row>("SELECT * FROM manufacturers ORDER BY name COLLATE NOCASE, id").map((row) => ({
      id: String(row.id), name: String(row.name), status: row.status as Manufacturer["status"], version: Number(row.version)
    }));
  }

  packagings(productId: string): ProductPackaging[] {
    return this.database.query<Row>("SELECT * FROM product_packagings WHERE product_id = ? ORDER BY is_primary DESC, name COLLATE NOCASE, id", [productId]).map((row) => ({
      id: String(row.id), productId: String(row.product_id), name: String(row.name), unitsPerPackage: Number(row.units_per_package),
      massGrams: row.mass_grams === null ? undefined : Number(row.mass_grams), isPrimary: Number(row.is_primary) === 1, version: Number(row.version)
    }));
  }

  prices(input: Readonly<{ groupId?: string; productId?: string }>): ProductPriceHistory[] {
    const field = input.groupId ? "group_id" : "product_id";
    const value = input.groupId ?? input.productId;
    if (!value) return [];
    return this.database.query<Row>(`SELECT * FROM product_price_history WHERE ${field} = ? ORDER BY effective_from DESC, id DESC`, [value]).map((row) => ({
      id: String(row.id), groupId: row.group_id === null ? undefined : String(row.group_id), productId: row.product_id === null ? undefined : String(row.product_id),
      priceKopecks: Number(row.price_kopecks), priceUnit: row.price_unit as ProductPriceHistory["priceUnit"], effectiveFrom: String(row.effective_from),
      createdByUserId: row.created_by_user_id === null ? undefined : String(row.created_by_user_id), createdAt: String(row.created_at)
    }));
  }

  totals(): InventoryBalance[] {
    return this.database.query<Row>("SELECT * FROM inventory_balances ORDER BY product_id").map((row) => ({
      productId: String(row.product_id), quantity: quantityFromMinor(Number(row.quantity_minor)), version: Number(row.version)
    }));
  }

  activeInventorySession() {
    const session = this.database.query<Row>("SELECT * FROM inventory_sessions WHERE status IN ('active','closing') ORDER BY started_at,id LIMIT 1")[0];
    if (!session) return null;
    const rows = this.database.query<Row>("SELECT * FROM inventory_session_rows WHERE session_id=? ORDER BY product_id", [String(session.id)]).map((row) => ({
      sessionId: String(row.session_id), productId: String(row.product_id), expected: quantityFromMinor(Number(row.expected_quantity_minor)),
      actual: row.actual_quantity_minor === null ? undefined : quantityFromMinor(Number(row.actual_quantity_minor)), version: Number(row.version)
    }));
    return { session: { id: String(session.id), status: String(session.status), actorId: String(session.actor_id), comment: String(session.comment), startedAt: String(session.started_at), completedAt: session.completed_at === null ? undefined : String(session.completed_at), version: Number(session.version) }, rows };
  }

  consumptions(limit = 100) {
    return this.database.query<Row>("SELECT * FROM consumption_records ORDER BY created_at DESC,id DESC LIMIT ?", [limit]).map((row) => ({
      id: String(row.id), productId: String(row.product_id), quantity: quantityFromMinor(Number(row.quantity_minor)), source: String(row.source),
      inventorySessionId: row.inventory_session_id === null ? undefined : String(row.inventory_session_id), stockOperationId: String(row.stock_operation_id),
      actorId: String(row.actor_id), comment: String(row.comment), createdAt: String(row.created_at)
    }));
  }

  locations(): Location[] {
    return this.database.query<Row>("SELECT * FROM locations WHERE status = 'active' ORDER BY name COLLATE NOCASE ASC, id ASC")
      .map((row) => {
        const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...location } = locationMapper.fromRow(row);
        return location;
      });
  }

  locationById(id: string): Location | undefined {
    const row = this.database.query<Row>("SELECT * FROM locations WHERE id = ?", [id])[0];
    if (!row) return undefined;
    const { capacity: _capacity, createdAt: _createdAt, archivedAt: _archivedAt, revision: _revision, ...location } = locationMapper.fromRow(row);
    return location;
  }

  balances(): StockBalance[] {
    return this.balanceRows();
  }

  private balanceRows(locationId?: string): StockBalance[] {
    return this.database.query<Row>(
      `SELECT b.*, p.unit FROM stock_balances b JOIN products p ON p.id = b.product_id ${locationId ? "WHERE b.location_id = ?" : ""} ORDER BY b.product_id ASC, b.location_id ASC`,
      locationId ? [locationId] : []
    )
      .map((row) => {
        const unit = typeof row.unit === "string" ? row.unit as Product["unit"] : undefined;
        if (!unit) throw new Error("Balance product unit missing");
        const { updatedAt: _updatedAt, revision: _revision, ...balance } = stockBalanceMapper.fromRow(row, unit);
        return balance;
      });
  }

  inventorySnapshot(locationId: string): InventorySnapshotRow[] {
    return this.balanceRows(locationId)
      .map((balance) => ({ productId: balance.productId, locationId, expected: balance.quantity, version: balance.version }));
  }

  operations(limit = 100): StockOperation[] {
    return this.database.query<Row>(
      "SELECT o.*, p.unit FROM stock_operations o JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC, o.id DESC LIMIT ?", [limit]
    ).map((row) => {
      const unit = typeof row.unit === "string" ? row.unit as Product["unit"] : undefined;
      if (!unit) throw new Error("Operation product unit missing");
      const { metadata: _metadata, ...operation } = stockOperationMapper.fromRow(row, unit);
      return { ...operation, idempotencyKey: operation.idempotencyKey ?? "" };
    });
  }

  shifts(input: Readonly<{ userId?: string; from?: string; to?: string }>): Shift[] {
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (input.from) { clauses.push("s.local_date >= ?"); parameters.push(input.from); }
    if (input.to) { clauses.push("s.local_date <= ?"); parameters.push(input.to); }
    if (input.userId) {
      clauses.push("EXISTS (SELECT 1 FROM shift_assignments sa WHERE sa.shift_id = s.id AND sa.user_id = ?)");
      parameters.push(input.userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query<Row>(
      `SELECT s.* FROM shifts s ${where} ORDER BY s.local_date ASC, s.start_time ASC, s.id ASC`, parameters
    ).map((row) => shiftFromRow(this.database, row).shift);
  }

  shiftForWrite(id: string): { shift: Shift; revision: string } | undefined {
    const row = this.database.query<Row>("SELECT * FROM shifts WHERE id = ?", [id])[0];
    return row ? shiftFromRow(this.database, row) : undefined;
  }

  dayRevision(date: string, locationId: string): number | null {
    const row = this.database.query<Row>("SELECT * FROM schedule_days WHERE local_date = ? AND location_id = ?", [date, locationId])[0];
    return row ? scheduleDayMapper.fromRow(row).version : null;
  }

  swaps(input: Readonly<{ userId?: string }>): Array<ShiftSwapRequest | SellerShiftSwapRequest> {
    const rows = input.userId
      ? this.database.query<Row>("SELECT * FROM shift_swap_requests WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC, id DESC", [input.userId, input.userId])
      : this.database.query<Row>("SELECT * FROM shift_swap_requests ORDER BY created_at DESC, id DESC");
    return rows.map((row) => {
      const { sourceShiftRevision: _sourceShiftRevision, version: _version, updatedAt: _updatedAt, resolvedAt: _resolvedAt, resolvedByUserId: _resolvedByUserId, revision: _revision, ...swap } = shiftSwapRequestMapper.fromRow(row);
      return input.userId ? (({ fromShiftId: _fromShiftId, ...seller }) => seller)(swap) : swap;
    });
  }

  employeeProfiles(): EmployeeProfile[] {
    return this.database.query<Row>("SELECT * FROM employee_profiles ORDER BY status,position COLLATE NOCASE,user_id").map((row) => ({
      userId: String(row.user_id), personnelNumber: row.personnel_number === null ? undefined : String(row.personnel_number),
      position: String(row.position), hiredOn: String(row.hired_on), dismissedOn: row.dismissed_on === null ? undefined : String(row.dismissed_on),
      status: row.status as EmployeeProfile["status"], version: Number(row.version)
    }));
  }

  hrEvents(input: Readonly<{ userId?: string; from?: string; to?: string }>): HrEvent[] {
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (input.userId) { clauses.push("user_id=?"); parameters.push(input.userId); }
    if (input.from) { clauses.push("end_date>=?"); parameters.push(input.from); }
    if (input.to) { clauses.push("start_date<=?"); parameters.push(input.to); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query<Row>(`SELECT * FROM hr_events ${where} ORDER BY start_date DESC,created_at DESC,id DESC`, parameters).map((row) => ({
      id: String(row.id), userId: String(row.user_id), type: row.type as HrEvent["type"], startDate: String(row.start_date), endDate: String(row.end_date),
      shiftId: row.shift_id === null ? undefined : String(row.shift_id), minutesLate: row.minutes_late === null ? undefined : Number(row.minutes_late),
      comment: String(row.comment), createdByUserId: String(row.created_by_user_id), createdAt: String(row.created_at)
    }));
  }

  exchanges(userId?: string): ShiftExchangeRequest[] {
    const rows = userId
      ? this.database.query<Row>("SELECT * FROM shift_exchange_requests WHERE from_user_id=? OR to_user_id=? ORDER BY created_at DESC,id DESC", [userId,userId])
      : this.database.query<Row>("SELECT * FROM shift_exchange_requests ORDER BY created_at DESC,id DESC");
    return rows.map((row) => {
      const parsed = JSON.parse(String(row.warning_json)) as { value?: { warnings?: string[] } };
      return { id: String(row.id), fromShiftId: String(row.from_shift_id), toShiftId: String(row.to_shift_id), fromUserId: String(row.from_user_id), toUserId: String(row.to_user_id), status: row.status as ShiftExchangeRequest["status"], warnings: parsed.value?.warnings ?? [], createdAt: String(row.created_at), resolvedAt: row.resolved_at === null ? undefined : String(row.resolved_at) };
    });
  }

  days(input: Readonly<{ userId?: string; from?: string; to?: string }>): ScheduleDay[] {
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (input.from) { clauses.push("d.local_date >= ?"); parameters.push(input.from); }
    if (input.to) { clauses.push("d.local_date <= ?"); parameters.push(input.to); }
    if (input.userId) {
      clauses.push("EXISTS (SELECT 1 FROM shifts s JOIN shift_assignments sa ON sa.shift_id = s.id WHERE s.local_date = d.local_date AND s.location_id = d.location_id AND sa.user_id = ?)");
      parameters.push(input.userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query<Row>(
      `SELECT d.* FROM schedule_days d ${where} ORDER BY d.local_date ASC, d.location_id ASC, d.id ASC`, parameters
    ).map((row) => {
      const { createdByUserId: _createdByUserId, createdAt: _createdAt, updatedAt: _updatedAt, revision: _revision, ...day } = scheduleDayMapper.fromRow(row);
      return day;
    });
  }

  audit(limit = 100): AuditEntry[] {
    return this.database.query<Row>("SELECT * FROM audit_entries ORDER BY created_at DESC, id DESC LIMIT ?", [limit])
      .map((row) => {
        const mapped = auditEntryFromRow(row).entity;
        return {
          id: mapped.id,
          actorId: mapped.actorId ?? "system",
          entity: mapped.entity,
          entityId: mapped.entityId,
          action: mapped.action,
          changes: mapped.changes.value,
          createdAt: mapped.createdAt
        };
      });
  }

  reportRows(type: "low" | "zero" | "all" | "archive" | "movements" | "discrepancies", query: Readonly<{ from?: string; to?: string; productId?: string; locationId?: string }>) {
    if (type === "movements") return this.movementRows(query);
    if (type === "discrepancies") return this.movementRows(query, true).filter((row) => row.inventoryExpected !== null);
    if (!query.locationId) {
      const clauses: string[] = [];
      const parameters: SqlValue[] = [];
      if (query.productId) { clauses.push("b.product_id = ?"); parameters.push(query.productId); }
      if (type === "low") clauses.push("b.quantity_minor > 0 AND b.quantity_minor <= p.low_stock_threshold_minor");
      if (type === "zero") clauses.push("b.quantity_minor = 0");
      if (type === "archive") clauses.push("p.status = 'archived'");
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return this.database.query<Row>(
        `SELECT p.local_name, p.official_name, p.status AS product_status, 'Общий остаток' AS location_name,
                CAST(b.quantity_minor AS REAL) / 1000.0 AS quantity, p.low_stock_threshold
         FROM inventory_balances b JOIN products p ON p.id = b.product_id ${where}
         ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC`, parameters
      ).map((row) => ({ productName: typeof row.local_name === "string" && row.local_name || String(row.official_name), productStatus: String(row.product_status), locationName: String(row.location_name), quantity: Number(row.quantity), threshold: Number(row.low_stock_threshold) }));
    }
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (query.productId) { clauses.push("b.product_id = ?"); parameters.push(query.productId); }
    if (query.locationId) { clauses.push("b.location_id = ?"); parameters.push(query.locationId); }
    if (type === "low") clauses.push("b.quantity > 0 AND b.quantity <= p.low_stock_threshold");
    if (type === "zero") clauses.push("b.quantity = 0");
    if (type === "archive") clauses.push("p.status = 'archived'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query<Row>(
      `SELECT p.local_name, p.official_name, p.status AS product_status, l.name AS location_name, b.quantity, p.low_stock_threshold
       FROM stock_balances b JOIN products p ON p.id = b.product_id JOIN locations l ON l.id = b.location_id
       ${where} ORDER BY p.local_name COLLATE NOCASE ASC, p.id ASC, l.name COLLATE NOCASE ASC, l.id ASC`, parameters
    ).map((row) => ({
      productName: typeof row.local_name === "string" && row.local_name || String(row.official_name),
      productStatus: String(row.product_status), locationName: String(row.location_name),
      quantity: Number(row.quantity), threshold: Number(row.low_stock_threshold)
    }));
  }

  summary(input: Readonly<{ userId: string; includeAllNotifications: boolean; today: string }>) {
    const counts = this.database.query<{ activeProducts: number; lowStock: number; currentShiftEmployees: number }>(
      `SELECT
         (SELECT count(*) FROM products WHERE status = 'active') AS activeProducts,
         (SELECT count(*) FROM inventory_balances b JOIN products p ON p.id = b.product_id WHERE b.quantity_minor <= p.low_stock_threshold_minor) AS lowStock,
         (SELECT count(*) FROM shifts s JOIN shift_assignments sa ON sa.shift_id = s.id WHERE s.local_date = ? AND s.status = 'in_progress') AS currentShiftEmployees`,
      [input.today]
    )[0] ?? { activeProducts: 0, lowStock: 0, currentShiftEmployees: 0 };
    const notificationRefs = this.database.query<Row>(
      `SELECT id, source FROM (
         SELECT id, created_at, 'webapp' AS source FROM webapp_notifications WHERE recipient_user_id = ? OR ? = 1
         UNION ALL
         SELECT id, created_at, 'telegram' AS source FROM outbox_messages WHERE channel = 'telegram' AND status = 'sent' AND (recipient_user_id = ? OR ? = 1)
       ) ORDER BY created_at DESC, id DESC LIMIT 5`,
      [input.userId, input.includeAllNotifications ? 1 : 0, input.userId, input.includeAllNotifications ? 1 : 0]
    );
    const notifications = notificationRefs.map((reference): NotificationItem => {
      if (reference.source === "webapp") {
        const row = this.database.query<Row>("SELECT * FROM webapp_notifications WHERE id = ?", [String(reference.id)])[0];
        if (!row) throw new Error("Notification row disappeared");
        const notification = webappNotificationFromRow(row).entity.notification;
        return { ...notification, payload: notification.payload.value };
      }
      const row = this.database.query<Row>("SELECT * FROM outbox_messages WHERE id = ?", [String(reference.id)])[0];
      if (!row) throw new Error("Outbox row disappeared");
      const message = outboxMessageFromRow(row).entity;
      return { id: message.id, channel: message.channel, userId: message.userId, type: message.type, payload: message.payload.value, read: true, createdAt: message.createdAt };
    });
    return { ...counts, latestOperations: this.operations(6), notifications };
  }

  private movementRows(query: Readonly<{ from?: string; to?: string; productId?: string; locationId?: string }>, onlyInventoryAdjustments = false): MovementReportRow[] {
    const clauses: string[] = [];
    const parameters: SqlValue[] = [];
    if (query.productId) { clauses.push("o.product_id = ?"); parameters.push(query.productId); }
    if (query.locationId) { clauses.push("(o.from_location_id = ? OR o.to_location_id = ?)"); parameters.push(query.locationId, query.locationId); }
    if (query.from) { clauses.push("substr(o.created_at, 1, 10) >= ?"); parameters.push(query.from); }
    if (query.to) { clauses.push("substr(o.created_at, 1, 10) <= ?"); parameters.push(query.to); }
    if (onlyInventoryAdjustments) clauses.push("o.type = 'inventory_adjustment'");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.query<Row>(
      `SELECT o.*, p.unit, p.local_name, p.official_name, fl.name AS from_location_name, tl.name AS to_location_name,
              u.first_name AS actor_first_name, u.last_name AS actor_last_name
       FROM stock_operations o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN locations fl ON fl.id = o.from_location_id
       LEFT JOIN locations tl ON tl.id = o.to_location_id
       LEFT JOIN users u ON u.id = o.actor_id
       ${where} ORDER BY o.created_at DESC, o.id DESC`, parameters
    ).map((row) => {
      const unit = row.unit as Product["unit"];
      const operation = stockOperationMapper.fromRow(row, unit);
      const metadata = operation.metadata?.value ?? {};
      const number = (key: string) => typeof metadata[key] === "number" ? metadata[key] : null;
      const actorName = [row.actor_first_name, row.actor_last_name].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ") || operation.actorId;
      return {
        id: operation.id, occurredAt: operation.createdAt, type: operation.type, productId: operation.productId,
        productName: typeof row.local_name === "string" && row.local_name || typeof row.official_name === "string" && row.official_name || operation.productId,
        fromLocationId: operation.fromLocationId ?? null, fromLocationName: typeof row.from_location_name === "string" ? row.from_location_name : operation.fromLocationId ?? null,
        toLocationId: operation.toLocationId ?? null, toLocationName: typeof row.to_location_name === "string" ? row.to_location_name : operation.toLocationId ?? null,
        quantity: operation.quantity, actorId: operation.actorId, actorName, reason: operation.reason || "Не указано",
        reversedOperationId: operation.reversedOperationId ?? null, inventoryExpected: number("expected"), inventoryActual: number("actual"), inventoryDelta: number("delta")
      };
    });
  }
}
