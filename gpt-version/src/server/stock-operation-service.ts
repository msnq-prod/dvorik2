import { nanoid } from "nanoid";
import { QuantityError, requireQuantity, addQuantity, subtractQuantity, type QuantityUnit } from "../shared/quantity";
import type { StockBalance, StockOperationType } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult, type IdempotentHttpResponse } from "./idempotency";
import type {
  AuditRepository,
  AuthorizationLookup,
  CreateResult,
  IdempotencyRepository,
  JsonObject,
  LocationsRepository,
  NotificationsRepository,
  OutboxRepository,
  ProductsRepository,
  RepositoryStockOperation,
  RolesRepository,
  StockRepository,
  UtcTimestamp
} from "./repositories";

const stockTypes = ["receipt", "transfer", "write_off", "correction"] as const;
type StockCommandType = (typeof stockTypes)[number];

export type StockOperationCommand = Readonly<{
  type: StockCommandType;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  reason?: string;
}>;

export type StockEventType = "stock.zero" | "stock.threshold";
export type StockEventDelivery = Readonly<{ userId: string; channel: "webapp" | "telegram" }>;
export type StockEventRecipients = Readonly<{
  resolveInstant(eventType: StockEventType): readonly StockEventDelivery[];
}>;

export type StockCommandRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  products: Pick<ProductsRepository, "findById">;
  locations: Pick<LocationsRepository, "findById">;
  stock: Pick<StockRepository, "findBalance" | "sumBalance" | "saveBalance" | "findOperation" | "findReversalFor" | "appendOperation">;
  notifications: Pick<NotificationsRepository, "append">;
  outbox: Pick<OutboxRepository, "enqueue">;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
  stockEventRecipients: StockEventRecipients;
  inventoryGuard: Readonly<{ isOpen(): boolean }>;
}>;

export type StockCommandResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403 | 409;
  body: JsonObject;
}>;

export type StockOperationServiceOptions = Readonly<{
  processingTimeoutMs: number;
  idempotencyRetentionMs: number;
  outboxMaxAttempts: number;
  createId?: (kind: "operation" | "audit" | "notification" | "outbox") => string;
}>;

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

function requireActiveAuthorization(context: CommandContext<StockCommandRepositories>): AuthorizationLookup | undefined {
  if (context.actor.kind !== "user") return undefined;
  return context.transaction.repositories.roles.getAuthorization(context.actor.userId);
}

function writeSucceeded<T>(result: CreateResult<T>, entity: string): void {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}

function saveBalance(
  repository: StockCommandRepositories["stock"],
  current: ReturnType<StockCommandRepositories["stock"]["findBalance"]>,
  next: StockBalance,
  at: UtcTimestamp
) {
  const result = current
    ? repository.saveBalance(next, { at, expectedRevision: current.revision })
    : repository.saveBalance(next, { at, expectedRevision: null });
  if ((current && result.outcome !== "updated") || (!current && result.outcome !== "created")) {
    throw new Error("Stock balance conditional write failed inside immediate transaction");
  }
}

export function detectStockLevelEvent(before: number, after: number, threshold: number): StockEventType | undefined {
  if (before > 0 && after === 0) return "stock.zero";
  if (after > 0 && before > threshold && after <= threshold) return "stock.threshold";
  return undefined;
}

export type StockLevelEventInput = Readonly<{
  operationId: string;
  productId: string;
  before: number;
  after: number;
  threshold: number;
  correlationId: string;
}>;

export function writeStockLevelEvent(
  context: CommandContext<StockCommandRepositories>,
  eventType: StockEventType,
  input: StockLevelEventInput,
  at: UtcTimestamp,
  options: Readonly<{ outboxMaxAttempts: number; createId: (kind: "notification" | "outbox") => string }>
) {
  const repositories = context.transaction.repositories;
  const payload: JsonObject = { schemaVersion: 1, eventType, ...input };
  for (const delivery of repositories.stockEventRecipients.resolveInstant(eventType)) {
    if (delivery.channel === "webapp") {
      writeSucceeded(repositories.notifications.append({
        id: options.createId("notification"), channel: "webapp", userId: delivery.userId, type: eventType,
        payload: { schemaVersion: 1, value: payload }, read: false, createdAt: at
      }, { at, expectedRevision: null }), "notification");
    } else {
      writeSucceeded(repositories.outbox.enqueue({
        id: options.createId("outbox"), channel: "telegram", userId: delivery.userId, type: eventType,
        payload: { schemaVersion: 1, value: payload }, status: "pending", attemptCount: 0,
        maxAttempts: options.outboxMaxAttempts, availableAt: at, createdAt: at,
        idempotencyKey: `stock:${input.operationId}:${eventType}:${delivery.userId}`
      }, { at, expectedRevision: null }), "outbox");
    }
  }
}

