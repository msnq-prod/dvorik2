import type {
  AuditEntry,
  AuthSession,
  LabelPrintJob,
  Location,
  NotificationItem,
  NotificationPreference,
  OutboxMessage,
  Permission,
  Product,
  ProductMerge,
  Role,
  ScheduleDay,
  Shift,
  ShiftSwapRequest,
  StockBalance,
  StockOperation,
  SupplyImport,
  User,
  UserStatus
} from "../shared/types";
import type { UnitOfWorkContext } from "./unit-of-work";

export type UtcTimestamp = string;
export type LocalDate = string;
export type Revision = string;
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type VersionedPayload<T> = Readonly<{
  schemaVersion: number;
  value: T;
}>;

export type RepositoryRecord<T> = Readonly<{
  entity: T;
  revision: Revision;
}>;

declare const pageLimitBrand: unique symbol;
export type PageLimit = number & { readonly [pageLimitBrand]: "PageLimit" };
export type PageOrder = "created_desc_id_desc" | "name_asc_id_asc" | "date_asc_id_asc";
export type PageRequest = Readonly<{ limit: PageLimit; order: PageOrder; cursor?: string }>;
export type Page<T> = Readonly<{ items: readonly T[]; nextCursor?: string }>;
export type CreateOptions = Readonly<{ at: UtcTimestamp; expectedRevision: null }>;
export type UpdateOptions = Readonly<{ at: UtcTimestamp; expectedRevision: Revision }>;
/** Explicit create-or-update expectation; callers never omit concurrency intent. */
export type WriteOptions = CreateOptions | UpdateOptions;
export type CreateResult<T> =
  | Readonly<{ outcome: "created"; record: RepositoryRecord<T> }>
  | Readonly<{ outcome: "duplicate"; current: RepositoryRecord<T> }>;
export type UpdateResult<T> =
  | Readonly<{ outcome: "updated" | "unchanged"; record: RepositoryRecord<T> }>
  | Readonly<{ outcome: "missing" }>
  | Readonly<{ outcome: "stale"; current: RepositoryRecord<T> }>;
export type WriteResult<T> = CreateResult<T> | UpdateResult<T>;

export function createPageLimit(limit: number): PageLimit {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Page limit must be an integer from 1 to 100");
  return limit as PageLimit;
}

export function createPageRequest(limit: number, order: PageOrder, cursor?: string): PageRequest {
  return { limit: createPageLimit(limit), order, ...(cursor ? { cursor } : {}) };
}

export type RepositorySession = AuthSession & { tokenHash: string; metadata: VersionedPayload<JsonObject> };
export type RepositoryStockOperation = Omit<StockOperation, "idempotencyKey" | "metadata"> & {
  idempotencyKey?: string;
  metadata?: VersionedPayload<JsonObject>;
};
export type RepositoryNotification = Omit<NotificationItem, "payload"> & { payload: VersionedPayload<JsonObject> };
export type RepositoryOutboxMessage = Omit<OutboxMessage, "payload"> & {
  payload: VersionedPayload<JsonObject>;
  maxAttempts: number;
  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: UtcTimestamp;
  failedAt?: UtcTimestamp;
};
export type ClaimedOutboxMessage = RepositoryOutboxMessage & Required<Pick<RepositoryOutboxMessage, "leaseOwner" | "leaseToken" | "leaseExpiresAt">>;
export type RepositoryAuditEntry = Omit<AuditEntry, "actorId" | "changes"> & {
  actorId?: string;
  changes: VersionedPayload<JsonObject>;
  requestId?: string;
};

export type Supplier = Readonly<{
  id: string;
  name: string;
  status: "active" | "archived";
  contact: VersionedPayload<JsonObject>;
}>;

export type SupplierSku = Readonly<{
  id: string;
  supplierId: string;
  productId: string;
  sku: string;
  source: VersionedPayload<JsonObject>;
}>;

export type RoleDefinition = Readonly<{
  role: Role;
  description: string;
  permissions: readonly Permission[];
}>;

export type AuthorizationSnapshot = Readonly<{
  userId: string;
  role: Role;
  permissions: readonly Permission[];
  revision: Revision;
}>;

export type AuthorizationLookup =
  | Readonly<{ outcome: "found"; snapshot: AuthorizationSnapshot }>
  | Readonly<{ outcome: "missing" }>
  | Readonly<{ outcome: "ambiguous"; roles: readonly Role[] }>;

export type ProductAlias = Readonly<{
  id: string;
  productId: string;
  alias: string;
  source: string;
}>;

export type RotationTemplate = Readonly<{
  id: string;
  name: string;
  locationId: string;
  status: "active" | "archived";
  cycle: VersionedPayload<JsonObject>;
  createdByUserId?: string;
}>;

