import { nanoid } from "nanoid";
import { addQuantity, QuantityError, requireQuantity, subtractQuantity, type QuantityUnit } from "../shared/quantity";
import type { InventorySnapshotRow, Permission, StockBalance } from "../shared/types";
import { CommandExecutor, type CommandContext, type CommandMetadata } from "./command-context";
import { canonicalRequestHash, executeIdempotently, type IdempotencyResult, type IdempotentHttpResponse } from "./idempotency";
import type { JsonObject, RepositoryStockOperation, UtcTimestamp } from "./repositories";
import { detectStockLevelEvent, writeStockLevelEvent, type StockCommandRepositories } from "./stock-operation-service";

type CommandResult = IdempotencyResult<JsonObject> | Readonly<{ outcome: "rejected"; status: 403 | 409; body: JsonObject }>;
type IdKind = "operation" | "audit" | "notification" | "outbox";
export type InventoryReversalServiceOptions = Readonly<{
  processingTimeoutMs: number;
  idempotencyRetentionMs: number;
  outboxMaxAttempts: number;
  createId?: (kind: IdKind) => string;
}>;
export type InventoryCommand = Readonly<{ rows: readonly InventorySnapshotRow[]; comment: string }>;

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

function authorized(context: CommandContext<StockCommandRepositories>, permission: Permission) {
  if (context.actor.kind !== "user") return undefined;
  const authorization = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return authorization.outcome === "found" && authorization.snapshot.permissions.includes(permission) ? authorization.snapshot : undefined;
}

function saveExistingBalance(repositories: StockCommandRepositories, current: NonNullable<ReturnType<StockCommandRepositories["stock"]["findBalance"]>>, next: StockBalance, at: UtcTimestamp) {
  const result = repositories.stock.saveBalance(next, { at, expectedRevision: current.revision });
  if (result.outcome !== "updated") throw new Error("Inventory/reversal balance CAS failed");
}

function saveMaybeNewBalance(repositories: StockCommandRepositories, current: ReturnType<StockCommandRepositories["stock"]["findBalance"]>, next: StockBalance, at: UtcTimestamp) {
  const result = current
    ? repositories.stock.saveBalance(next, { at, expectedRevision: current.revision })
    : repositories.stock.saveBalance(next, { at, expectedRevision: null });
  if ((current && result.outcome !== "updated") || (!current && result.outcome !== "created")) throw new Error("Reversal balance CAS failed");
}

