import { nanoid } from "nanoid";
import { QuantityError, requireQuantity } from "../shared/quantity";
import type { Location, Manufacturer, Product, ProductGroup, ProductIdentifier, ProductPackaging, ProductPriceHistory } from "../shared/types";
import type { CommandContext, CommandMetadata } from "./command-context";
import { CommandExecutor } from "./command-context";
import { executeIdempotently, type IdempotencyResult } from "./idempotency";
import type { AuditRepository, IdempotencyRepository, JsonObject, LocationsRepository, ProductsRepository, RolesRepository } from "./repositories";

export type CatalogCommandRepositories = Readonly<{
  roles: Pick<RolesRepository, "getAuthorization">;
  products: Pick<ProductsRepository, "findById" | "findByIdentifier" | "create" | "save">;
  locations: Pick<LocationsRepository, "findById" | "findByCode" | "save">;
  catalog: Readonly<{
    findGroup(id: string): ProductGroup | undefined;
    saveGroup(group: ProductGroup, expectedVersion: number | null, at: string): "created" | "updated" | "duplicate" | "stale";
    findManufacturer(id: string): Manufacturer | undefined;
    saveManufacturer(manufacturer: Manufacturer, expectedVersion: number | null, at: string): "created" | "updated" | "duplicate" | "stale";
    appendPackaging(packaging: ProductPackaging, at: string): "created" | "duplicate";
    appendPrice(price: ProductPriceHistory): "created" | "duplicate";
  }>;
  audit: Pick<AuditRepository, "append">;
  idempotency: IdempotencyRepository;
}>;

export type CatalogServiceOptions = Readonly<{
  processingTimeoutMs: number;
  idempotencyRetentionMs: number;
  createId?: (kind: "product" | "identifier" | "audit") => string;
}>;

export type CatalogCommandResult = IdempotencyResult<JsonObject> | Readonly<{
  outcome: "rejected";
  status: 403;
  body: JsonObject;
}>;

export type CreateProductInput = Readonly<{
  officialName: string;
  localName?: string;
  unit: Product["unit"];
  photoUrl?: string;
  category?: string;
  lowStockThreshold?: number;
  identifiers?: readonly Readonly<Omit<ProductIdentifier, "id" | "productId">>[];
  groupId?: string;
  manufacturerId?: string;
  inventoryKind?: "piece" | "weight";
  packageMassGrams?: number;
  article?: string;
}>;

export type UpdateProductInput = Readonly<{
  productId: string;
  status?: Product["status"];
  localName?: string;
  category?: string;
  groupId?: string;
  manufacturerId?: string;
  packageMassGrams?: number;
  article?: string;
}>; 

const defaultPhoto = "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=80";

function response<const Status extends number>(status: Status, code: string, message: string, details?: JsonObject) {
  return { status, body: { code, message, ...(details ? { details } : {}) } } as const;
}

function authorized(context: CommandContext<CatalogCommandRepositories>) {
  if (context.actor.kind !== "user") return undefined;
  const authorization = context.transaction.repositories.roles.getAuthorization(context.actor.userId);
  return authorization.outcome === "found" && authorization.snapshot.permissions.includes("products:write")
    ? authorization.snapshot
    : undefined;
}

function writeCreated(result: { outcome: string }, entity: string) {
  if (result.outcome !== "created") throw new Error(`${entity} insert collided inside idempotent transaction`);
}

function jsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export class CatalogService {
  private readonly createId: NonNullable<CatalogServiceOptions["createId"]>;

  constructor(private readonly executor: CommandExecutor<CatalogCommandRepositories>, private readonly options: CatalogServiceOptions) {
    this.createId = options.createId ?? (() => nanoid());
  }

  create(metadata: CommandMetadata, input: CreateProductInput): CatalogCommandResult {
    return this.executor.execute(metadata, (context) => {
      const actor = authorized(context);
      if (!actor) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") } as const;
      const request = {
        officialName: input.officialName,
        localName: input.localName ?? "",
        unit: input.unit,
        photoUrl: input.photoUrl ?? defaultPhoto,
        category: input.category ?? "Без категории",
        lowStockThreshold: input.lowStockThreshold ?? 5,
        identifiers: (input.identifiers ?? []).map((item) => ({
          type: item.type, value: item.value, supplierId: item.supplierId ?? null
        })),
        groupId: input.groupId ?? null,
        manufacturerId: input.manufacturerId ?? null,
        inventoryKind: input.inventoryKind ?? "piece",
        packageMassGrams: input.packageMassGrams ?? null,
        article: input.article ?? ""
      } satisfies JsonObject;
      return executeIdempotently(context, "catalog.product.create", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.applyCreate(context, actor.userId, input));
    }, { transactionMode: "immediate" });
  }

  update(metadata: CommandMetadata, input: UpdateProductInput): CatalogCommandResult {
    return this.executor.execute(metadata, (context) => {
      const actor = authorized(context);
      if (!actor) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") } as const;
      const request = {
        productId: input.productId,
        status: input.status ?? null,
        localName: input.localName ?? null,
        category: input.category ?? null
        ,groupId: input.groupId ?? null,
        manufacturerId: input.manufacturerId ?? null,
        packageMassGrams: input.packageMassGrams ?? null,
        article: input.article ?? null
      } satisfies JsonObject;
      return executeIdempotently(context, "catalog.product.update", request, {
        processingTimeoutMs: this.options.processingTimeoutMs,
        retentionMs: this.options.idempotencyRetentionMs
      }, () => this.applyUpdate(context, actor.userId, input));
    }, { transactionMode: "immediate" });
  }

  private applyCreate(context: CommandContext<CatalogCommandRepositories>, actorId: string, input: CreateProductInput) {
    if (!input.officialName.trim()) return response(400, "VALIDATION_ERROR", "Название обязательно");
    if (!["шт", "кг", "л", "м"].includes(input.unit)) return response(400, "VALIDATION_ERROR", "Недопустимая единица измерения");
    let lowStockThreshold: number;
    try {
      lowStockThreshold = requireQuantity(input.lowStockThreshold ?? 5, { unit: input.unit });
    } catch (error) {
      if (!(error instanceof QuantityError)) throw error;
      return response(400, "VALIDATION_ERROR", "Минимальный остаток имеет недопустимую точность");
    }
    for (const identifier of input.identifiers ?? []) {
      if (!identifier.value.trim()) return response(400, "VALIDATION_ERROR", "Идентификатор не может быть пустым");
      const duplicate = context.transaction.repositories.products.findByIdentifier({
        type: identifier.type,
        value: identifier.value,
        ...(identifier.supplierId ? { supplierId: identifier.supplierId } : {})
      });
      if (duplicate) return response(409, "IDENTIFIER_CONFLICT", "Идентификатор уже принадлежит другому товару", { productId: duplicate.entity.id });
    }
    const productId = this.createId("product");
    const inventoryKind = input.inventoryKind ?? "piece";
    if (inventoryKind === "piece" && input.unit !== "шт") return response(400, "PIECE_UNIT_REQUIRED", "Штучный товар учитывается только целыми штуками");
    if (inventoryKind === "weight" && (!Number.isInteger(input.packageMassGrams) || Number(input.packageMassGrams) <= 0)) {
      return response(400, "PACKAGE_MASS_REQUIRED", "Для весового товара нужна положительная масса пачки в граммах");
    }
    const group = input.groupId ? context.transaction.repositories.catalog.findGroup(input.groupId) : undefined;
    if (input.groupId && (!group || group.status !== "active")) return response(404, "GROUP_NOT_FOUND", "Группа товара не найдена");
    if (group && group.inventoryKind !== inventoryKind) return response(409, "GROUP_KIND_CONFLICT", "Тип товара не совпадает с типом группы");
    const manufacturer = input.manufacturerId ? context.transaction.repositories.catalog.findManufacturer(input.manufacturerId) : undefined;
    if (input.manufacturerId && (!manufacturer || manufacturer.status !== "active")) return response(404, "MANUFACTURER_NOT_FOUND", "Производитель не найден");
    const product: Product = {
      id: productId,
      officialName: input.officialName.trim(),
      localName: input.localName?.trim() ?? "",
      unit: input.unit,
      photoUrl: input.photoUrl?.trim() || defaultPhoto,
      category: input.category?.trim() || "Без категории",
      tags: [],
      status: "active",
      identifiers: (input.identifiers ?? []).map((identifier) => ({
        id: this.createId("identifier"), productId, type: identifier.type, value: identifier.value.trim(),
        ...(identifier.supplierId ? { supplierId: identifier.supplierId } : {})
      })),
      lowStockThreshold
      ,groupId: input.groupId,
      manufacturerId: input.manufacturerId,
      inventoryKind,
      packageMassGrams: input.packageMassGrams,
      article: input.article?.trim() ?? ""
    };
    const at = context.clock.now();
    writeCreated(context.transaction.repositories.products.create(product, { at, expectedRevision: null }), "product");
    writeCreated(context.transaction.repositories.audit.append({
      id: this.createId("audit"), actorId, entity: "product", entityId: product.id, action: "create",
      changes: { schemaVersion: 1, value: jsonObject(product) }, requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null }), "audit");
    return { status: 201, body: jsonObject(product) } as const;
  }

  private applyUpdate(context: CommandContext<CatalogCommandRepositories>, actorId: string, input: UpdateProductInput) {
    const current = context.transaction.repositories.products.findById(input.productId);
    if (!current) return response(404, "NOT_FOUND", "Товар не найден");
    if (input.status !== undefined && !["active", "archived", "deleted"].includes(input.status)) {
      return response(400, "VALIDATION_ERROR", "Недопустимый статус товара");
    }
    const next: Product = {
      ...current.entity,
      status: input.status ?? current.entity.status,
      localName: input.localName === undefined ? current.entity.localName : input.localName.trim(),
      category: input.category === undefined ? current.entity.category : input.category.trim()
      ,groupId: input.groupId === undefined ? current.entity.groupId : input.groupId || undefined,
      manufacturerId: input.manufacturerId === undefined ? current.entity.manufacturerId : input.manufacturerId || undefined,
      packageMassGrams: input.packageMassGrams === undefined ? current.entity.packageMassGrams : input.packageMassGrams,
      article: input.article === undefined ? current.entity.article : input.article.trim()
    };
    if (next.inventoryKind === "weight" && (!Number.isInteger(next.packageMassGrams) || Number(next.packageMassGrams) <= 0)) {
      return response(400, "PACKAGE_MASS_REQUIRED", "Для весового товара нужна положительная масса пачки в граммах");
    }
    const group = next.groupId ? context.transaction.repositories.catalog.findGroup(next.groupId) : undefined;
    if (next.groupId && (!group || group.status !== "active")) return response(404, "GROUP_NOT_FOUND", "Группа товара не найдена");
    if (group && group.inventoryKind !== (next.inventoryKind ?? "piece")) return response(409, "GROUP_KIND_CONFLICT", "Тип товара не совпадает с типом группы");
    if (next.manufacturerId && !context.transaction.repositories.catalog.findManufacturer(next.manufacturerId)) return response(404, "MANUFACTURER_NOT_FOUND", "Производитель не найден");
    const at = context.clock.now();
    const saved = context.transaction.repositories.products.save(next, { at, expectedRevision: current.revision });
    if (saved.outcome === "missing") return response(404, "NOT_FOUND", "Товар не найден");
    if (saved.outcome === "stale") return response(409, "VERSION_CONFLICT", "Товар уже изменён");
    writeCreated(context.transaction.repositories.audit.append({
      id: this.createId("audit"), actorId, entity: "product", entityId: next.id, action: "update",
      changes: { schemaVersion: 1, value: { status: next.status, localName: next.localName, category: next.category } },
      requestId: context.correlationId, createdAt: at
    }, { at, expectedRevision: null }), "audit");
    return { status: 200, body: jsonObject(next) } as const;
  }

  createGroup(metadata: CommandMetadata, input: Readonly<{ name: string; inventoryKind: "piece" | "weight" }>): CatalogCommandResult {
    return this.referenceCommand(metadata, "catalog.group.create", input as unknown as JsonObject, (context, actorId) => {
      if (!input.name.trim() || (input.inventoryKind !== "piece" && input.inventoryKind !== "weight")) return response(400, "VALIDATION_ERROR", "Некорректная группа товара");
      const at = context.clock.now();
      const group: ProductGroup = { id: this.createId("product"), name: input.name.trim(), inventoryKind: input.inventoryKind, status: "active", version: 0 };
      if (context.transaction.repositories.catalog.saveGroup(group, null, at) !== "created") return response(409, "GROUP_CONFLICT", "Группа уже существует");
      this.appendAudit(context, actorId, "product_group", group.id, "create", group as unknown as JsonObject, at);
      return { status: 201, body: group as unknown as JsonObject };
    });
  }

  createManufacturer(metadata: CommandMetadata, input: Readonly<{ name: string }>): CatalogCommandResult {
    return this.referenceCommand(metadata, "catalog.manufacturer.create", input as unknown as JsonObject, (context, actorId) => {
      if (!input.name.trim()) return response(400, "VALIDATION_ERROR", "Название производителя обязательно");
      const at = context.clock.now();
      const manufacturer: Manufacturer = { id: this.createId("product"), name: input.name.trim(), status: "active", version: 0 };
      if (context.transaction.repositories.catalog.saveManufacturer(manufacturer, null, at) !== "created") return response(409, "MANUFACTURER_CONFLICT", "Производитель уже существует");
      this.appendAudit(context, actorId, "manufacturer", manufacturer.id, "create", manufacturer as unknown as JsonObject, at);
      return { status: 201, body: manufacturer as unknown as JsonObject };
    });
  }

  addPackaging(metadata: CommandMetadata, input: Readonly<{ productId: string; name: string; unitsPerPackage: number; massGrams?: number; isPrimary?: boolean }>): CatalogCommandResult {
    return this.referenceCommand(metadata, "catalog.packaging.create", jsonObject(input), (context, actorId) => {
      const product = context.transaction.repositories.products.findById(input.productId);
      if (!product) return response(404, "NOT_FOUND", "Товар не найден");
      if (!input.name.trim() || !Number.isInteger(input.unitsPerPackage) || input.unitsPerPackage <= 0 || (input.massGrams !== undefined && (!Number.isInteger(input.massGrams) || input.massGrams <= 0))) return response(400, "VALIDATION_ERROR", "Некорректная упаковка");
      const at = context.clock.now();
      const packaging: ProductPackaging = { id: this.createId("product"), productId: input.productId, name: input.name.trim(), unitsPerPackage: input.unitsPerPackage, massGrams: input.massGrams, isPrimary: Boolean(input.isPrimary), version: 0 };
      if (context.transaction.repositories.catalog.appendPackaging(packaging, at) !== "created") return response(409, "PACKAGING_CONFLICT", "Упаковка уже существует");
      this.appendAudit(context, actorId, "product_packaging", packaging.id, "create", jsonObject(packaging), at);
      return { status: 201, body: jsonObject(packaging) };
    });
  }

  addPrice(metadata: CommandMetadata, input: Readonly<{ groupId?: string; productId?: string; priceKopecks: number; priceUnit: "piece" | "kilogram"; effectiveFrom: string }>): CatalogCommandResult {
    return this.referenceCommand(metadata, "catalog.price.create", jsonObject(input), (context, actorId) => {
      if (Boolean(input.groupId) === Boolean(input.productId) || !Number.isSafeInteger(input.priceKopecks) || input.priceKopecks < 0 || !/^\d{4}-\d{2}-\d{2}T/.test(input.effectiveFrom)) return response(400, "VALIDATION_ERROR", "Некорректная запись цены");
      if (input.groupId && !context.transaction.repositories.catalog.findGroup(input.groupId)) return response(404, "GROUP_NOT_FOUND", "Группа товара не найдена");
      if (input.productId && !context.transaction.repositories.products.findById(input.productId)) return response(404, "NOT_FOUND", "Товар не найден");
      const at = context.clock.now();
      const price: ProductPriceHistory = { id: this.createId("product"), groupId: input.groupId, productId: input.productId, priceKopecks: input.priceKopecks, priceUnit: input.priceUnit, effectiveFrom: input.effectiveFrom, createdByUserId: actorId, createdAt: at };
      if (context.transaction.repositories.catalog.appendPrice(price) !== "created") throw new Error("price insert collided inside idempotent transaction");
      this.appendAudit(context, actorId, "product_price", price.id, "create", jsonObject(price), at);
      return { status: 201, body: jsonObject(price) };
    });
  }

  saveLocation(metadata: CommandMetadata, input: Readonly<{ id?: string; code: string; name: string; type: Location["type"]; parentId?: string; status?: Location["status"] }>): CatalogCommandResult {
    return this.referenceCommand(metadata, "catalog.location.save", jsonObject(input), (context, actorId) => {
      if (!input.code.trim() || !input.name.trim() || !["warehouse", "house", "counter", "other"].includes(input.type)) return response(400, "VALIDATION_ERROR", "Некорректная полка");
      const current = input.id ? context.transaction.repositories.locations.findById(input.id) : undefined;
      if (input.id && !current) return response(404, "NOT_FOUND", "Полка не найдена");
      const duplicate = context.transaction.repositories.locations.findByCode(input.code.trim());
      if (duplicate && duplicate.entity.id !== input.id) return response(409, "LOCATION_CODE_CONFLICT", "Код полки уже используется");
      if (input.parentId && !context.transaction.repositories.locations.findById(input.parentId)) return response(404, "PARENT_LOCATION_NOT_FOUND", "Родительская локация не найдена");
      const location: Location = { id: input.id ?? this.createId("product"), code: input.code.trim(), name: input.name.trim(), type: input.type, parentId: input.parentId, status: input.status ?? current?.entity.status ?? "active" };
      const at = context.clock.now();
      const saved = context.transaction.repositories.locations.save(location, current ? { at, expectedRevision: current.revision } : { at, expectedRevision: null });
      if (saved.outcome === "duplicate" || saved.outcome === "stale") return response(409, "VERSION_CONFLICT", "Полка уже изменена");
      if (saved.outcome === "missing") return response(404, "NOT_FOUND", "Полка не найдена");
      this.appendAudit(context, actorId, "location", location.id, current ? "update" : "create", jsonObject(location), at);
      return { status: current ? 200 : 201, body: jsonObject(location) };
    });
  }

  private referenceCommand(metadata: CommandMetadata, scope: string, request: JsonObject, run: (context: CommandContext<CatalogCommandRepositories>, actorId: string) => Readonly<{ status: number; body: JsonObject }>): CatalogCommandResult {
    return this.executor.execute(metadata, (context) => {
      const actor = authorized(context);
      if (!actor) return { outcome: "rejected", ...response(403, "FORBIDDEN", "Недостаточно прав") } as const;
      return executeIdempotently(context, scope, request, { processingTimeoutMs: this.options.processingTimeoutMs, retentionMs: this.options.idempotencyRetentionMs }, () => run(context, actor.userId));
    }, { transactionMode: "immediate" });
  }

  private appendAudit(context: CommandContext<CatalogCommandRepositories>, actorId: string, entity: string, entityId: string, action: string, changes: JsonObject, at: string) {
    writeCreated(context.transaction.repositories.audit.append({ id: this.createId("audit"), actorId, entity, entityId, action, changes: { schemaVersion: 1, value: changes }, requestId: context.correlationId, createdAt: at }, { at, expectedRevision: null }), "audit");
  }
}