export class StockOperationService {
  private readonly createId: NonNullable<StockOperationServiceOptions["createId"]>;

  constructor(
    private readonly executor: CommandExecutor<StockCommandRepositories>,
    private readonly options: StockOperationServiceOptions
  ) {
    this.createId = options.createId ?? (() => nanoid());
  }

  execute(metadata: CommandMetadata, input: StockOperationCommand): StockCommandResult {
    return this.executor.execute(metadata, (context) => this.executeInContext(context, input), { transactionMode: "immediate" });
  }

  private executeInContext(context: CommandContext<StockCommandRepositories>, input: StockOperationCommand): StockCommandResult {
    const authorization = requireActiveAuthorization(context);
    if (!authorization || authorization.outcome !== "found" || !authorization.snapshot.permissions.includes("stock:move")) {
      return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") };
    }
    if (authorization.snapshot.role === "seller" && (input.type === "receipt" || input.type === "correction")) {
      return { outcome: "rejected", ...response(403, "FORBIDDEN_OPERATION", "Продавец не может выполнять приход или корректировку") };
    }
    if (context.transaction.repositories.inventoryGuard.isOpen()) {
      return { outcome: "rejected", status: 409, body: { code: "INVENTORY_ACTIVE", message: "Складские операции заблокированы активной инвентаризацией" } } as const;
    }

    const request: JsonObject = {
      type: input.type,
      productId: input.productId,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      quantity: input.quantity,
      reason: input.reason ?? ""
    };
    return executeIdempotently<StockCommandRepositories, JsonObject>(
      context,
      "stock.operation",
      request,
      { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs },
      () => this.apply(context, authorization.snapshot.userId, input)
    );
  }