function created(result: { outcome: string }, entity: string) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided`);
}

export class InventoryService {
  private readonly createId: (kind: IdKind) => string;
  constructor(private readonly executor: CommandExecutor<StockCommandRepositories>, private readonly options: InventoryReversalServiceOptions) {
    this.createId = options.createId ?? (() => nanoid());
  }

  execute(metadata: CommandMetadata, input: InventoryCommand): CommandResult {
    return this.executor.execute(metadata, (context) => {
      const actor = authorized(context, "inventory:write");
      if (!actor) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      if (context.transaction.repositories.inventoryGuard.isOpen()) return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "Используйте активную сессию инвентаризации" } } as const;
      const request: JsonObject = {
        comment: input.comment,
        rows: input.rows.map((row) => ({
          productId: row.productId, locationId: row.locationId, expected: row.expected,
          version: row.version, actual: row.actual ?? null
        }))
      };
      return executeIdempotently<StockCommandRepositories, JsonObject>(context, "stock.inventory", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, actor.userId, input));
    }, { transactionMode: "immediate" });
  }

  private apply(context: CommandContext<StockCommandRepositories>, actorId: string, input: InventoryCommand): IdempotentHttpResponse<JsonObject> {
    if (!input.comment.trim()) return response(400, "COMMENT_REQUIRED", "Для инвентаризации обязателен комментарий");
    if (!input.rows.length) return response(400, "EMPTY_INVENTORY", "Строки инвентаризации не переданы");
    const repositories = context.transaction.repositories;
    const invalid: JsonObject[] = [];
    const conflicts: JsonObject[] = [];
    const seen = new Set<string>();
    const plans: Array<{
      row: InventorySnapshotRow & { actual: number };
      product: NonNullable<ReturnType<StockCommandRepositories["products"]["findById"]>>["entity"];
      balance: NonNullable<ReturnType<StockCommandRepositories["stock"]["findBalance"]>>;
      delta: number;
    }> = [];

    for (const row of input.rows) {
      const key = `${row.productId}\u0000${row.locationId}`;
      if (seen.has(key)) { invalid.push({ productId: row.productId, locationId: row.locationId, code: "DUPLICATE_ROW" }); continue; }
      seen.add(key);
      const productRecord = repositories.products.findById(row.productId);
      const locationRecord = repositories.locations.findById(row.locationId);
      const balance = repositories.stock.findBalance(row.productId, row.locationId);
      if (!productRecord || productRecord.entity.status === "deleted" || !locationRecord || locationRecord.entity.status !== "active" || !balance) {
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "NOT_FOUND" });
        continue;
      }
      let actual: number;
      let expected: number;
      try {
        actual = requireQuantity(row.actual as number, { unit: productRecord.entity.unit });
        expected = requireQuantity(row.expected, { unit: productRecord.entity.unit });
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "BAD_QUANTITY" });
        continue;
      }
      if (!Number.isSafeInteger(row.version) || row.version !== balance.entity.version || expected !== balance.entity.quantity) {
        conflicts.push({ productId: row.productId, locationId: row.locationId, expectedVersion: row.version, actualVersion: balance.entity.version });
        continue;
      }
      try {
        const delta = subtractQuantity(actual, balance.entity.quantity, productRecord.entity.unit as QuantityUnit);
        plans.push({ row: { ...row, actual }, product: productRecord.entity, balance, delta });
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        invalid.push({ productId: row.productId, locationId: row.locationId, code: "STOCK_LIMIT_EXCEEDED" });
      }
    }
    if (invalid.length) return response(400, "BAD_INVENTORY_ROWS", "Некорректные строки инвентаризации", { rows: invalid });
    if (conflicts.length) return response(409, "INVENTORY_CONFLICT", "Остатки изменились после snapshot", { rows: conflicts });

    const totals = new Map<string, { before: number; after: number; threshold: number }>();
    try {
      for (const plan of plans) {
        let current = totals.get(plan.row.productId);
        if (!current) {
          const before = repositories.stock.sumBalance(plan.row.productId);
          current = { before, after: before, threshold: plan.product.lowStockThreshold };
        }
        current.after = addQuantity(current.after, plan.delta, plan.product.unit as QuantityUnit);
        totals.set(plan.row.productId, current);
      }
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response(409, "STOCK_LIMIT_EXCEEDED", "Результирующий остаток выходит за допустимый диапазон");
    }

    const at = context.clock.now();
    const operations: JsonObject[] = [];
    const lastOperationByProduct = new Map<string, string>();
    for (const plan of plans) {
      if (plan.delta === 0) continue;
      saveExistingBalance(repositories, plan.balance, {
        ...plan.balance.entity,
        quantity: plan.row.actual,
        version: plan.balance.entity.version + 1
      }, at);
      const operationId = this.createId("operation");
      const operation: RepositoryStockOperation = {
        id: operationId, type: "inventory_adjustment", productId: plan.row.productId,
        toLocationId: plan.row.locationId, quantity: Math.abs(plan.delta), actorId,
        reason: input.comment.trim(),
        idempotencyKey: `stock.inventory:${canonicalRequestHash([context.idempotencyKey, plan.row.productId, plan.row.locationId])}`,
        metadata: { schemaVersion: 1, value: { expected: plan.row.expected, actual: plan.row.actual, delta: plan.delta, correlationId: context.correlationId } },
        createdAt: at
      };
      created(repositories.stock.appendOperation(operation, { at, expectedRevision: null }), "inventory operation");
      operations.push({ id: operationId, productId: plan.row.productId, locationId: plan.row.locationId, expected: plan.row.expected, actual: plan.row.actual, delta: plan.delta });
      lastOperationByProduct.set(plan.row.productId, operationId);
    }
    for (const [productId, total] of totals) {
      const operationId = lastOperationByProduct.get(productId);
      const eventType = detectStockLevelEvent(total.before, total.after, total.threshold);
      if (operationId && eventType) writeStockLevelEvent(context, eventType, {
        operationId, productId, before: total.before, after: total.after, threshold: total.threshold,
        correlationId: context.correlationId
      }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });
    }
    created(repositories.audit.append({
      id: this.createId("audit"), actorId, entity: "inventory", entityId: context.idempotencyKey, action: "apply",
      changes: { schemaVersion: 1, value: {
        comment: input.comment.trim(), requestedCount: input.rows.length, changedCount: operations.length,
        operationIds: operations.map((operation) => operation.id), rows: operations, correlationId: context.correlationId
      } },
      requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null }), "inventory audit");
    return { status: 201, body: { operations } };
  }
}

export class ReversalService {
  private readonly createId: (kind: IdKind) => string;
  constructor(private readonly executor: CommandExecutor<StockCommandRepositories>, private readonly options: InventoryReversalServiceOptions) {
    this.createId = options.createId ?? (() => nanoid());
  }

  execute(metadata: CommandMetadata, operationId: string): CommandResult {
    return this.executor.execute(metadata, (context) => {
      const actor = authorized(context, "techlog:read");
      if (!actor) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
      if (context.transaction.repositories.inventoryGuard.isOpen()) return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "Складские операции заблокированы активной инвентаризацией" } } as const;
      return executeIdempotently<StockCommandRepositories, JsonObject>(context, "stock.reversal", { operationId }, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.apply(context, actor.userId, operationId));
    }, { transactionMode: "immediate" });
  }

  private apply(context: CommandContext<StockCommandRepositories>, actorId: string, operationId: string): IdempotentHttpResponse<JsonObject> {
    const repositories = context.transaction.repositories;
    const originalRecord = repositories.stock.findOperation(operationId);
    if (!originalRecord) return response(404, "NOT_FOUND", "Операция не найдена");
    const original = originalRecord.entity;
    if (original.type === "reversal" || original.type === "merge") return response(400, "BAD_REVERSAL_TARGET", "Операцию нельзя отменить");
    if (repositories.stock.findReversalFor(operationId)) return response(409, "ALREADY_REVERSED", "Операция уже отменена");
    const productRecord = repositories.products.findById(original.productId);
    if (!productRecord || productRecord.entity.status === "deleted") return response(404, "PRODUCT_NOT_FOUND", "Товар не найден");
    const unit = productRecord.entity.unit as QuantityUnit;
    const malformedShape = (original.type === "transfer" && (!original.fromLocationId || !original.toLocationId || original.fromLocationId === original.toLocationId))
      || ((original.type === "receipt" || original.type === "correction") && (!original.toLocationId || original.fromLocationId !== undefined))
      || (original.type === "write_off" && (!original.fromLocationId || original.toLocationId !== undefined))
      || (original.type === "inventory_adjustment" && (!original.toLocationId || original.fromLocationId !== undefined));
    if (malformedShape) return response(409, "BAD_REVERSAL_STATE", "Оригинальная операция имеет недопустимую форму");
    let decrementLocation = original.toLocationId;
    let incrementLocation = original.fromLocationId;
    if (original.type === "inventory_adjustment") {
      const metadata = original.metadata?.value;
      const expected = metadata?.expected;
      const actual = metadata?.actual;
      const delta = metadata?.delta;
      try {
        if (typeof expected !== "number" || typeof actual !== "number" || typeof delta !== "number") throw new QuantityError("NOT_FINITE");
        const normalizedExpected = requireQuantity(expected, { unit });
        const normalizedActual = requireQuantity(actual, { unit });
        const normalizedDelta = subtractQuantity(normalizedActual, normalizedExpected, unit);
        if (delta === 0 || normalizedDelta !== delta || Math.abs(normalizedDelta) !== original.quantity) throw new QuantityError("PRECISION");
      } catch (error) {
        if (!(error instanceof QuantityError)) throw error;
        return response(409, "BAD_REVERSAL_STATE", "Инвентаризационная операция повреждена");
      }
      if (delta < 0) { decrementLocation = undefined; incrementLocation = original.toLocationId; }
      else { decrementLocation = original.toLocationId; incrementLocation = undefined; }
    }
    const decrement = decrementLocation ? repositories.stock.findBalance(original.productId, decrementLocation) : undefined;
    const increment = incrementLocation ? repositories.stock.findBalance(original.productId, incrementLocation) : undefined;
    if (decrementLocation && (!decrement || decrement.entity.quantity < original.quantity)) {
      return response(409, "NEGATIVE_STOCK_BLOCKED", "Отмена приведёт к отрицательному остатку");
    }
    let beforeTotal: number;
    let afterTotal: number;
    let decrementNext: StockBalance | undefined;
    let incrementNext: StockBalance | undefined;
    try {
      beforeTotal = repositories.stock.sumBalance(original.productId);
      if (decrementLocation && decrement) decrementNext = { ...decrement.entity, quantity: subtractQuantity(decrement.entity.quantity, original.quantity, unit), version: decrement.entity.version + 1 };
      if (incrementLocation) incrementNext = {
        productId: original.productId, locationId: incrementLocation,
        quantity: addQuantity(increment?.entity.quantity ?? 0, original.quantity, unit), version: (increment?.entity.version ?? 0) + 1
      };
      const totalDelta = (incrementLocation ? original.quantity : 0) - (decrementLocation ? original.quantity : 0);
      afterTotal = addQuantity(beforeTotal, totalDelta, unit);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response(409, "STOCK_LIMIT_EXCEEDED", "Результирующий остаток выходит за допустимый диапазон");
    }
    const at = context.clock.now();
    if (decrementNext && decrement) saveExistingBalance(repositories, decrement, decrementNext, at);
    if (incrementNext) saveMaybeNewBalance(repositories, increment, incrementNext, at);
    const reversalId = this.createId("operation");
    const reversal: RepositoryStockOperation = {
      id: reversalId, type: "reversal", productId: original.productId,
      fromLocationId: decrementLocation, toLocationId: incrementLocation, quantity: original.quantity,
      actorId, reason: `Отмена ${original.id}`,
      idempotencyKey: `stock.reversal:${canonicalRequestHash([context.idempotencyKey, original.id])}`,
      reversedOperationId: original.id,
      metadata: { schemaVersion: 1, value: { originalId: original.id, correlationId: context.correlationId } },
      createdAt: at
    };
    created(repositories.stock.appendOperation(reversal, { at, expectedRevision: null }), "reversal");
    created(repositories.audit.append({
      id: this.createId("audit"), actorId, entity: "stock_operation", entityId: reversalId, action: "reverse",
      changes: { schemaVersion: 1, value: {
        originalId: original.id, reversalId, originalType: original.type, quantity: original.quantity,
        correlationId: context.correlationId
      } },
      requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null }), "reversal audit");
    const eventType = detectStockLevelEvent(beforeTotal, afterTotal, productRecord.entity.lowStockThreshold);
    if (eventType) writeStockLevelEvent(context, eventType, {
      operationId: reversalId, productId: original.productId, before: beforeTotal, after: afterTotal,
      threshold: productRecord.entity.lowStockThreshold, correlationId: context.correlationId
    }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });
    return { status: 201, body: { id: reversalId, type: "reversal", productId: original.productId, fromLocationId: decrementLocation ?? null, toLocationId: incrementLocation ?? null, quantity: original.quantity, actorId, reason: reversal.reason, idempotencyKey: context.idempotencyKey, reversedOperationId: original.id, createdAt: at } };
  }
}
