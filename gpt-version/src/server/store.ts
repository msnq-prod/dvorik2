import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import type { AppState, AuditEntry, Location, Product, StockBalance, User } from "../shared/types";
import { rolePermissions } from "./permissions";
import { applyMigrations, listMigrations } from "./migrations";
import { buildNormalizedStateSql } from "./state-migration";
import { assertRuntimeConfig } from "./config";
import { checkDatabaseReadiness, defaultDatabaseConnectionPolicy, openDatabase, type DatabaseAdapter } from "./database";
import { requireQuantity } from "../shared/quantity";

const now = () => new Date().toISOString();
const runtimeConfig = assertRuntimeConfig();
const stateFile = runtimeConfig.stateFile || path.resolve(process.cwd(), "data/dvorik-state.json");
const sqliteFile = runtimeConfig.sqliteFile;
const useJsonState = Boolean(runtimeConfig.stateFile) && !process.env.DVORIK_SQLITE_FILE;
let sqliteDatabase: DatabaseAdapter | undefined;
let sqliteInitialized = false;
const expectedSchemaVersions = [1, ...listMigrations().map((migration) => migration.version)].filter((version, index, versions) => versions.indexOf(version) === index).sort((left, right) => left - right);
const expectedRuntimeTables = [
  "schema_migrations", "app_state", "roles", "permissions", "users", "user_roles",
  "role_permissions", "sessions", "suppliers", "products", "product_identifiers",
  "supplier_skus", "product_aliases", "locations", "stock_balances", "stock_operations",
  "schedule_days", "shifts", "shift_assignments", "shift_swap_requests", "rotation_templates",
  "imports", "import_rows", "merge_jobs", "label_jobs", "notification_preferences",
  "outbox_messages", "audit_entries", "idempotency_keys", "migration_batches",
  "telegram_updates", "webapp_notifications"
] as const;

function database() {
  sqliteDatabase ||= openDatabase(sqliteFile);
  return sqliteDatabase;
}

const users: User[] = [
  {
    id: "u-super",
    telegramUserId: "1001",
    firstName: "Анна",
    lastName: "Владелец",
    username: "anna_owner",
    status: "active",
    role: "super_admin",
    permissions: rolePermissions.super_admin
  },
  {
    id: "u-admin",
    telegramUserId: "1002",
    firstName: "Олег",
    lastName: "Админ",
    username: "oleg_admin",
    status: "active",
    role: "admin",
    permissions: rolePermissions.admin
  },
  {
    id: "u-seller",
    telegramUserId: "1003",
    firstName: "Маша",
    lastName: "Продавец",
    username: "masha_shop",
    status: "active",
    role: "seller",
    permissions: rolePermissions.seller
  },
  {
    id: "u-blocked",
    telegramUserId: "1004",
    firstName: "Игорь",
    lastName: "Блок",
    username: "blocked",
    status: "blocked",
    role: "seller",
    permissions: rolePermissions.seller
  }
];

const locations: Location[] = [
  { id: "loc-main", code: "WAREHOUSE", name: "Склад", type: "warehouse", status: "active" },
  { id: "loc-counter", code: "COUNTER", name: "За стойкой", type: "counter", status: "active" },
  { id: "loc-house", code: "HOUSE-1", name: "Домик 1", type: "house", status: "active" }
];

const products: Product[] = [
  {
    id: "p-1",
    officialName: "Мармелад ассорти",
    localName: "Ассорти",
    unit: "кг",
    photoUrl: "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=900&q=80",
    category: "Весовой товар",
    tags: ["хит", "сладкое"],
    status: "active",
    identifiers: [
      { id: "i-1", productId: "p-1", type: "supplier_article", value: "A-100", supplierId: "sup-1" },
      { id: "i-2", productId: "p-1", type: "barcode", value: "4601234567890" }
    ],
    lowStockThreshold: 5
  },
  {
    id: "p-2",
    officialName: "Пастила яблочная",
    localName: "Пастила яблоко",
    unit: "шт",
    photoUrl: "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=900&q=80",
    category: "Штучный товар",
    tags: ["без сахара"],
    status: "active",
    identifiers: [
      { id: "i-3", productId: "p-2", type: "supplier_article", value: "A-100", supplierId: "sup-2" },
      { id: "i-4", productId: "p-2", type: "barcode", value: "2000000000022" }
    ],
    lowStockThreshold: 12
  },
  {
    id: "p-3",
    officialName: "Шоколад фигурный",
    localName: "Фигурки",
    unit: "шт",
    photoUrl: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?auto=format&fit=crop&w=900&q=80",
    category: "Подарки",
    tags: ["сезон"],
    status: "active",
    identifiers: [{ id: "i-5", productId: "p-3", type: "legacy_article", value: "LEG-77" }],
    lowStockThreshold: 10
  }
];

