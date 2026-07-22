import { nanoid } from "nanoid";
import { quantityFromMinor, quantityToMinor, requireQuantity } from "../shared/quantity";
import type { Product } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import type { AuditRepository, IdempotencyRepository, JsonObject, ProductsRepository, RepositoryStockOperation, RolesRepository } from "./repositories";

export type InventorySession = Readonly<{ id: string; status: "active" | "closing" | "completed" | "cancelled"; actorId: string; comment: string; startedAt: string; completedAt?: string; version: number }>;
export type InventorySessionRow = Readonly<{ sessionId: string; productId: string; expected: number; actual?: number; version: number }>;
export type InventorySessionRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  products: Pick<ProductsRepository, "findById"> & Readonly<{ listWeight(): readonly Product[] }>;
  sessions: Readonly<{
    findOpen(): InventorySession | undefined;
    findById(id: string): InventorySession | undefined;
    create(session: InventorySession, rows: readonly InventorySessionRow[], at: string): boolean;
    rows(sessionId: string): readonly InventorySessionRow[];
    save(session: InventorySession, expectedVersion: number, at: string): boolean;
    saveActual(sessionId: string, productId: string, actual: number, expectedVersion: number, at: string): boolean;
  }>;
  totals: Readonly<{
    find(productId: string): Readonly<{ quantity: number; version: number }> | undefined;
    save(productId: string, quantity: number, expectedVersion: number, at: string): boolean;
  }>;
  ledger: Readonly<{
    appendOperation(operation: RepositoryStockOperation): boolean;
    appendConsumption(input: Readonly<{ id: string; productId: string; quantity: number; source: "inventory" | "manual" | "damage"; inventorySessionId?: string; stockOperationId: string; actorId: string; comment: string; createdAt: string }>): boolean;
  }>;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

type Result = IdempotencyResult<JsonObject> | Readonly<{ outcome: "rejected"; status: 403 | 409; body: JsonObject }>;
type Options = Readonly<{ processingTimeoutMs: number; idempotencyRetentionMs: number; createId?: (kind: "session" | "operation" | "consumption" | "audit") => string }>;

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

export class InventorySessionService {
  private readonly createId: NonNullable<Options["createId"]>;
  constructor(private readonly executor: CommandExecutor<InventorySessionRepositories>, private readonly options: Options) {
    this.createId = options.createId ?? (() => nanoid());
  }

  start(metadata: CommandMetadata): Result {
    return this.command(metadata, "inventory.session.start", {}, (context, actorId) => {
      const repositories = context.transaction.repositories;
      const existing = repositories.sessions.findOpen();
      if (existing) return response(409, "INVENTORY_ALREADY_ACTIVE", "Инвентаризация уже запущена", { sessionId: existing.id });
      const products = repositories.products.listWeight().filter((product) => product.status === "active");
      if (!products.length) return response(400, "NO_WEIGHT_PRODUCTS", "Нет активных весовых товаров для инвентаризации");
      const at = context.clock.now();
      const session: InventorySession = { id: this.createId("session"), status: "active", actorId, comment: "", startedAt: at, version: 0 };
      const rows = products.map((product): InventorySessionRow => ({ sessionId: session.id, productId: product.id, expected: repositories.totals.find(product.id)?.quantity ?? 0, version: 0 }));
      if (!repositories.sessions.create(session, rows, at)) throw new Error("inventory session insert collided");
      this.audit(context, actorId, "inventory_session", session.id, "start", { rowCount: rows.length }, at);
      return { status: 201, body: { session, rows } as unknown as JsonObject };
    });
  }

