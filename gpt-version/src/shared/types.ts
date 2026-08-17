export type Role = "seller" | "admin" | "super_admin";
export type Permission =
  | "products:read"
  | "products:write"
  | "products:scan_manage"
  | "stock:move"
  | "inventory:write"
  | "reports:read"
  | "imports:write"
  | "merge:write"
  | "schedule:manage"
  | "staff:manage"
  | "saby:manage"
  | "users:manage"
  | "roles:manage"
  | "techlog:read"
  | "labels:print";

export type UserStatus = "pending" | "active" | "blocked" | "rejected" | "archived";
export type ProductStatus = "active" | "archived" | "deleted";
export type LocationType = "warehouse" | "house" | "counter" | "other";
export type StockOperationType =
  | "receipt"
  | "transfer"
  | "write_off"
  | "inventory_adjustment"
  | "correction"
  | "reversal"
  | "merge";

export interface User {
  id: string;
  telegramUserId: string;
  firstName: string;
  lastName: string;
  username: string;
  status: UserStatus;
  role: Role;
  permissions: Permission[];
}

export interface AuthSession {
  id: string;
  userId: string;
  method: "demo" | "telegram" | "magic_link";
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ProductIdentifier {
  id: string;
  productId: string;
  type: "supplier_article" | "barcode" | "legacy_article" | "other";
  value: string;
  supplierId?: string;
}

export interface Product {
  id: string;
  officialName: string;
  localName: string;
  unit: "шт" | "кг" | "л" | "м";
  photoUrl: string;
  category: string;
  tags: string[];
  status: ProductStatus;
  identifiers: ProductIdentifier[];
  lowStockThreshold: number;
  groupId?: string;
  manufacturerId?: string;
  inventoryKind?: "piece" | "weight";
  packageMassGrams?: number;
  article?: string;
}

export interface ProductGroup {
  id: string;
  name: string;
  inventoryKind: "piece" | "weight";
  status: "active" | "archived";
  version: number;
}

export interface Manufacturer {
  id: string;
  name: string;
  status: "active" | "archived";
  version: number;
}

export interface ProductPackaging {
  id: string;
  productId: string;
  name: string;
  unitsPerPackage: number;
  massGrams?: number;
  isPrimary: boolean;
  version: number;
}

export interface ProductPriceHistory {
  id: string;
  groupId?: string;
  productId?: string;
  priceKopecks: number;
  priceUnit: "piece" | "kilogram";
  effectiveFrom: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  parentId?: string;
  status: "active" | "archived";
}

export interface StockBalance {
  productId: string;
  locationId: string;
  quantity: number;
  version: number;
}

export interface InventoryBalance {
  productId: string;
  quantity: number;
  version: number;
}

export interface StockOperation {
  id: string;
  type: StockOperationType;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  actorId: string;
  reason: string;
  idempotencyKey: string;
  reversedOperationId?: string;
  /** Immutable operation-specific facts, e.g. expected/actual counts for inventory. */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Public contract shared by movement JSON, CSV, PDF and the reports UI. */
export interface MovementReportRow {
  [key: string]: string | number | null;
  id: string;
  occurredAt: string | null;
  type: string;
  productId: string | null;
  productName: string;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  quantity: number | null;
  actorId: string | null;
  actorName: string;
  reason: string;
  reversedOperationId: string | null;
  inventoryExpected: number | null;
  inventoryActual: number | null;
  inventoryDelta: number | null;
}

export interface Shift {
  id: string;
  version?: number;
  date: string;
  start: string;
  end: string;
  locationId: string;
  employeeIds: string[];
  status: "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";
  comment: string;
}

export interface ScheduleDay {
  id: string;
  date: string;
  locationId: string;
  status: "working" | "closed";
  comment: string;
  version: number;
}

export interface ShiftSwapRequest {
  id: string;
  fromShiftId: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  createdAt: string;
}

export interface EmployeeProfile {
  userId: string;
  personnelNumber?: string;
  position: string;
  hiredOn: string;
  dismissedOn?: string;
  status: "active" | "dismissed";
  version: number;
}

export type HrEventType = "vacation" | "sick_leave" | "late" | "no_show" | "partial_shift";
export interface HrEvent {
  id: string;
  userId: string;
  type: HrEventType;
  startDate: string;
  endDate: string;
  shiftId?: string;
  minutesLate?: number;
  comment: string;
  createdByUserId: string;
  createdAt: string;
}

export interface ShiftExchangeRequest {
  id: string;
  fromShiftId: string;
  toShiftId: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  warnings: string[];
  createdAt: string;
  resolvedAt?: string;
}

/** Seller-facing swap view intentionally excludes the foreign source shift ID. */
export type SellerShiftSwapRequest = Omit<ShiftSwapRequest, "fromShiftId">;

export interface AuditEntry {
  id: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  channel: "telegram" | "webapp";
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface OutboxMessage {
  id: string;
  channel: "telegram" | "webapp";
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  attemptCount: number;
  availableAt: string;
  lastError?: string;
  sentAt?: string;
  createdAt: string;
  idempotencyKey?: string;
}

export interface NotificationPreference {
  userId: string;
  channel: "telegram" | "webapp";
  eventType: string;
  deliveryMode: "off" | "instant" | "daily";
}

export interface SupplyImport {
  id: string;
  status: "previewed" | "committed" | "reverted" | "failed";
  fileName: string;
  hash: string;
  supplierName?: string;
  invoiceNumber?: string;
  columnMapping?: Partial<Record<"name" | "quantity" | "sku" | "unit" | "category", string>>;
  rows: Array<Record<string, string>>;
  warnings?: Array<{ row: number; message: string }>;
  rejectedRows?: Array<{ row: number; message: string; values: Record<string, string> }>;
  result?: {
    createdProducts: number;
    receipts: number;
    rejectedRows?: number;
    productIds?: string[];
    operationIds?: string[];
    idempotencyKey?: string;
  };
  createdAt: string;
}

export interface ProductMerge {
  id: string;
  status: "previewed" | "committed" | "reverted";
  sourceProductId: string;
  targetProductId: string;
  resolution?: Partial<Record<"officialName" | "localName" | "unit" | "photoUrl" | "category" | "tags" | "lowStockThreshold", "source" | "target">>;
  snapshot: {
    source: Product;
    target: Product;
    balances: StockBalance[];
    operations?: StockOperation[];
  };
  createdAt: string;
  committedAt?: string;
}

export interface LabelPrintJob {
  id: string;
  actorId: string;
  templateId: string;
  geometry: {
    widthMm: number;
    heightMm: number;
    labelsPerPage: number;
    perRow: number;
    rows: number;
  };
  labels: Array<{
    productId: string;
    title: string;
    sku: string;
    unit: Product["unit"];
    quantity: number;
    printedAt: string;
    manufacturer?: string;
    barcode?: {
      type: "code128" | "ean13";
      value: string;
      pattern: string;
    };
  }>;
  createdAt: string;
}

export interface InventorySnapshotRow {
  productId: string;
  locationId: string;
  expected: number;
  version: number;
  actual?: number;
  delta?: number;
}

export interface AppState {
  users: User[];
  products: Product[];
  productGroups?: ProductGroup[];
  manufacturers?: Manufacturer[];
  packagings?: ProductPackaging[];
  priceHistory?: ProductPriceHistory[];
  locations: Location[];
  balances: StockBalance[];
  operations: StockOperation[];
  shifts: Shift[];
  scheduleDays: ScheduleDay[];
  swaps: ShiftSwapRequest[];
  audit: AuditEntry[];
  notifications: NotificationItem[];
  outbox: OutboxMessage[];
  notificationPreferences: NotificationPreference[];
  imports: SupplyImport[];
  merges: ProductMerge[];
  labelJobs: LabelPrintJob[];
  sessions: AuthSession[];
  idempotency: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