const balances: StockBalance[] = [
  { productId: "p-1", locationId: "loc-main", quantity: 18.5, version: 1 },
  { productId: "p-1", locationId: "loc-counter", quantity: 3, version: 1 },
  { productId: "p-2", locationId: "loc-main", quantity: 32, version: 1 },
  { productId: "p-2", locationId: "loc-house", quantity: 6, version: 1 },
  { productId: "p-3", locationId: "loc-main", quantity: 8, version: 1 }
];

export function createSeedState(): AppState {
  return {
    users: structuredClone(users),
    products: structuredClone(products),
    locations: structuredClone(locations),
    balances: structuredClone(balances),
    operations: [
      {
        id: "op-seed-1",
        type: "receipt",
        productId: "p-1",
        toLocationId: "loc-main",
        quantity: 18.5,
        actorId: "u-admin",
        reason: "Начальный приход",
        idempotencyKey: "seed-1",
        createdAt: now()
      }
    ],
    shifts: [
      {
        id: "shift-1",
        date: "2026-06-26",
        start: "00:00",
        end: "23:59",
        locationId: "loc-counter",
        employeeIds: ["u-seller"],
        status: "scheduled",
        comment: "Открытие точки"
      },
      {
        id: "shift-2",
        date: "2026-06-27",
        start: "00:00",
        end: "23:59",
        locationId: "loc-house",
        employeeIds: ["u-admin"],
        status: "scheduled",
        comment: "Инвентаризация витрины"
      }
    ],
    scheduleDays: [],
    swaps: [],
    audit: [],
    notifications: [],
    outbox: [],
    notificationPreferences: [],
    imports: [],
    merges: [],
    labelJobs: [],
    sessions: [],
    idempotency: {}
  };
}

export function normalizeState(parsed: Partial<AppState>): AppState {
  const seed = createSeedState();
  const normalized = {
    ...seed,
    ...parsed,
    sessions: (parsed.sessions || []).filter((session) => !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now()),
    scheduleDays: parsed.scheduleDays || [],
    outbox: parsed.outbox || [],
    notificationPreferences: parsed.notificationPreferences || [],
    imports: parsed.imports || [],
    merges: parsed.merges || [],
    labelJobs: parsed.labelJobs || [],
    idempotency: parsed.idempotency || {}
  };
  const units = new Map(normalized.products.map((product) => [product.id, product.unit]));
  normalized.products = normalized.products.map((product) => ({ ...product, lowStockThreshold: requireQuantity(product.lowStockThreshold, { unit: product.unit }) }));
  normalized.balances = normalized.balances.map((balance) => ({ ...balance, quantity: requireQuantity(balance.quantity, { unit: units.get(balance.productId) }) }));
  normalized.operations = normalized.operations.map((operation) => ({ ...operation, quantity: requireQuantity(operation.quantity, { unit: units.get(operation.productId), allowZero: false }) }));
  return normalized;
}

export function loadState(filePath = stateFile): AppState {
  if (process.env.NODE_ENV === "test" && filePath === stateFile) return createSeedState();
  if (filePath === stateFile && !useJsonState) return loadSqliteState();
  if (!fs.existsSync(filePath)) return createSeedState();
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<AppState>;
  return normalizeState(parsed);
}

export function saveState(filePath = stateFile, state: AppState = db) {
  if (process.env.NODE_ENV === "test" && filePath === stateFile) return;
  if (filePath === stateFile && !useJsonState) {
    saveSqliteState(state);
    return;
  }
  saveJsonState(filePath, state);
}

function saveJsonState(filePath: string, state: AppState) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function loadSqliteState() {
  initSqlite();
  const payload = database().query<{ payload: string }>("SELECT payload FROM app_state WHERE id = ?", ["main"])[0]?.payload;
  if (payload) return normalizeState(JSON.parse(payload) as Partial<AppState>);
  const initial = fs.existsSync(stateFile) ? normalizeState(JSON.parse(fs.readFileSync(stateFile, "utf8")) as Partial<AppState>) : createSeedState();
  saveSqliteState(initial);
  return initial;
}

function saveSqliteState(state: AppState) {
  initSqlite();
  // The converter is bootstrap-only. Re-projecting AppState on every legacy
  // save can delete concurrent normalized writes made by production UoW.
  const normalizedRows = database().query<{ count: number }>("SELECT count(*) AS count FROM products")[0]?.count ?? 0;
  if (normalizedRows === 0) {
    database().executeScript(buildNormalizedStateSql(state));
  }
  database().execute(`
    INSERT INTO app_state(id, payload, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at
  `, ["main", JSON.stringify(state)]);
}