  private apply(context: CommandContext<StockCommandRepositories>, actorId: string, input: StockOperationCommand): IdempotentHttpResponse<JsonObject> {
    const repositories = context.transaction.repositories;
    if (!stockTypes.includes(input.type as StockCommandType)) return response(400, "UNSUPPORTED_OPERATION", "Операция не поддерживается");
    if (!input.productId.trim()) return response(400, "BAD_PRODUCT_ID", "Товар не указан");
    const productRecord = repositories.products.findById(input.productId);
    if (!productRecord || productRecord.entity.status === "deleted") {
      return response(404, "PRODUCT_NOT_FOUND", "Товар не найден", { productId: input.productId });
    }
    const product = productRecord.entity;
    let quantity: number;
    try {
      quantity = requireQuantity(input.quantity, { unit: product.inventoryKind === "weight" ? "шт" : product.unit, allowZero: false });
    } catch {
      return response(400, "BAD_QUANTITY", "Количество должно быть больше нуля");
    }

    const shapeError = this.validateShape(input);
    if (shapeError) return shapeError;
    const sourceLocation = input.fromLocationId ? repositories.locations.findById(input.fromLocationId) : undefined;
    const targetLocation = input.toLocationId ? repositories.locations.findById(input.toLocationId) : undefined;
    if (input.fromLocationId && (!sourceLocation || sourceLocation.entity.status !== "active")) {
      return response(404, "LOCATION_NOT_FOUND", "Локация не найдена", { locationId: input.fromLocationId, role: "source" });
    }
    if (input.toLocationId && (!targetLocation || targetLocation.entity.status !== "active")) {
      return response(404, "LOCATION_NOT_FOUND", "Локация не найдена", { locationId: input.toLocationId, role: "target" });
    }

    let beforeTotal: number;
    try {
      beforeTotal = repositories.stock.sumBalance(input.productId);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response(409, "STOCK_TOTAL_OUT_OF_RANGE", "Суммарный остаток выходит за допустимый диапазон");
    }
    const source = input.fromLocationId ? repositories.stock.findBalance(input.productId, input.fromLocationId) : undefined;
    const target = input.toLocationId ? repositories.stock.findBalance(input.productId, input.toLocationId) : undefined;
    if (input.fromLocationId && (source?.entity.quantity ?? 0) < quantity) {
      return response(409, "NEGATIVE_STOCK_BLOCKED", "Остаток не может стать отрицательным");
    }

    let sourceNext: StockBalance | undefined;
    let targetNext: StockBalance | undefined;
    let afterTotal: number;
    try {
      if (input.fromLocationId) {
        const current = source?.entity.quantity ?? 0;
        sourceNext = {
          productId: input.productId,
          locationId: input.fromLocationId,
          quantity: subtractQuantity(current, quantity, product.unit as QuantityUnit),
          version: (source?.entity.version ?? 0) + 1
        };
      }
      if (input.toLocationId) {
        const current = target?.entity.quantity ?? 0;
        targetNext = {
          productId: input.productId,
          locationId: input.toLocationId,
          quantity: addQuantity(current, quantity, product.unit as QuantityUnit),
          version: (target?.entity.version ?? 0) + 1
        };
      }
      afterTotal = input.type === "transfer"
        ? beforeTotal
        : input.fromLocationId
          ? subtractQuantity(beforeTotal, quantity, product.unit as QuantityUnit)
          : addQuantity(beforeTotal, quantity, product.unit as QuantityUnit);
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response(409, "STOCK_LIMIT_EXCEEDED", "Результирующий остаток выходит за допустимый диапазон");
    }

    const at = context.clock.now();
    if (sourceNext) {
      saveBalance(repositories.stock, source, sourceNext, at);
    }
    if (targetNext) {
      saveBalance(repositories.stock, target, targetNext, at);
    }

    const operationId = this.createId("operation");
    const operation: RepositoryStockOperation = {
      id: operationId,
      type: input.type as StockOperationType,
      productId: input.productId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity,
      actorId,
      reason: input.reason?.trim() || "Без комментария",
      idempotencyKey: `stock.operation:${context.idempotencyKey}`,
      metadata: { schemaVersion: 1, value: { correlationId: context.correlationId } },
      createdAt: at
    };
    writeSucceeded(repositories.stock.appendOperation(operation, { at, expectedRevision: null }), "stock operation");

    writeSucceeded(repositories.audit.append({
      id: this.createId("audit"),
      actorId,
      entity: "stock_operation",
      entityId: operationId,
      action: "create",
      changes: {
        schemaVersion: 1,
        value: {
          type: operation.type,
          productId: operation.productId,
          fromLocationId: operation.fromLocationId ?? null,
          toLocationId: operation.toLocationId ?? null,
          quantity,
          actorId,
          reason: operation.reason,
          idempotencyKey: operation.idempotencyKey ?? null,
          correlationId: context.correlationId
        }
      },
      requestId: context.correlationId,
      createdAt: at
    }, { at, expectedRevision: null }), "audit");

    const eventType = detectStockLevelEvent(beforeTotal, afterTotal, product.lowStockThreshold);
    if (eventType) writeStockLevelEvent(context, eventType, {
      operationId,
      productId: input.productId,
      before: beforeTotal,
      after: afterTotal,
      threshold: product.lowStockThreshold,
      correlationId: context.correlationId
    }, at, { outboxMaxAttempts: this.options.outboxMaxAttempts, createId: this.createId });

    return {
      status: 201,
      body: {
        id: operationId,
        type: operation.type,
        productId: operation.productId,
        fromLocationId: operation.fromLocationId ?? null,
        toLocationId: operation.toLocationId ?? null,
        quantity,
        actorId,
        reason: operation.reason,
        idempotencyKey: context.idempotencyKey,
        metadata: { correlationId: context.correlationId },
        createdAt: at,
        eventType: eventType ?? null
      }
    } as const;
  }

  private validateShape(input: StockOperationCommand) {
    if (input.type === "transfer") {
      if (!input.fromLocationId || !input.toLocationId) return response(400, "BAD_TRANSFER", "Нужны источник и назначение");
      if (input.fromLocationId === input.toLocationId) return response(400, "BAD_TRANSFER", "Источник и назначение должны отличаться");
    } else if (input.type === "write_off") {
      if (!input.fromLocationId || input.toLocationId) return response(400, "BAD_WRITE_OFF", "Нужен только источник списания");
    } else if (!input.toLocationId || input.fromLocationId) {
      return response(400, "BAD_RECEIPT", "Нужно только назначение прихода");
    }
    return undefined;
  }

}