  close(metadata: CommandMetadata, sessionId: string, input: Readonly<{ rows: readonly Readonly<{ productId: string; actual: number }>[]; comment?: string }>): Result {
    return this.command(metadata, "inventory.session.close", JSON.parse(JSON.stringify({ sessionId, ...input })) as JsonObject, (context, actorId) => {
      const repositories = context.transaction.repositories;
      const session = repositories.sessions.findById(sessionId);
      if (!session) return response(404, "NOT_FOUND", "Инвентаризация не найдена");
      if (session.status === "completed") return response(409, "INVENTORY_ALREADY_CLOSED", "Инвентаризация уже завершена");
      if (session.status !== "active") return response(409, "INVENTORY_NOT_ACTIVE", "Инвентаризация недоступна для завершения");
      if (session.actorId !== actorId) return response(403, "INVENTORY_OWNER_REQUIRED", "Инвентаризацию завершает начавший её сотрудник");
      const snapshots = repositories.sessions.rows(sessionId);
      if (input.rows.length !== snapshots.length || new Set(input.rows.map((row) => row.productId)).size !== snapshots.length) return response(400, "INVENTORY_ROWS_INCOMPLETE", "Нужно заполнить все строки инвентаризации");
      const at = context.clock.now();
      const plans: Array<{ snapshot: InventorySessionRow; product: Product; total: { quantity: number; version: number }; actual: number; delta: number }> = [];
      for (const snapshot of snapshots) {
        const submitted = input.rows.find((row) => row.productId === snapshot.productId);
        const product = repositories.products.findById(snapshot.productId)?.entity;
        const total = repositories.totals.find(snapshot.productId);
        if (!submitted || !product || !total) return response(409, "INVENTORY_STATE_CHANGED", "Состав инвентаризации изменился");
        let actual: number;
        try { actual = requireQuantity(submitted.actual, { unit: "шт" }); } catch { return response(400, "BAD_QUANTITY", "Остаток задаётся целыми пачками"); }
        if (total.quantity !== snapshot.expected) return response(409, "INVENTORY_CONFLICT", "Остаток изменился после запуска");
        plans.push({ snapshot, product, total, actual, delta: actual - snapshot.expected });
      }
      if (!repositories.sessions.save({ ...session, status: "closing", version: session.version + 1 }, session.version, at)) throw new Error("inventory session CAS failed");
      const operations: JsonObject[] = [];
      for (const { snapshot, total, actual, delta } of plans) {
        if (!repositories.sessions.saveActual(sessionId, snapshot.productId, actual, snapshot.version, at)) throw new Error("inventory row CAS failed");
        if (delta === 0) continue;
        if (!repositories.totals.save(snapshot.productId, actual, total.version, at)) throw new Error("inventory total CAS failed");
        const operationId = this.createId("operation");
        const operation: RepositoryStockOperation = { id: operationId, type: "inventory_adjustment", productId: snapshot.productId, quantity: Math.abs(delta), actorId, reason: input.comment?.trim() || "Инвентаризация", idempotencyKey: `inventory.session:${sessionId}:${snapshot.productId}`, metadata: { schemaVersion: 1, value: { sessionId, expected: snapshot.expected, actual, delta, totalOnly: true, correlationId: context.correlationId } }, createdAt: at };
        if (!repositories.ledger.appendOperation(operation)) throw new Error("inventory operation insert collided");
        if (delta < 0 && !repositories.ledger.appendConsumption({ id: this.createId("consumption"), productId: snapshot.productId, quantity: -delta, source: "inventory", inventorySessionId: sessionId, stockOperationId: operationId, actorId, comment: input.comment?.trim() || "Инвентаризация", createdAt: at })) throw new Error("inventory consumption insert collided");
        operations.push({ operationId, productId: snapshot.productId, expected: snapshot.expected, actual, delta });
      }
      const closing = repositories.sessions.findById(sessionId);
      if (!closing || !repositories.sessions.save({ ...closing, status: "completed", comment: input.comment?.trim() || "", completedAt: at, version: closing.version + 1 }, closing.version, at)) throw new Error("inventory completion failed");
      this.audit(context, actorId, "inventory_session", sessionId, "close", { operations, comment: input.comment?.trim() || "" }, at);
      return { status: 200, body: { sessionId, status: "completed", operations } };
    });
  }