function initSqlite() {
  if (sqliteInitialized) return;
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
  database().executeScript(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
  `);
  applyMigrations(database());
  const readiness = checkDatabaseReadiness(database(), expectedSchemaVersions, expectedRuntimeTables);
  if (!readiness.ready) throw new Error(`Database readiness failed: ${readiness.code}`);
  sqliteInitialized = true;
  if (runtimeConfig.production) console.log(JSON.stringify({ event: "sqlite_connection_policy", ...defaultDatabaseConnectionPolicy, schemaVersions: expectedSchemaVersions }));
}

/** Entry point for deployment tooling; safe to run repeatedly. */
export function ensureDatabaseReady() {
  initSqlite();
}

export function databaseReadiness() {
  try {
    initSqlite();
    return checkDatabaseReadiness(database(), expectedSchemaVersions, expectedRuntimeTables);
  } catch {
    return { ready: false as const, code: "DATABASE_UNAVAILABLE" as const };
  }
}

/** Executes a pre-validated deployment migration against the configured SQLite file. */
export function executeDatabaseSql(sql: string) {
  ensureDatabaseReady();
  database().executeScript(sql);
}

export function closeDatabase() {
  sqliteDatabase?.close();
  sqliteDatabase = undefined;
  sqliteInitialized = false;
}

function defaultBackupDir() {
  return runtimeConfig.backupDir;
}

export function createBackup(nowDate = new Date(), filePath = stateFile, backupDir = defaultBackupDir()) {
  saveState(filePath);
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = nowDate.toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `dvorik-state-${stamp}.json`);
  if (filePath === stateFile && !useJsonState) {
    fs.writeFileSync(backupPath, JSON.stringify(db, null, 2));
  } else {
    fs.copyFileSync(filePath, backupPath);
  }
  return { path: backupPath, createdAt: nowDate.toISOString(), bytes: fs.statSync(backupPath).size };
}

export function listBackups(backupDir = defaultBackupDir()) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => /^dvorik-state-.+\.json$/.test(name))
    .map((name) => {
      const backupPath = path.join(backupDir, name);
      const stat = fs.statSync(backupPath);
      return { name, path: backupPath, createdAt: stat.mtime.toISOString(), bytes: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreBackup(backupName: string, backupDir = defaultBackupDir()) {
  if (!/^dvorik-state-.+\.json$/.test(backupName)) throw new Error("Invalid backup name");
  const backupPath = path.join(backupDir, backupName);
  if (!fs.existsSync(backupPath)) throw new Error("Backup not found");
  const restored = normalizeState(JSON.parse(fs.readFileSync(backupPath, "utf8")) as Partial<AppState>);
  for (const key of Object.keys(db) as Array<keyof AppState>) {
    (db[key] as unknown) = restored[key];
  }
  saveState();
  return { name: backupName, path: backupPath, restoredAt: now() };
}

// Production runtime owns normalized SQLite repositories. Compatibility state
// is intentionally not loaded there; migration tooling calls loadState()
// explicitly when it needs to convert a legacy payload.
export const db: AppState = runtimeConfig.production ? createSeedState() : loadState();

export function appendAudit(state: AppState, actorId: string, entity: string, entityId: string, action: string, changes: object) {
  const entry: AuditEntry = { id: nanoid(), actorId, entity, entityId, action, changes: changes as Record<string, unknown>, createdAt: now() };
  state.audit.unshift(entry);
  return entry;
}

/**
 * Application-level transaction for the transition period. A failed callback never
 * mutates the live state; successful callback, audit and idempotency changes persist together.
 */
export function stateTransaction<T>(run: (state: AppState) => T) {
  const rollback = structuredClone(db);
  try {
    const result = run(db);
    saveState();
    return result;
  } catch (error) {
    for (const key of Object.keys(db) as Array<keyof AppState>) {
      const live = db[key];
      const saved = rollback[key];
      if (Array.isArray(live) && Array.isArray(saved)) {
        const liveItems = live as unknown as Array<Record<string, unknown>>;
        const savedItems = saved as unknown as Array<Record<string, unknown>>;
        const existingById = new Map(liveItems.filter((item) => typeof item.id === "string").map((item) => [String(item.id), item]));
        const restored = savedItems.map((item) => {
          if (!item || typeof item !== "object" || !("id" in item)) return item;
          const existing = existingById.get(String(item.id));
          return existing ? Object.assign(existing, item) : item;
        });
        liveItems.splice(0, liveItems.length, ...restored);
      } else if (live && typeof live === "object" && saved && typeof saved === "object") {
        Object.assign(live, saved);
        for (const property of Object.keys(live)) if (!(property in saved)) delete (live as Record<string, unknown>)[property];
      } else {
        (db[key] as unknown) = saved;
      }
    }
    throw error;
  }
}

export function audit(actorId: string, entity: string, entityId: string, action: string, changes: object) {
  const entry = appendAudit(db, actorId, entity, entityId, action, changes);
  saveState();
  return entry;
}

export function findBalanceIn(state: AppState, productId: string, locationId: string) {
  let balance = state.balances.find((item) => item.productId === productId && item.locationId === locationId);
  if (!balance) {
    balance = { productId, locationId, quantity: 0, version: 0 };
    state.balances.push(balance);
  }
  return balance;
}

export function findBalance(productId: string, locationId: string) {
  return findBalanceIn(db, productId, locationId);
}