export type RepositoryShiftSwap = ShiftSwapRequest & Readonly<{
  sourceShiftRevision: Revision;
  resolvedAt?: UtcTimestamp;
  resolvedByUserId?: string;
}>;

export type IdempotencyRecord = Readonly<{
  scope: string;
  key: string;
  requestHash: string;
  status: "processing" | "completed" | "failed";
  responseStatus?: number;
  response?: VersionedPayload<JsonValue>;
  createdAt: UtcTimestamp;
  completedAt?: UtcTimestamp;
  expiresAt?: UtcTimestamp;
}>;

export type IdempotencyClaim = Readonly<{
  scope: string;
  key: string;
  requestHash: string;
  createdAt: UtcTimestamp;
  /** Processing claim deadline; terminal records reuse expiresAt as retention deadline. */
  claimExpiresAt: UtcTimestamp;
}>;

/** Failed is a terminal replayable HTTP response; thrown/transient faults roll the UoW back. */
export type IdempotencyTerminal = Readonly<{
  scope: string;
  key: string;
  requestHash: string;
  status: "completed" | "failed";
  responseStatus: number;
  response: VersionedPayload<JsonValue>;
  createdAt: UtcTimestamp;
  completedAt: UtcTimestamp;
  expiresAt: UtcTimestamp;
}>;

export type IdempotencyReservation =
  | Readonly<{ outcome: "reserved"; record: RepositoryRecord<IdempotencyRecord> }>
  | Readonly<{ outcome: "replay"; record: RepositoryRecord<IdempotencyRecord> }>
  | Readonly<{ outcome: "in_progress"; record: RepositoryRecord<IdempotencyRecord> }>
  | Readonly<{ outcome: "conflict"; record: RepositoryRecord<IdempotencyRecord> }>;

export type OutboxLeaseGuard = Readonly<{
  workerId: string;
  leaseToken: string;
  expectedRevision: Revision;
}>;

export interface UsersRepository {
  findById(userId: string): RepositoryRecord<User> | undefined;
  findByTelegramUserId(telegramUserId: string): RepositoryRecord<User> | undefined;
  findByUsername(username: string): RepositoryRecord<User> | undefined;
  list(query: Readonly<{ status?: UserStatus; role?: Role; search?: string }>, page: PageRequest): Page<RepositoryRecord<User>>;
  create(user: User, options: CreateOptions): CreateResult<User>;
  save(user: User, options: UpdateOptions): UpdateResult<User>;
}

export interface SessionsRepository {
  findUsableByCredential(credential: string, at: UtcTimestamp): RepositoryRecord<RepositorySession> | undefined;
  listForUser(userId: string, page: PageRequest): Page<RepositoryRecord<RepositorySession>>;
  create(session: RepositorySession, options: CreateOptions): CreateResult<RepositorySession>;
  revoke(sessionId: string, options: UpdateOptions): UpdateResult<RepositorySession>;
  revokeActiveForUser(userId: string, revokedAt: UtcTimestamp): number;
  deleteExpired(expiredBefore: UtcTimestamp, limit: PageLimit): number;
}

export interface RolesRepository {
  find(role: Role): RepositoryRecord<RoleDefinition> | undefined;
  list(page: PageRequest): Page<RepositoryRecord<RoleDefinition>>;
  getAuthorization(userId: string): AuthorizationLookup;
  saveDefinition(definition: RoleDefinition, options: UpdateOptions): UpdateResult<RoleDefinition>;
  assignPrimaryRole(userId: string, role: Role, options: WriteOptions): WriteResult<AuthorizationSnapshot>;
}

export interface ProductsRepository {
  findById(productId: string): RepositoryRecord<Product> | undefined;
  findByIdentifier(input: Readonly<{ type: Product["identifiers"][number]["type"]; value: string; supplierId?: string }>): RepositoryRecord<Product> | undefined;
  list(query: Readonly<{ status?: Product["status"]; search?: string; category?: string }>, page: PageRequest): Page<RepositoryRecord<Product>>;
  listAliases(productId: string, page: PageRequest): Page<RepositoryRecord<ProductAlias>>;
  create(product: Product, options: CreateOptions): CreateResult<Product>;
  save(product: Product, options: UpdateOptions): UpdateResult<Product>;
  saveAlias(alias: ProductAlias, options: WriteOptions): WriteResult<ProductAlias>;
}