  consume(metadata: CommandMetadata, input: Readonly<{ productId: string; quantity: number; comment?: string; source?: "manual" | "damage" }>): Result {
    return this.applyAdjustment(metadata, "inventory.consumption", { ...input, direction: "consume" }, true);
  }

  adjust(metadata: CommandMetadata, input: Readonly<{ productId: string; delta: number; comment?: string }>): Result {
    return this.applyAdjustment(metadata, "inventory.adjustment", { ...input, direction: "adjust" }, false);
  }

  private applyAdjustment(metadata: CommandMetadata, scope: string, input: Readonly<Record<string, unknown>>, consumption: boolean): Result {
    return this.command(metadata, scope, JSON.parse(JSON.stringify(input)) as JsonObject, (context, actorId) => {
      const repositories = context.transaction.repositories;
      if (repositories.sessions.findOpen()) return response(409, "INVENTORY_ACTIVE", "Операция заблокирована активной инвентаризацией");
      const productId = String(input.productId || "");
      const product = repositories.products.findById(productId)?.entity;
      const total = repositories.totals.find(productId);
      if (!product || !total) return response(404, "NOT_FOUND", "Товар не найден");
      let delta: number;
      try {
        const raw = consumption ? -Number(input.quantity) : Number(input.delta);
        if (raw === 0) throw new Error("zero");
        delta = Math.sign(raw) * requireQuantity(Math.abs(raw), { unit: product.inventoryKind === "weight" ? "шт" : product.unit, allowZero: false });
      } catch { return response(400, "BAD_QUANTITY", "Некорректное количество"); }
      const next = total.quantity + delta;
      if (next < 0) return response(409, "NEGATIVE_STOCK_BLOCKED", "Остаток не может стать отрицательным");
      const at = context.clock.now();
      if (!repositories.totals.save(productId, next, total.version, at)) return response(409, "VERSION_CONFLICT", "Общий остаток уже изменён");
      const operationId = this.createId("operation");
      const operation: RepositoryStockOperation = { id: operationId, type: "inventory_adjustment", productId, quantity: Math.abs(delta), actorId, reason: String(input.comment || "").trim() || (consumption ? "Расход" : "Корректировка"), idempotencyKey: `${scope}:${context.idempotencyKey}`, metadata: { schemaVersion: 1, value: { delta, totalOnly: true, kind: consumption ? "consumption" : "adjustment", correlationId: context.correlationId } }, createdAt: at };
      if (!repositories.ledger.appendOperation(operation)) throw new Error("adjustment operation insert collided");
      if (consumption && !repositories.ledger.appendConsumption({ id: this.createId("consumption"), productId, quantity: -delta, source: input.source === "damage" ? "damage" : "manual", stockOperationId: operationId, actorId, comment: operation.reason, createdAt: at })) throw new Error("consumption insert collided");
      this.audit(context, actorId, consumption ? "consumption" : "inventory_adjustment", operationId, "create", { productId, delta, before: total.quantity, after: next }, at);
      return { status: 201, body: { operationId, productId, delta, before: total.quantity, after: next } };
    });
  }

  private command(metadata: CommandMetadata, scope: string, request: JsonObject, run: (context: CommandContext<InventorySessionRepositories>, actorId: string) => Readonly<{ status: number; body: JsonObject }>): Result {
    return this.executor.execute(metadata, (context) => {
      if (context.actor.kind !== "user") return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      const authorization = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
      if (authorization.outcome !== "found" || !authorization.snapshot.permissions.includes("inventory:write")) return { outcome: "rejected", status: 403, body: { code: "FORBIDDEN", message: "Недостаточно прав" } } as const;
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, authorization.snapshot.userId));
    }, { transactionMode: "immediate" });
  }

  private audit(context: CommandContext<InventorySessionRepositories>, actorId: string, entity: string, entityId: string, action: string, changes: JsonObject, at: string) {
    const result = context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null });
    if (result.outcome !== "created") throw new Error("inventory audit insert collided");
  }
}