export interface SuppliersRepository {
  findById(supplierId: string): RepositoryRecord<Supplier> | undefined;
  findByName(name: string): RepositoryRecord<Supplier> | undefined;
  findSku(supplierId: string, sku: string): RepositoryRecord<SupplierSku> | undefined;
  list(page: PageRequest): Page<RepositoryRecord<Supplier>>;
  save(supplier: Supplier, options: WriteOptions): WriteResult<Supplier>;
  saveSku(sku: SupplierSku, options: WriteOptions): WriteResult<SupplierSku>;
}

export interface LocationsRepository {
  findById(locationId: string): RepositoryRecord<Location> | undefined;
  findByCode(code: string): RepositoryRecord<Location> | undefined;
  list(query: Readonly<{ status?: Location["status"]; type?: Location["type"] }>, page: PageRequest): Page<RepositoryRecord<Location>>;
  save(location: Location, options: WriteOptions): WriteResult<Location>;
}

export interface StockRepository {
  findBalance(productId: string, locationId: string): RepositoryRecord<StockBalance> | undefined;
  sumBalance(productId: string): number;
  listBalances(query: Readonly<{ productId?: string; locationId?: string }>, page: PageRequest): Page<RepositoryRecord<StockBalance>>;
  saveBalance(balance: StockBalance, options: WriteOptions): WriteResult<StockBalance>;
  findOperation(operationId: string): RepositoryRecord<RepositoryStockOperation> | undefined;
  findReversalFor(operationId: string): RepositoryRecord<RepositoryStockOperation> | undefined;
  listOperations(query: Readonly<{ productId?: string; locationId?: string; from?: UtcTimestamp; to?: UtcTimestamp }>, page: PageRequest): Page<RepositoryRecord<RepositoryStockOperation>>;
  appendOperation(operation: RepositoryStockOperation, options: CreateOptions): CreateResult<RepositoryStockOperation>;
}

export interface ScheduleRepository {
  findDay(date: LocalDate, locationId: string): RepositoryRecord<ScheduleDay> | undefined;
  hasBlockingShifts(date: LocalDate, locationId: string): boolean;
  listDays(query: Readonly<{ from?: LocalDate; to?: LocalDate; locationId?: string; status?: ScheduleDay["status"] }>, page: PageRequest): Page<RepositoryRecord<ScheduleDay>>;
  saveDay(day: ScheduleDay, options: WriteOptions): WriteResult<ScheduleDay>;
  findShift(shiftId: string): RepositoryRecord<Shift> | undefined;
  listShifts(query: Readonly<{ from?: LocalDate; to?: LocalDate; locationId?: string; employeeId?: string; status?: Shift["status"] }>, page: PageRequest): Page<RepositoryRecord<Shift>>;
  saveShift(shift: Shift, options: WriteOptions & Readonly<{ assignedByUserId?: string }>): WriteResult<Shift>;
  findAssignmentConflicts(input: Readonly<{ date: LocalDate; start: string; end: string; userIds: readonly string[]; excludeShiftId?: string }>): readonly string[];
  findSwap(swapId: string): RepositoryRecord<RepositoryShiftSwap> | undefined;
  listSwaps(query: Readonly<{ userId?: string; status?: ShiftSwapRequest["status"] }>, page: PageRequest): Page<RepositoryRecord<RepositoryShiftSwap>>;
  saveSwap(swap: RepositoryShiftSwap, options: WriteOptions): WriteResult<RepositoryShiftSwap>;
  listPendingSiblingSwaps(input: Readonly<{ fromShiftId: string; fromUserId: string; excludeSwapId: string }>): readonly RepositoryRecord<RepositoryShiftSwap>[];
  findRotationTemplate(templateId: string): RepositoryRecord<RotationTemplate> | undefined;
  listRotationTemplates(locationId: string | undefined, page: PageRequest): Page<RepositoryRecord<RotationTemplate>>;
  saveRotationTemplate(template: RotationTemplate, options: WriteOptions): WriteResult<RotationTemplate>;
}

export interface ImportsRepository {
  findById(importId: string): RepositoryRecord<VersionedPayload<SupplyImport>> | undefined;
  findCommittedByHash(contentHash: string): RepositoryRecord<VersionedPayload<SupplyImport>> | undefined;
  list(page: PageRequest): Page<RepositoryRecord<VersionedPayload<SupplyImport>>>;
  save(document: VersionedPayload<SupplyImport>, options: WriteOptions): WriteResult<VersionedPayload<SupplyImport>>;
}

export interface MergesRepository {
  findById(mergeId: string): RepositoryRecord<VersionedPayload<ProductMerge>> | undefined;
  list(page: PageRequest): Page<RepositoryRecord<VersionedPayload<ProductMerge>>>;
  save(document: VersionedPayload<ProductMerge>, options: WriteOptions): WriteResult<VersionedPayload<ProductMerge>>;
}

export interface LabelsRepository {
  findById(jobId: string): RepositoryRecord<VersionedPayload<LabelPrintJob>> | undefined;
  list(page: PageRequest): Page<RepositoryRecord<VersionedPayload<LabelPrintJob>>>;
  save(document: VersionedPayload<LabelPrintJob>, options: WriteOptions): WriteResult<VersionedPayload<LabelPrintJob>>;
}

export interface NotificationsRepository {
  findById(notificationId: string): RepositoryRecord<RepositoryNotification> | undefined;
  listForUser(userId: string, page: PageRequest): Page<RepositoryRecord<RepositoryNotification>>;
  append(notification: RepositoryNotification, options: CreateOptions): CreateResult<RepositoryNotification>;
  markRead(notificationId: string, options: UpdateOptions): UpdateResult<RepositoryNotification>;
  listPreferences(userId: string, page: PageRequest): Page<RepositoryRecord<NotificationPreference>>;
  savePreference(preference: NotificationPreference, options: WriteOptions): WriteResult<NotificationPreference>;
}

export interface OutboxRepository {
  findById(messageId: string): RepositoryRecord<RepositoryOutboxMessage> | undefined;
  findByIdempotency(channel: OutboxMessage["channel"], key: string): RepositoryRecord<RepositoryOutboxMessage> | undefined;
  list(query: Readonly<{ status?: OutboxMessage["status"]; userId?: string }>, page: PageRequest): Page<RepositoryRecord<RepositoryOutboxMessage>>;
  enqueue(message: RepositoryOutboxMessage, options: CreateOptions): CreateResult<RepositoryOutboxMessage>;
  claimDue(input: Readonly<{ workerId: string; at: UtcTimestamp; leaseUntil: UtcTimestamp; limit: PageLimit }>): readonly RepositoryRecord<ClaimedOutboxMessage>[];
  markSent(messageId: string, guard: OutboxLeaseGuard, sentAt: UtcTimestamp): UpdateResult<RepositoryOutboxMessage>;
  reschedule(messageId: string, guard: OutboxLeaseGuard, input: Readonly<{ availableAt: UtcTimestamp; lastError: string; at: UtcTimestamp }>): UpdateResult<RepositoryOutboxMessage>;
  markFailed(messageId: string, guard: OutboxLeaseGuard, input: Readonly<{ failedAt: UtcTimestamp; lastError: string }>): UpdateResult<RepositoryOutboxMessage>;
  cancel(messageId: string, options: UpdateOptions): UpdateResult<RepositoryOutboxMessage>;
  retryFailed(messageId: string, options: UpdateOptions): UpdateResult<RepositoryOutboxMessage>;
}

export interface AuditRepository {
  append(entry: RepositoryAuditEntry, options: CreateOptions): CreateResult<RepositoryAuditEntry>;
  list(query: Readonly<{ actorId?: string; entity?: string; entityId?: string; from?: UtcTimestamp; to?: UtcTimestamp }>, page: PageRequest): Page<RepositoryRecord<RepositoryAuditEntry>>;
}

export interface IdempotencyRepository {
  find(scope: string, key: string): RepositoryRecord<IdempotencyRecord> | undefined;
  reserve(claim: IdempotencyClaim, at: UtcTimestamp): IdempotencyReservation;
  complete(record: IdempotencyTerminal & Readonly<{ status: "completed" }>, options: UpdateOptions): UpdateResult<IdempotencyRecord>;
  fail(record: IdempotencyTerminal & Readonly<{ status: "failed" }>, options: UpdateOptions): UpdateResult<IdempotencyRecord>;
  deleteExpired(expiredBefore: UtcTimestamp, limit: PageLimit): number;
}

export type ApplicationRepositories = Readonly<{
  users: UsersRepository;
  sessions: SessionsRepository;
  roles: RolesRepository;
  products: ProductsRepository;
  suppliers: SuppliersRepository;
  locations: LocationsRepository;
  stock: StockRepository;
  schedule: ScheduleRepository;
  imports: ImportsRepository;
  merges: MergesRepository;
  labels: LabelsRepository;
  notifications: NotificationsRepository;
  outbox: OutboxRepository;
  audit: AuditRepository;
  idempotency: IdempotencyRepository;
}>;

/** Service-facing context intentionally omits raw DatabaseContext. */
export type ApplicationRepositoryContext = Readonly<{ repositories: ApplicationRepositories }>;

export function asApplicationRepositoryContext(context: UnitOfWorkContext<ApplicationRepositories>): ApplicationRepositoryContext {
  return Object.freeze({ repositories: context.repositories });
}
