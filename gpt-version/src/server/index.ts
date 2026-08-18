import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";
import PDFDocument from "pdfkit";
import type { LabelPrintJob, Manufacturer, Product, ProductGroup, ProductIdentifier, ProductPackaging, ProductPriceHistory, User } from "../shared/types";
import { decodedBase64ByteLength, MEDIA_UPLOAD_JSON_LIMIT_BYTES, MEDIA_UPLOAD_MAX_BYTES, MEDIA_UPLOAD_MAX_LABEL, normalizeMediaBase64 } from "../shared/mediaUpload";
import { signTelegramInitData, verifyTelegramInitData } from "./auth";
import { DomainError, requirePermission } from "./domain-core";
import { hasPermission, rolePermissions } from "./permissions";
import { assertImageProcessorCapability, compressImage, createMediaStorage, mediaKey, type MediaMimeType, validateExternalMediaUrl } from "./media";
import { isReportType, movementReportColumns, renderReportPdfRows } from "./report-rendering";
import { loadRuntimeConfig } from "./config";
import { openDatabase } from "./database";
import { applyMigrations, listMigrations } from "./migrations";
import { CommandExecutor, type CommandMetadata } from "./command-context";
import { IdentityQueryService, IdentityService, type IdentityCommandResult } from "./identity-service";
import { SessionService, SessionServiceError } from "./session-service";
import { sessionCookieClearOptions, sessionCookieOptions } from "./session-cookie";
import { createSqliteSessionCommandRepositories } from "./sqlite-session-command-repositories";
import { createSqliteIdentityCommandRepositories } from "./sqlite-identity-command-repositories";
import { createSqliteCatalogCommandRepositories, createSqliteNotificationPreferenceCommandRepositories, createSqliteStockCommandRepositories } from "./sqlite-stock-command-repositories";
import { CatalogService } from "./catalog-service";
import { NotificationPreferenceService } from "./notification-preference-service";
import { ArtifactCommandService } from "./artifact-command-service";
import { createSqliteArtifactCommandRepositories } from "./sqlite-artifact-command-repositories";
import { InventorySessionService } from "./inventory-session-service";
import { createSqliteInventorySessionRepositories } from "./sqlite-inventory-session-repositories";
import { createSqliteScheduleCommandRepositories } from "./sqlite-schedule-command-repositories";
import { InventoryService, ReversalService } from "./inventory-reversal-service";
import { StockOperationService, type StockCommandResult } from "./stock-operation-service";
import { ScheduleSwapService } from "./schedule-swap-service";
import { StaffScheduleService } from "./staff-schedule-service";
import { createSqliteStaffScheduleRepositories } from "./sqlite-staff-schedule-repositories";
import { labelJobFromRow } from "./mappers/workflows";
import { UnitOfWork } from "./unit-of-work";
import { deferredLaunchFeatureForRoute } from "./launch-scope";
import { SqlCatalogQueryService } from "./sqlite-catalog-query-service";
import { SqlStaffQueryService } from "./sqlite-staff-query-service";
import { handleProductionTelegramUpdate, type ProductionTelegramIdentityHooks } from "./telegram-production";
import { createFixedWindowRateLimiter, createHttpMetrics, crossOriginMutationRejected, invalidJsonPayload, isUnsafeApiMutation, requestCorrelationId, safeLogPath, securityHeaders } from "./runtime-observability";
import { routePolicyFor } from "./route-policy";
import { createSqliteBackupBundle, listSqliteBackupBundles, restoreSqliteBackupBundle } from "./sqlite-backup";
import { CashClient } from "./cash-client";
import { StaffClient } from "./staff-client";
import { verifyInternalRequest } from "../cash/signature";
import type { CashEvent, StaffEvent } from "../contracts/events";
import { registerWarehouseRoutes, WarehouseService } from "../modules/warehouse";
import { WarehouseClient } from "./warehouse-client";
import { CompanyProjectionService, CompanyQueryService, registerCompanyRoutes } from "../modules/company";
import { PlatformCashEventService } from "../modules/platform";
import { inspectSupplyFile, parseSupplyFile } from "./supply-file-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeConfig = loadRuntimeConfig();
if (runtimeConfig.production) await assertImageProcessorCapability();
const unavailableLegacy = (..._args: unknown[]): never => { throw new Error("Legacy AppState runtime is unavailable in production"); };
const unavailableState = new Proxy({}, { get: unavailableLegacy }) as import("../shared/types").AppState;
const unavailableDomain = new Proxy({}, { get: () => unavailableLegacy }) as typeof import("./domain");
const unavailableReports = new Proxy({}, { get: () => unavailableLegacy }) as typeof import("./reports");
const unavailableTelegram = new Proxy({}, { get: () => unavailableLegacy }) as typeof import("./telegram");
const legacyRuntime = runtimeConfig.production ? undefined : await import("./legacy-runtime");
const legacyStore = legacyRuntime?.store;
const legacyState = legacyStore?.db ?? unavailableState;
const audit = legacyStore?.audit ?? unavailableLegacy;
// Production owns sessionDatabase directly; graceful shutdown must not touch a
// disabled legacy runtime.
const closeDatabase = legacyStore?.closeDatabase ?? (() => {});
const createBackup = legacyStore?.createBackup ?? unavailableLegacy;
const listBackups = legacyStore?.listBackups ?? unavailableLegacy;
const restoreBackup = legacyStore?.restoreBackup ?? unavailableLegacy;
const legacySaveState = legacyStore?.saveState ?? unavailableLegacy;
const legacyDomain = legacyRuntime?.domain ?? unavailableDomain;
const {
  acceptSwap, applyBufferedStockOperations, applyInventory, applyStockOperation, commitCsvImport, commitProductMerge,
  cancelSwap, commitArchiveCandidates, copyShift, commitFutureReplacement, commitRotation, createShift,
  createSwapRequest, declineSwap, inventorySnapshot, listInventoryDiscrepancies, listVisibleScheduleShifts,
  listVisibleScheduleSwaps, previewCsvImport, previewArchiveCandidates, previewFutureReplacement, previewRotation,
  previewProductMerge, reverseOperation, setScheduleDay, undoCsvImport, undoProductMerge, updateShift, refreshScheduleState
} = legacyDomain;
const { queueReportTelegram, renderReportPdf, reportRows } = legacyRuntime?.reports ?? unavailableReports;
const { approveTelegramOnboarding, handleTelegramUpdate, setNotificationPreference } = legacyRuntime?.telegram ?? unavailableTelegram;
const app = express();
const httpMetrics = createHttpMetrics();
const mutationRateLimiter = createFixedWindowRateLimiter({ limit: 120, windowMs: 60_000 });
app.disable("x-powered-by");
app.use((req, res, next) => {
  const requestId = requestCorrelationId(req.header("x-request-id"));
  res.setHeader("X-Request-Id", requestId);
  for (const [name, value] of Object.entries(securityHeaders(runtimeConfig.production))) res.setHeader(name, value);
  const startedAt = Date.now();
  httpMetrics.begin();
  res.once("finish", () => {
    httpMetrics.complete(res.statusCode);
    if (runtimeConfig.production) console.log(JSON.stringify({ event: "http_request", requestId, method: req.method, path: safeLogPath(req.path), status: res.statusCode, durationMs: Date.now() - startedAt }));
  });
  next();
});
app.use((req, res, next) => {
  if (runtimeConfig.production && crossOriginMutationRejected({
    method: req.method, path: req.path, origin: req.header("origin"), host: req.header("host") || "",
    protocol: req.protocol, secFetchSite: req.header("sec-fetch-site")
  })) {
    res.status(403).json({ code: "ORIGIN_FORBIDDEN", message: "Cross-origin mutation is not allowed" });
    return;
  }
  next();
});
app.use((req, res, next) => {
  if (!runtimeConfig.production || !isUnsafeApiMutation(req.method, req.path)) return next();
  const contentLength = Number(req.header("content-length") || 0);
  if (contentLength > 0 && !req.is("application/json")) {
    res.status(415).json({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Mutating API requests require application/json" });
    return;
  }
  const limited = mutationRateLimiter.allow(req.ip || req.socket.remoteAddress || "unknown");
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfterSeconds));
    res.status(429).json({ code: "RATE_LIMITED", message: "Too many mutating requests" });
    return;
  }
  next();
});
app.use("/api/media/upload", express.json({ limit: MEDIA_UPLOAD_JSON_LIMIT_BYTES }));
app.use("/api/warehouse/supply-drafts", express.json({ limit: "7mb" }));
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, res, next) => {
  if (isUnsafeApiMutation(req.method, req.path) && req.body !== undefined && invalidJsonPayload(req.body)) {
    res.status(400).json({ code: "INVALID_JSON_PAYLOAD", message: "JSON payload violates safety limits" });
    return;
  }
  next();
});
app.use("/api", (req, _res, next) => {
  const policy = routePolicyFor(req.method, `/api${req.path}`);
  if (policy) requirePermission(actor(req), policy.permission);
  next();
});
app.use("/api", (req, res, next) => {
  const feature = deferredLaunchFeatureForRoute(`/api${req.path}`);
  if (!feature) return next();
  res.status(404).json({ code: "FEATURE_DISABLED", feature });
});

const sessionCookie = runtimeConfig.sessionCookie.name;
const expectedSchemaVersions = [1, ...listMigrations().map((migration) => migration.version)].sort((left, right) => left - right);
const fontPath = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
const mediaDir = runtimeConfig.mediaDir;
const mediaStorage = createMediaStorage({
  localDirectory: mediaDir,
  endpoint: runtimeConfig.objectStorage?.endpoint,
  bucket: runtimeConfig.objectStorage?.bucket,
  publicBaseUrl: runtimeConfig.objectStorage?.publicBaseUrl,
  token: runtimeConfig.objectStorage?.token,
  allowLocalFallback: !runtimeConfig.production || process.env.DVORIK_LOCAL_MEDIA_ONLY === "1"
});
const devToolsEnabled = runtimeConfig.devToolsEnabled;
const hardenedSessionsEnabled = runtimeConfig.production || Boolean(process.env.DVORIK_SQLITE_FILE);
const sessionDatabase = hardenedSessionsEnabled ? openDatabase(runtimeConfig.sqliteFile) : undefined;
if (runtimeConfig.production && sessionDatabase) {
  sessionDatabase.executeScript(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));`);
  applyMigrations(sessionDatabase);
}
const cashClient = runtimeConfig.cash.mode === "external" && runtimeConfig.cash.baseUrl && runtimeConfig.cash.internalSecret
  ? new CashClient(runtimeConfig.cash.baseUrl, runtimeConfig.cash.internalSecret)
  : undefined;
const staffClient = runtimeConfig.staff.mode === "external" && runtimeConfig.staff.baseUrl && runtimeConfig.staff.internalSecret
  ? new StaffClient(runtimeConfig.staff.baseUrl, runtimeConfig.staff.internalSecret)
  : undefined;
const legacyStaffEnabled = !runtimeConfig.production && !staffClient;
const warehouseClient = runtimeConfig.warehouse.mode === "external" && runtimeConfig.warehouse.baseUrl && runtimeConfig.warehouse.internalSecret
  ? new WarehouseClient(runtimeConfig.warehouse.baseUrl, runtimeConfig.warehouse.internalSecret)
  : undefined;
const warehouseDatabase = !warehouseClient && runtimeConfig.warehouse.mode === "embedded" && runtimeConfig.warehouse.databaseFile
  ? openDatabase(runtimeConfig.warehouse.databaseFile, { fileMustExist: true })
  : undefined;
const warehouseServiceDatabase = warehouseDatabase ?? sessionDatabase;
const warehouseService = !warehouseClient && warehouseServiceDatabase ? new WarehouseService(warehouseServiceDatabase) : undefined;
const warehousePort = warehouseClient ?? warehouseService;
const companyProjectionService = sessionDatabase ? new CompanyProjectionService(sessionDatabase) : undefined;
const companyQueryService = companyProjectionService ? new CompanyQueryService(companyProjectionService) : undefined;
const platformCashEventService = sessionDatabase ? new PlatformCashEventService(sessionDatabase) : undefined;
const catalogQueries = sessionDatabase ? new SqlCatalogQueryService(sessionDatabase) : undefined;
const staffQueries = legacyStaffEnabled && sessionDatabase ? new SqlStaffQueryService(sessionDatabase) : undefined;
const identityUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteIdentityCommandRepositories) : undefined;
const identityQueryService = identityUnitOfWork ? new IdentityQueryService(identityUnitOfWork) : undefined;
const commandActorResolver = { resolve: (reference: unknown) => reference };
const identityService = identityUnitOfWork ? new IdentityService(
  new CommandExecutor(identityUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  { processingTimeoutMs: 30_000, idempotencyRetentionMs: 7 * 24 * 60 * 60_000, outboxMaxAttempts: 8 }
) : undefined;
const legacyStockEnabled = !runtimeConfig.production;
const stockUnitOfWork = legacyStockEnabled && sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteStockCommandRepositories) : undefined;
const stockExecutor = stockUnitOfWork ? new CommandExecutor(stockUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver) : undefined;
const stockCommandOptions = { processingTimeoutMs: 30_000, idempotencyRetentionMs: 7 * 24 * 60 * 60_000, outboxMaxAttempts: 8 };
const stockService = stockExecutor ? new StockOperationService(stockExecutor, stockCommandOptions) : undefined;
const catalogUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteCatalogCommandRepositories) : undefined;
const catalogService = catalogUnitOfWork ? new CatalogService(
  new CommandExecutor(catalogUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  stockCommandOptions
) : undefined;
const notificationPreferenceUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteNotificationPreferenceCommandRepositories) : undefined;
const notificationPreferenceService = notificationPreferenceUnitOfWork ? new NotificationPreferenceService(
  new CommandExecutor(notificationPreferenceUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  stockCommandOptions
) : undefined;
const artifactUnitOfWork = sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteArtifactCommandRepositories) : undefined;
const artifactService = artifactUnitOfWork ? new ArtifactCommandService(
  new CommandExecutor(artifactUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  stockCommandOptions
) : undefined;
const inventorySessionUnitOfWork = legacyStockEnabled && sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteInventorySessionRepositories) : undefined;
const inventorySessionService = inventorySessionUnitOfWork ? new InventorySessionService(
  new CommandExecutor(inventorySessionUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  stockCommandOptions
) : undefined;
const inventoryService = stockExecutor ? new InventoryService(stockExecutor, stockCommandOptions) : undefined;
const reversalService = stockExecutor ? new ReversalService(stockExecutor, stockCommandOptions) : undefined;
const scheduleUnitOfWork = legacyStaffEnabled && sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteScheduleCommandRepositories) : undefined;
const scheduleExecutor = scheduleUnitOfWork ? new CommandExecutor(scheduleUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver) : undefined;
const scheduleService = scheduleExecutor ? new ScheduleSwapService(scheduleExecutor, stockCommandOptions) : undefined;
const staffScheduleUnitOfWork = legacyStaffEnabled && sessionDatabase ? new UnitOfWork(sessionDatabase, createSqliteStaffScheduleRepositories) : undefined;
const staffScheduleService = staffScheduleUnitOfWork ? new StaffScheduleService(
  new CommandExecutor(staffScheduleUnitOfWork, { now: () => new Date().toISOString() }, commandActorResolver),
  stockCommandOptions
) : undefined;
const sessionService = sessionDatabase ? new SessionService(
  new UnitOfWork(sessionDatabase, createSqliteSessionCommandRepositories),
  { now: () => new Date().toISOString() },
  {
    secret: runtimeConfig.sessionCookie.secret,
    maxAgeMs: runtimeConfig.sessionCookie.maxAgeMs
  }
) : undefined;
function parseCookies(cookieHeader: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) continue;
    try {
      cookies[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("="));
    } catch {
      // A malformed cookie is unusable authentication input, not a server fault.
    }
  }
  return cookies;
}

function requireLocalDevTools(req: express.Request) {
  const address = req.socket.remoteAddress || "";
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") throw new DomainError("NOT_FOUND", "Dev tools disabled", 404);
}

function safeCommandIdentifier(value: unknown, fallback: string) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(candidate) ? candidate : fallback;
}

function identityMetadata(req: express.Request, user: User): CommandMetadata {
  const requestId = safeCommandIdentifier(req.header("x-request-id"), `http:${nanoid()}`);
  const idempotencyKey = safeCommandIdentifier(req.header("idempotency-key") || req.body?.idempotencyKey, requestId);
  return {
    actorReference: { kind: "user", userId: user.id, authenticatedBy: "web_session" },
    requestId,
    channel: "web",
    idempotencyKey
  };
}

function identityResponse(res: express.Response, result: IdentityCommandResult) {
  if (result.outcome === "rejected") return res.status(result.status).json(result.body);
  if ("code" in result) {
    return res.status(result.status).json({ code: result.code });
  }
  const user = result.body.user;
  return res.status(result.status).json(user && typeof user === "object" ? user : result.body);
}

function commandResponse(res: express.Response, result: Readonly<{ status: number }> & (Readonly<{ body: import("./repositories").JsonObject }> | Readonly<{ code: string }>)) {
  if ("body" in result) return res.status(result.status).json(result.body);
  if ("code" in result) return res.status(result.status).json({ code: result.code });
  throw new Error("Unexpected stock command result");
}

function identityResultUser(result: IdentityCommandResult): User {
  if (result.outcome === "executed" || result.outcome === "replayed") {
    const value = result.body.user;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as unknown as User;
    throw new DomainError("IDENTITY_RESPONSE_INVALID", "Некорректный ответ identity service", 500);
  }
  if (result.outcome === "rejected") {
    throw new DomainError(String(result.body.code || "FORBIDDEN"), String(result.body.message || "Недостаточно прав"), result.status);
  }
  if ("code" in result) throw new DomainError(result.code, "Конфликт идемпотентности", result.status);
  throw new DomainError("IDENTITY_RESPONSE_INVALID", "Некорректный ответ identity service", 500);
}

function actor(req: express.Request): User {
  const cookies = parseCookies(req.header("cookie"));
  const credential = cookies[sessionCookie];
  if (sessionService) {
    const authenticated = sessionService.authenticate(credential);
    if (!authenticated) throw new DomainError("AUTH_REQUIRED", "Активная сессия не найдена", 401);
    return authenticated.user;
  }
  const sessionId = credential;
  const session = legacyState.sessions.find((item) => item.id === sessionId && !item.revokedAt);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new DomainError("AUTH_REQUIRED", "Активная сессия не найдена", 401);
  }
  const user = legacyState.users.find((item) => item.id === session.userId);
  if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "Пользователь не активен", 401);
  return user;
}

function issueSession(user: User, method: "demo" | "telegram") {
  if (sessionService) {
    try {
      return sessionService.create(user.id, method);
    } catch (error) {
      if (error instanceof SessionServiceError && error.code === "USER_NOT_ACTIVE") {
        throw new DomainError("AUTH_REQUIRED", "Пользователь не активен", 401);
      }
      throw error;
    }
  }
  const session = {
    id: nanoid(),
    userId: user.id,
    method,
    expiresAt: new Date(Date.now() + runtimeConfig.sessionCookie.maxAgeMs).toISOString(),
    createdAt: new Date().toISOString()
  };
  for (const current of legacyState.sessions.filter((item) => item.userId === user.id && !item.revokedAt)) {
    current.revokedAt = session.createdAt;
  }
  legacyState.sessions.push(session);
  legacySaveState();
  return { token: session.id, sessionId: session.id, expiresAt: session.expiresAt, user };
}

function productIdentifiers(productId: string, body: Record<string, unknown>) {
  const identifiers: ProductIdentifier[] = [];
  const rawIdentifiers = Array.isArray(body.identifiers) ? body.identifiers : [];
  for (const raw of rawIdentifiers) {
    const item = raw as { type?: ProductIdentifier["type"]; value?: string; supplierId?: string };
    const type = String(item.type || "other") as ProductIdentifier["type"];
    const value = String(item.value || "").trim();
    if (!["supplier_article", "barcode", "legacy_article", "other"].includes(type) || !value) continue;
    identifiers.push({ id: nanoid(), productId, type, value, supplierId: item.supplierId });
  }
  const sku = String(body.sku || "").trim();
  const barcode = String(body.barcode || "").trim();
  if (sku) identifiers.push({ id: nanoid(), productId, type: "supplier_article", value: sku });
  if (barcode) identifiers.push({ id: nanoid(), productId, type: "barcode", value: barcode });
  return identifiers;
}

function jsonObjectValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as import("./repositories").JsonObject;
}

function requireArtifactRecorded(result: ReturnType<ArtifactCommandService["recordExternal"]>) {
  if (result.outcome === "executed" || result.outcome === "replayed") return;
  if (result.outcome === "rejected") throw new DomainError(String(result.body.code || "FORBIDDEN"), String(result.body.message || "Недостаточно прав"), result.status);
  if ("code" in result) throw new DomainError(result.code, "Не удалось зафиксировать техническое событие", result.status);
  throw new DomainError("ARTIFACT_AUDIT_FAILED", "Не удалось зафиксировать техническое событие", 500);
}

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function scheduleExportRows(user: User, from: string, to: string, locationId?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new DomainError("BAD_EXPORT_RANGE", "Неверный диапазон дат");
  const canManage = hasPermission(user, "schedule:manage");
  return legacyState.shifts.filter((shift) => shift.date >= from && shift.date <= to && (!locationId || shift.locationId === locationId) && (canManage || shift.employeeIds.includes(user.id)));
}

function renderSchedulePdf(res: express.Response, rows: ReturnType<typeof scheduleExportRows>, from: string, to: string, labels?: Readonly<{ locationName(id: string): string; employeeName(id: string): string }>) {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  doc.on("end", () => res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", `attachment; filename="schedule-${from}_${to}.pdf"`).send(Buffer.concat(chunks)));
  doc.font(fontPath).fontSize(16).fillColor("#111111").text(`График смен: ${from} - ${to}`);
  doc.moveDown(0.7).fontSize(9);
  if (!rows.length) doc.text("В выбранном периоде смен нет.");
  rows.forEach((shift, index) => {
    const location = labels?.locationName(shift.locationId) ?? (legacyState.locations.find((item) => item.id === shift.locationId)?.name || shift.locationId);
    const employees = shift.employeeIds.map((id) => {
      if (labels) return labels.employeeName(id);
      const employee = identityQueryService?.findById(id) ?? legacyState.users.find((item) => item.id === id);
      return employee ? `${employee.firstName} ${employee.lastName}` : id;
    }).join(", ");
    doc.fillColor("#111111").text(`${index + 1}. ${shift.date} | ${location} | ${employees} | ${shift.status}`);
  });
  doc.end();
}

function labelGeometry(body: Record<string, unknown>) {
  const width = Number(body.widthMm || 58);
  const height = Number(body.heightMm || 40);
  if (width < 20 || height < 15 || width > 210 || height > 297) throw new DomainError("BAD_LABEL_GEOMETRY", "Размер этикетки вне допустимого диапазона");
  const perRow = Math.max(1, Math.floor(190 / width));
  const rows = Math.max(1, Math.floor(277 / height));
  return { widthMm: width, heightMm: height, labelsPerPage: perRow * rows, perRow, rows };
}

type WarehouseLabelProduct = Readonly<{
  id: string;
  officialName: string;
  localName: string;
  unit: Product["unit"];
  article: string;
  inventoryKind: "piece" | "weight";
  packageMassGrams?: number;
  status: "active" | "archived" | "deleted";
}>;

function labelManufacturer(officialName: string) {
  const segments = officialName.split("/").map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return "Не указан";
  return segments.slice(1).join(" / ");
}

async function warehouseLabelCatalog() {
  if (!warehousePort) return [] as WarehouseLabelProduct[];
  return await warehousePort.catalog() as WarehouseLabelProduct[];
}

async function labelJobFromBody(user: User, body: Record<string, unknown>) {
  const rawItems = Array.isArray(body.items)
    ? body.items
    : ((body.productIds as string[] | undefined) || []).map((productId) => ({ productId, quantity: 1 }));
  const printedAt = new Date().toLocaleDateString("ru-RU", { timeZone: "Asia/Vladivostok" });
  const warehouseProducts = await warehouseLabelCatalog();
  const labels: LabelPrintJob["labels"] = rawItems.map((raw) => {
    const item = raw as { productId?: string; quantity?: number };
    const warehouseProduct = warehouseProducts.find((candidate) => candidate.id === String(item.productId || "") && candidate.status === "active");
    const product = warehouseProduct
      ?? catalogQueries?.productById(String(item.productId || ""))
      ?? legacyState.products.find((candidate) => candidate.id === String(item.productId || "") && candidate.status !== "deleted");
    if (!product) throw new DomainError("NO_LABEL_PRODUCTS", "Выберите существующий товар");
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity || 1))));
    const coreProduct = "identifiers" in product ? product : undefined;
    const sku = warehouseProduct?.article || coreProduct?.identifiers[0]?.value || product.id;
    const manufacturer = warehouseProduct
      ? labelManufacturer(warehouseProduct.officialName)
      : coreProduct?.manufacturerId
        ? (catalogQueries?.manufacturers() ?? legacyState.manufacturers ?? []).find((candidate) => candidate.id === coreProduct.manufacturerId)?.name
        : undefined;
    return {
      productId: product.id,
      title: product.localName || product.officialName,
      sku,
      unit: product.unit,
      quantity,
      printedAt,
      manufacturer: manufacturer || "Не указан"
    };
  });
  if (!labels.length) throw new DomainError("NO_LABEL_PRODUCTS", "Выберите хотя бы один товар");
  return {
    id: nanoid(),
    actorId: user.id,
    templateId: String(body.templateId || "a4-basic"),
    geometry: labelGeometry(body),
    labels,
    createdAt: new Date().toISOString()
  };
}

function expandLabels(labels: LabelPrintJob["labels"]) {
  return labels.flatMap((label) => Array.from({ length: label.quantity }, () => label));
}

function sqliteLabelJob(row: Readonly<Record<string, unknown>>): LabelPrintJob {
  const job = labelJobFromRow(row).entity;
  return { id: job.id, actorId: job.actorId || "system", templateId: job.templateId, geometry: job.geometry.value as LabelPrintJob["geometry"], labels: job.labels.value as LabelPrintJob["labels"], createdAt: job.createdAt };
}

function renderLabelsPdf(res: express.Response, job: Pick<LabelPrintJob, "geometry" | "labels">) {
  const expandedLabels = expandLabels(job.labels);
  if (expandedLabels.length > job.geometry.labelsPerPage) throw new DomainError("LABELS_OVERFLOW", "Этикетки не помещаются на одну страницу");
  const doc = new PDFDocument({ size: "A4", margin: 28 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  doc.on("end", () => {
    res
      .status(200)
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", "attachment; filename=\"dvorik-labels.pdf\"")
      .send(Buffer.concat(chunks));
  });
  doc.font(fontPath);
  const mm = 72 / 25.4;
  const labelWidth = job.geometry.widthMm * mm;
  const labelHeight = job.geometry.heightMm * mm;
  const gap = 4;
  expandedLabels.forEach((label, index) => {
    const col = index % job.geometry.perRow;
    const row = Math.floor(index / job.geometry.perRow);
    const x = 28 + col * (labelWidth + gap);
    const y = 28 + row * (labelHeight + gap);
    doc.rect(x, y, labelWidth, labelHeight).lineWidth(1.2).stroke("#111111");
    doc.fontSize(10).fillColor("#111111").text(label.title, x + 7, y + 7, { width: labelWidth - 14, height: 28, align: "center", ellipsis: true });
    doc.fontSize(8).text(`Производитель: ${label.manufacturer || "Не указан"}`, x + 7, y + 34, { width: labelWidth - 14, height: 24, align: "center", ellipsis: true });
    doc.fontSize(8).text(`Дата вскрытия: ${label.printedAt}`, x + 7, y + labelHeight - 31, { width: labelWidth - 14 });
    doc.text("Срок годности: 12 месяцев", x + 7, y + labelHeight - 19, { width: labelWidth - 14 });
  });
  doc.end();
}

const openApiContract = {
  openapi: "3.1.0",
  info: { title: "Dvorik GPT Version API", version: "1.0.0" },
  paths: {
    ...(devToolsEnabled ? {
      "/api/auth/demo": { post: { summary: "Create demo session" } },
      "/api/dev/config": { get: { summary: "Dev/test mode config" } },
      "/api/dev/telegram/init-data": { post: { summary: "Create signed local Telegram init data" } }
    } : {}),
    "/api/auth/telegram": { post: { summary: "Create session from Telegram init data" } },
    "/live": { get: { summary: "Process liveness" } },
    "/healthz": { get: { summary: "Process health/liveness alias" } },
    "/ready": { get: { summary: "Database/config readiness without internal details" } },
    "/api/telegram/webhook": { post: { summary: "Receive Telegram bot update" } },
    "/api/saby/webhook/{secret}": { post: { summary: "Receive Saby change signal; body is stored but not trusted as sales data" } },
    "/api/saby/status": { get: { summary: "Saby sync status" } },
    "/api/cash/status": { get: { summary: "Optional cash service availability" } },
    "/api/saby/mappings": { get: { summary: "List Saby nomenclature mappings" }, put: { summary: "Map Saby nomenclature UUID to a Dvorik product" } },
    "/api/telegram/onboarding/{id}/approve": { post: { summary: "Approve pending Telegram user" } },
    "/api/notification-preferences": { get: { summary: "List notification preferences" }, put: { summary: "Set notification preference" } },
    "/api/auth/logout": { post: { summary: "Revoke current session" } },
    "/api/session": { get: { summary: "Current session" } },
    "/api/staff": { get: { summary: "List active staff for scheduling" } },
    "/api/staff/status": { get: { summary: "Staff outbox health" } },
    "/api/staff/profiles": { get: { summary: "List non-financial employee profiles" } },
    "/api/staff/{id}/profile": { put: { summary: "Create or update non-financial employee profile" } },
    "/api/hr-events": { get: { summary: "List non-financial HR events" }, post: { summary: "Record non-financial HR event" } },
    "/api/products": { get: { summary: "List products" }, post: { summary: "Create product" } },
    "/api/products/{id}": { patch: { summary: "Update product status/details" } },
    "/api/product-groups": { get: { summary: "List product groups" }, post: { summary: "Create product group" } },
    "/api/manufacturers": { get: { summary: "List manufacturers" }, post: { summary: "Create manufacturer" } },
    "/api/products/{id}/packagings": { get: { summary: "List product packagings" }, post: { summary: "Create product packaging" } },
    "/api/product-prices": { get: { summary: "List immutable price history" }, post: { summary: "Append price history" } },
    "/api/media/upload": { post: { summary: "Temporary JSON/base64 media upload, decoded limit 5 MiB; multipart target is MED-1101" } },
    "/api/stock/operations": { get: { summary: "List stock operations" }, post: { summary: "Create stock operation" } },
    "/api/stock/totals": { get: { summary: "List accounting totals separately from shelf placements" } },
    "/api/warehouse/supplies": { post: { summary: "Accept a package-based supply and create FIFO lots" } },
    "/api/warehouse/opening-lots": { post: { summary: "Register an audited FIFO opening lot without changing the accounting balance" } },
    "/api/warehouse/products/{id}/profitability": { get: { summary: "Product profitability with source completeness" } },
    "/api/warehouse/cutover-readiness": { get: { summary: "Compare legacy accounting totals with FIFO lot quantities before warehouse cutover" } },
    "/api/warehouse/status": { get: { summary: "Warehouse cutover, outbox and inbox health" } },
    "/api/company/status": { get: { summary: "Company projection worker and Warehouse delivery health" } },
    "/api/runtime/capabilities": { get: { summary: "Runtime ownership modes for client actions" } },
    "/api/warehouse/lots": { get: { summary: "List FIFO lots, optionally filtered by productId" } },
    "/api/company/products/{id}/profitability": { get: { summary: "Company profitability projection built from warehouse events" } },
    "/api/company/overview": { get: { summary: "Combined Warehouse, Cash and Staff projection with source completeness" } },
    "/api/reports/{type}": { get: { summary: "Inventory, discrepancy and canonical movement report DTO" } },
    "/api/reports/{type}/export": { get: { summary: "Export report CSV" } },
    "/api/reports/{type}/pdf": { get: { summary: "Export report PDF" } },
    "/api/inventory/{locationId}/snapshot": { get: { summary: "Inventory snapshot" } },
    "/api/inventory/apply": { post: { summary: "Apply inventory adjustment" } },
    "/api/inventory/session/active": { get: { summary: "Get active whole-stock inventory session" } },
    "/api/inventory/sessions": { post: { summary: "Start whole-stock inventory session" } },
    "/api/inventory/sessions/{id}/close": { post: { summary: "Close inventory and recognize consumption" } },
    "/api/consumption": { get: { summary: "List consumption facts" }, post: { summary: "Record total-only consumption" } },
    "/api/stock/adjustments": { post: { summary: "Apply total-only stock adjustment" } },
    "/api/schedule": { get: { summary: "List shifts" }, post: { summary: "Create shift" } },
    "/api/schedule/days": { get: { summary: "List schedule day statuses" } },
    "/api/schedule/days/{date}/{locationId}": { put: { summary: "Set working or closed day" } },
    "/api/schedule/export": { get: { summary: "Export schedule as CSV or PDF" } },
    "/api/schedule/{id}": { patch: { summary: "Update shift" } },
    "/api/schedule/{id}/copy": { post: { summary: "Copy shift to date" } },
    "/api/schedule/swaps": { get: { summary: "List visible shift swaps without foreign shift metadata for sellers" }, post: { summary: "Create shift swap request" } },
    "/api/schedule/swaps/{id}/accept": { post: { summary: "Accept shift swap" } },
    "/api/schedule/swaps/{id}/decline": { post: { summary: "Decline shift swap" } },
    "/api/schedule/swaps/{id}/cancel": { post: { summary: "Cancel shift swap" } },
    "/api/schedule/exchanges": { get: { summary: "List reciprocal shift exchanges" }, post: { summary: "Offer reciprocal shift exchange" } },
    "/api/schedule/exchanges/{id}/{action}": { post: { summary: "Accept, decline or cancel reciprocal exchange" } },
    "/api/backups": { get: { summary: "List backups" }, post: { summary: "Create backup" } },
    "/api/backups/{name}/restore": { post: { summary: "Restore backup" } },
    "/api/labels/preview": { post: { summary: "Preview labels" } },
    "/api/labels/pdf": { post: { summary: "Export labels PDF and save job" } },
    "/api/labels/jobs": { get: { summary: "List label print jobs" }, post: { summary: "Save label print job" } },
    "/api/labels/jobs/{id}/pdf": { post: { summary: "Reprint label job PDF" } },
    "/api/labels/jobs/{id}/reprint": { post: { summary: "Record and return a label job for browser PDF rendering" } }
  }
};

app.get("/api/session", asyncRoute((req, res) => {
  const user = actor(req);
  res.json({ user, permissions: user.permissions });
}));

app.get("/ready", (_req, res) => {
  const readiness = sessionDatabase
    ? (() => {
      try {
        const schema = sessionDatabase.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
        if (schema.length !== expectedSchemaVersions.length || schema.some((version, index) => version !== expectedSchemaVersions[index])) {
          return { ready: false as const, code: "SCHEMA_VERSION_MISMATCH" };
        }
        sessionDatabase.execute("UPDATE schema_migrations SET applied_at = applied_at WHERE 1 = 0");
        const expiredLeases = sessionDatabase.query<{ count: number }>("SELECT count(*) count FROM outbox_messages WHERE status='processing' AND lease_expires_at <= ?", [new Date().toISOString()])[0]?.count ?? 0;
        if (expiredLeases) return { ready: false as const, code: "OUTBOX_WORKER_STALLED" };
        return { ready: true as const };
      } catch {
        return { ready: false as const, code: "DATABASE_UNAVAILABLE" };
      }
    })()
    : (legacyStore?.databaseReadiness ?? unavailableLegacy)();
  if (!readiness.ready) {
    res.status(503).json({ ready: false, code: readiness.code });
    return;
  }
  res.json({ ready: true });
});

app.get("/live", (_req, res) => {
  res.json({ live: true });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain; version=0.0.4").send(httpMetrics.prometheus());
});

function requireInternalSignature(req: express.Request) {
  const secret = runtimeConfig.cash.internalSecret
    ?? runtimeConfig.staff.internalSecret
    ?? (runtimeConfig.warehouse.mode === "external" ? runtimeConfig.warehouse.internalSecret : undefined);
  if (!secret) throw new DomainError("INTERNAL_API_DISABLED", "Internal API is disabled", 503);
  const body = req.method === "GET" ? "" : JSON.stringify(req.body ?? {});
  if (!verifyInternalRequest(secret, req.header("x-dvorik-timestamp") || "", body, req.header("x-dvorik-signature") || "")) {
    throw new DomainError("INTERNAL_SIGNATURE_INVALID", "Invalid internal signature", 401);
  }
}

app.post("/internal/v1/events/cash", asyncRoute(async (req, res) => {
  requireInternalSignature(req);
  if (!warehousePort || !sessionDatabase) throw new DomainError("SERVICE_UNAVAILABLE", "Warehouse service unavailable", 503);
  const event = req.body as CashEvent;
  if (!event || event.producer !== "cash" || event.eventVersion !== 1 || typeof event.eventId !== "string" || typeof event.eventType !== "string") {
    throw new DomainError("EVENT_CONTRACT_INVALID", "Invalid cash event", 400);
  }
  if (event.eventType === "SaleStockDelta" || event.eventType === "ReturnRecorded") {
    const result = await warehousePort.applyCashEvent(event);
    companyProjectionService?.enqueue(event);
    res.json(result);
    return;
  }
  if (!platformCashEventService) throw new DomainError("SERVICE_UNAVAILABLE", "Platform service unavailable", 503);
  const result=platformCashEventService.apply(event);
  companyProjectionService?.enqueue(event);
  res.json(result);
}));

app.post("/internal/v1/events/warehouse", asyncRoute((req, res) => {
  requireInternalSignature(req);
  const event = req.body as { producer?: string; eventVersion?: number; eventId?: string; eventType?: string };
  if (!event || event.producer !== "warehouse" || event.eventVersion !== 1 || typeof event.eventId !== "string" || typeof event.eventType !== "string") {
    throw new DomainError("EVENT_CONTRACT_INVALID", "Invalid warehouse event", 400);
  }
  companyProjectionService?.enqueue(req.body);
  res.status(202).json({ eventId: event.eventId, status: "accepted" });
}));

app.post("/internal/v1/events/staff", asyncRoute((req,res)=>{
  requireInternalSignature(req);
  const event=req.body as StaffEvent;
  if(!event||event.producer!=="staff"||event.eventVersion!==1||event.eventType!=="StaffSnapshotUpdated") throw new DomainError("EVENT_CONTRACT_INVALID","Invalid staff event",400);
  if(!companyProjectionService) throw new DomainError("SERVICE_UNAVAILABLE","Company service unavailable",503);
  companyProjectionService.enqueue(event);
  res.json({eventId:event.eventId,status:"accepted"});
}));

app.get("/internal/v1/catalog/products/:id", asyncRoute(async (req, res) => {
  requireInternalSignature(req);
  const product = (await warehouseLabelCatalog()).find((candidate) => candidate.id === req.params.id);
  if (!product || product.status !== "active") throw new DomainError("PRODUCT_NOT_FOUND", "Product not found", 404);
  res.json({ id: product.id, status: product.status, inventoryKind: product.inventoryKind, packageMassGrams: product.packageMassGrams });
}));

if (devToolsEnabled) app.post("/api/auth/demo", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const userId = String(req.body.userId || "");
  const user = identityQueryService?.findById(userId) ?? legacyState.users.find((item) => item.id === userId);
  if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "Пользователь не активен", 401);
  const created = issueSession(user, "demo");
  res.cookie(sessionCookie, created.token, sessionCookieOptions(runtimeConfig.sessionCookie));
  res.status(201).json({ user: created.user, permissions: created.user.permissions });
}));

app.post("/api/auth/telegram", asyncRoute((req, res) => {
  const initData = String(req.body.initData || "");
  const botToken = runtimeConfig.telegramBotToken;
  const telegramUser = verifyTelegramInitData(initData, botToken);
  const created = sessionService
    ? (() => {
      try {
        return sessionService.createForTelegram(String(telegramUser.id));
      } catch (error) {
        if (error instanceof SessionServiceError && error.code === "USER_NOT_ACTIVE") {
          throw new DomainError("AUTH_REQUIRED", "Пользователь Telegram не активен", 401);
        }
        throw error;
      }
    })()
    : (() => {
      const user = legacyState.users.find((item) => item.telegramUserId === String(telegramUser.id));
      if (!user || user.status !== "active") throw new DomainError("AUTH_REQUIRED", "Пользователь Telegram не активен", 401);
      return issueSession(user, "telegram");
    })();
  res.cookie(sessionCookie, created.token, sessionCookieOptions(runtimeConfig.sessionCookie));
  res.status(201).json({ user: created.user, permissions: created.user.permissions });
}));

app.post("/api/telegram/webhook", asyncRoute((req, res) => {
  const expectedSecret = runtimeConfig.telegramWebhookSecret;
  if (!expectedSecret || req.header("x-telegram-bot-api-secret-token") !== expectedSecret) {
    throw new DomainError("BAD_TELEGRAM_WEBHOOK_SECRET", "Некорректный секрет webhook", 401);
  }
  const resolveTelegramUser = identityQueryService
    ? (telegramUserId: string) => identityQueryService.findByTelegramUserId(telegramUserId)
    : undefined;
  const registerTelegramApplicant = identityService
    ? (input: Parameters<ProductionTelegramIdentityHooks["registerTelegramApplicant"]>[0]) => identityResultUser(identityService.registerTelegramApplicant({
      actorReference: { kind: "system", service: "telegram-webhook", authenticatedBy: "telegram_webhook" },
      requestId: `telegram:${input.updateId}:register`,
      channel: "telegram",
      idempotencyKey: `telegram:${input.updateId}:register`
    }, input))
    : undefined;
  const resolveOnboarding = identityService
    ? (input: Parameters<ProductionTelegramIdentityHooks["resolveOnboarding"]>[0]) => identityResultUser(identityService.onboard({
      actorReference: { kind: "user", userId: input.actorUserId, authenticatedBy: "telegram_update" },
      requestId: `telegram:${input.updateId}:onboarding`,
      channel: "telegram",
      idempotencyKey: `telegram:${input.updateId}:onboarding`
    }, input.targetUserId, input.action, input.role))
    : undefined;
  if (resolveTelegramUser && registerTelegramApplicant && resolveOnboarding) {
    res.status(200).json(handleProductionTelegramUpdate(req.body, { resolveTelegramUser, registerTelegramApplicant, resolveOnboarding }));
    return;
  }
  res.status(200).json(handleTelegramUpdate(req.body, {
    resolveTelegramUser, registerTelegramApplicant, resolveOnboarding
  }));
}));

app.post("/api/saby/webhook/:secret", asyncRoute(async (req, res) => {
  if (!cashClient) throw new DomainError("CASH_UNAVAILABLE", "Кассовый сервис отключён", 503);
  res.status(202).json(await cashClient.webhook(req.params.secret, req.body ?? {}));
}));

app.get("/api/saby/status", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "saby:manage");
  res.json(cashClient ? await cashClient.status() : { availability: "disabled", enabled: false });
}));

app.get("/api/saby/mappings", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "saby:manage");
  if (!cashClient) throw new DomainError("CASH_UNAVAILABLE", "Кассовый сервис отключён", 503);
  res.json(await cashClient.mappings());
}));

app.put("/api/saby/mappings", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "saby:manage");
  if (!cashClient) throw new DomainError("CASH_UNAVAILABLE", "Кассовый сервис отключён", 503);
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Требуется Idempotency-Key", 400);
  const productId = String(req.body?.productId ?? "").trim();
  const product = (await warehouseLabelCatalog()).find((candidate) => candidate.id === productId);
  if (!product || product.status !== "active") throw new DomainError("PRODUCT_NOT_FOUND", "Товар не найден", 404);
  res.json(await cashClient.saveMapping({
    nomenclatureUuid: String(req.body?.nomenclatureUuid ?? "").trim(), productId, actorId: user.id, idempotencyKey,
    inventoryKind: product.inventoryKind, packageMassGrams: product.packageMassGrams
  }));
}));

app.get("/api/cash/status", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "saby:manage");
  res.json(cashClient ? await cashClient.status() : { availability: "disabled", enabled: false });
}));

app.post("/api/telegram/onboarding/:id/approve", asyncRoute((req, res) => {
  const user = actor(req);
  if (identityService) {
    identityResponse(res, identityService.onboard(identityMetadata(req, user), req.params.id, "approve", req.body.role));
    return;
  }
  const approved = approveTelegramOnboarding(user, req.params.id, req.body.role, () => {
    sessionService?.revokeUser(req.params.id, user.id, "onboarding_approval");
  });
  res.json(approved);
}));

app.get("/api/notification-preferences", asyncRoute((req, res) => {
  const user = actor(req);
  if (notificationPreferenceService) {
    res.json(notificationPreferenceService.list(user.id));
    return;
  }
  res.json(legacyState.notificationPreferences.filter((item) => item.userId === user.id));
}));

app.put("/api/notification-preferences", asyncRoute((req, res) => {
  const user = actor(req);
  if (notificationPreferenceService) {
    commandResponse(res, notificationPreferenceService.save(identityMetadata(req, user), {
      channel: req.body.channel,
      eventType: String(req.body.eventType || "all"),
      deliveryMode: req.body.deliveryMode
    }));
    return;
  }
  res.json(setNotificationPreference(user, { channel: req.body.channel, eventType: String(req.body.eventType || "all"), deliveryMode: req.body.deliveryMode }));
}));

app.post("/api/auth/logout", asyncRoute((req, res) => {
  const cookies = parseCookies(req.header("cookie"));
  if (sessionService) {
    sessionService.logout(cookies[sessionCookie]);
  } else {
    const session = legacyState.sessions.find((item) => item.id === cookies[sessionCookie] && !item.revokedAt);
    if (session) {
      session.revokedAt = new Date().toISOString();
      legacySaveState();
    }
  }
  res.clearCookie(sessionCookie, sessionCookieClearOptions(runtimeConfig.sessionCookie));
  res.json({ ok: true });
}));

if (devToolsEnabled) app.get("/api/dev/config", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const users = identityQueryService?.listActive() ?? legacyState.users;
  res.json({
    telegramTestMode: true,
    users: users.map((user) => ({
      id: user.id,
      telegramUserId: user.telegramUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      role: user.role,
      status: user.status
    }))
  });
}));

if (devToolsEnabled) app.post("/api/dev/telegram/init-data", asyncRoute((req, res) => {
  requireLocalDevTools(req);
  const requestedUserId = String(req.body.userId || "");
  const requestedTelegramId = String(req.body.telegramUserId || "");
  const user = identityQueryService
    ? (identityQueryService.findById(requestedUserId) || identityQueryService.findByTelegramUserId(requestedTelegramId))
    : legacyState.users.find((item) => item.id === requestedUserId || item.telegramUserId === requestedTelegramId);
  if (!user) throw new DomainError("NOT_FOUND", "Пользователь не найден", 404);
  const botToken = runtimeConfig.telegramBotToken;
  const initData = signTelegramInitData(
    {
      query_id: `dev-${nanoid()}`,
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({
        id: Number(user.telegramUserId),
        first_name: user.firstName,
        last_name: user.lastName,
        username: user.username
      })
    },
    botToken
  );
  res.json({ initData, userId: user.id, telegramUserId: user.telegramUserId });
}));

app.get("/api/summary", asyncRoute((req, res) => {
  const user = actor(req);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Vladivostok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  if (catalogQueries) {
    res.json(catalogQueries.summary({ userId: user.id, includeAllNotifications: user.role !== "seller", today }));
    return;
  }
  refreshScheduleState();
  const visibleProducts = legacyState.products.filter((product) => product.status === "active" || user.role !== "seller");
  const lowStock = legacyState.balances.filter((balance) => {
    const product = legacyState.products.find((item) => item.id === balance.productId);
    return product && balance.quantity <= product.lowStockThreshold;
  });
  res.json({
    activeProducts: visibleProducts.filter((item) => item.status === "active").length,
    lowStock: lowStock.length,
    currentShiftEmployees: legacyState.shifts.filter((shift) => shift.date === today && shift.status === "in_progress").flatMap((shift) => shift.employeeIds).length,
    latestOperations: legacyState.operations.slice(0, 6),
    notifications: legacyState.notifications.filter((item) => item.userId === user.id || user.role !== "seller").slice(0, 5)
  });
}));

app.get("/api/openapi.json", (_req, res) => {
  res.json(openApiContract);
});

app.get("/api/products", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:read");
  const q = normalizeSearch(String(req.query.q || ""));
  const status = String(req.query.status || "active");
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  if (catalogQueries) {
    res.json(catalogQueries.products({ status: user.role === "seller" ? "active" : status, search: q, page, limit }));
    return;
  }
  const filtered = legacyState.products.filter((product) => {
    if (user.role === "seller" && product.status !== "active") return false;
    if (status !== "all" && product.status !== status) return false;
    const haystack = normalizeSearch([
      product.officialName,
      product.localName,
      product.category,
      ...product.tags,
      ...product.identifiers.map((identifier) => identifier.value)
    ].join(" "));
    return !q || haystack.includes(q);
  });
  res.json({ items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit });
}));

app.get("/api/products/by-barcode/:barcode", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:read");
  const barcode = String(req.params.barcode || "").trim();
  if (!barcode || barcode.length > 128) throw new DomainError("VALIDATION_ERROR", "Некорректный штрихкод");
  const product = catalogQueries
    ? catalogQueries.productByBarcode(barcode)
    : legacyState.products.find((item) => item.identifiers.some((identifier) => identifier.type === "barcode" && identifier.value.trim().toLocaleLowerCase("ru-RU") === barcode.toLocaleLowerCase("ru-RU")));
  if (!product || product.status !== "active") throw new DomainError("PRODUCT_NOT_FOUND", "Товар с таким штрихкодом не найден", 404);
  res.json(product);
}));

app.post("/api/products/quick-scan", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:scan_manage");
  if (warehousePort) throw new DomainError("CATALOG_LEGACY_WRITE_DISABLED", "Каталог принадлежит Warehouse; legacy-запись отключена", 410);
  const barcode = String(req.body.barcode || "").trim();
  const name = String(req.body.name || "").trim();
  const inventoryKind = String(req.body.inventoryKind || "piece") as "piece" | "weight";
  const packageMassGrams = req.body.packageMassGrams === undefined || req.body.packageMassGrams === "" ? undefined : Number(req.body.packageMassGrams);
  if (!barcode || barcode.length > 128 || !name || !["piece", "weight"].includes(inventoryKind)) {
    throw new DomainError("VALIDATION_ERROR", "Заполните название, тип товара и штрихкод");
  }
  if (inventoryKind === "weight" && (!Number.isInteger(packageMassGrams) || Number(packageMassGrams) <= 0)) {
    throw new DomainError("PACKAGE_MASS_REQUIRED", "Для весового товара нужна положительная масса пачки в граммах");
  }
  const input = {
    officialName: name,
    localName: name,
    unit: inventoryKind === "weight" ? "кг" as const : "шт" as const,
    inventoryKind,
    packageMassGrams,
    category: "Без категории",
    lowStockThreshold: 5,
    identifiers: [{ type: "barcode" as const, value: barcode }]
  };
  if (catalogService) {
    commandResponse(res, catalogService.quickCreate(identityMetadata(req, user), input));
    return;
  }
  const conflict = legacyState.products.find((item) => item.identifiers.some((identifier) => identifier.type === "barcode" && identifier.value.trim().toLocaleLowerCase("ru-RU") === barcode.toLocaleLowerCase("ru-RU")));
  if (conflict) throw new DomainError("IDENTIFIER_CONFLICT", "Штрихкод уже принадлежит другому товару", 409);
  const product: Product = {
    id: nanoid(), officialName: name, localName: name, unit: input.unit, photoUrl: "", category: "Без категории",
    tags: [], status: "active", identifiers: [], lowStockThreshold: 5, inventoryKind, packageMassGrams, article: ""
  };
  product.identifiers.push({ id: nanoid(), productId: product.id, type: "barcode", value: barcode });
  legacyState.products.unshift(product);
  audit(user.id, "product", product.id, "quick_scan_create", product);
  res.status(201).json(product);
}));

app.post("/api/products", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:write");
  if (warehousePort) throw new DomainError("CATALOG_LEGACY_WRITE_DISABLED", "Каталог принадлежит Warehouse; legacy-запись отключена", 410);
  if (catalogService) {
    const identifiers = productIdentifiers("pending", req.body).map(({ id: _id, productId: _productId, ...identifier }) => identifier);
    commandResponse(res, catalogService.create(identityMetadata(req, user), {
      officialName: String(req.body.officialName || ""),
      localName: String(req.body.localName || ""),
      unit: String(req.body.unit || "шт") as Product["unit"],
      photoUrl: String(req.body.photoUrl || ""),
      category: String(req.body.category || "Без категории"),
      lowStockThreshold: Number(req.body.lowStockThreshold ?? 5),
      identifiers,
      groupId: req.body.groupId ? String(req.body.groupId) : undefined,
      manufacturerId: req.body.manufacturerId ? String(req.body.manufacturerId) : undefined,
      inventoryKind: String(req.body.inventoryKind || "piece") as "piece" | "weight",
      packageMassGrams: req.body.packageMassGrams === undefined || req.body.packageMassGrams === "" ? undefined : Number(req.body.packageMassGrams),
      article: String(req.body.article || "")
    }));
    return;
  }
  const unit = String(req.body.unit || "шт");
  if (!["шт", "кг", "л", "м"].includes(unit)) throw new DomainError("VALIDATION_ERROR", "Недопустимая единица измерения");
  const lowStockThreshold = Number(req.body.lowStockThreshold ?? 5);
  const inventoryKind = String(req.body.inventoryKind || "piece") as "piece" | "weight";
  const packageMassGrams = req.body.packageMassGrams === undefined || req.body.packageMassGrams === "" ? undefined : Number(req.body.packageMassGrams);
  if (inventoryKind === "piece" && unit !== "шт") throw new DomainError("PIECE_UNIT_REQUIRED", "Штучный товар учитывается только в штуках");
  if (inventoryKind === "weight" && (!Number.isInteger(packageMassGrams) || Number(packageMassGrams) <= 0)) throw new DomainError("WEIGHT_PACKAGE_MASS_REQUIRED", "Для весового товара укажите массу пачки");
  const groupId = req.body.groupId ? String(req.body.groupId) : undefined;
  const group = legacyState.productGroups?.find((item) => item.id === groupId);
  if (group && group.inventoryKind !== inventoryKind) throw new DomainError("GROUP_KIND_CONFLICT", "Тип товара не совпадает с типом группы", 409);
  const product = {
    id: nanoid(),
    officialName: String(req.body.officialName || "").trim(),
    localName: String(req.body.localName || "").trim(),
    unit: unit as "шт" | "кг" | "л" | "м",
    photoUrl: String(req.body.photoUrl || ""),
    category: String(req.body.category || "Без категории"),
    tags: [],
    status: "active" as const,
    identifiers: [] as ProductIdentifier[],
    lowStockThreshold,
    inventoryKind,
    packageMassGrams,
    groupId,
    manufacturerId: req.body.manufacturerId ? String(req.body.manufacturerId) : undefined,
    article: String(req.body.article || "")
  };
  if (!product.officialName) throw new DomainError("VALIDATION_ERROR", "Название обязательно");
  product.identifiers = productIdentifiers(product.id, req.body);
  legacyState.products.unshift(product);
  audit(user.id, "product", product.id, "create", product);
  res.status(201).json(product);
}));

app.post("/api/media/upload", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:write");
  const mimeType = String(req.body.mimeType || "");
  const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
  const extension = allowed.get(mimeType);
  if (!extension) throw new DomainError("BAD_MEDIA_TYPE", "Поддерживаются JPEG, PNG и WebP");
  const base64 = normalizeMediaBase64(String(req.body.base64 || ""));
  const decodedBytes = decodedBase64ByteLength(base64);
  if (decodedBytes === null) throw new DomainError("BAD_MEDIA_DATA", "Некорректные данные изображения");
  if (decodedBytes > MEDIA_UPLOAD_MAX_BYTES) throw new DomainError("MEDIA_TOO_LARGE", `Размер изображения не должен превышать ${MEDIA_UPLOAD_MAX_LABEL}`, 413);
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length !== decodedBytes) throw new DomainError("BAD_MEDIA_DATA", "Некорректные данные изображения");
  return compressImage(buffer, mimeType as MediaMimeType).then(async ({ body, mimeType: finalMimeType, compressed, width, height }) => {
    const stored = await mediaStorage.put({ key: mediaKey(finalMimeType), body, mimeType: finalMimeType });
    const changes = { mimeType: finalMimeType, bytes: stored.bytes, originalBytes: buffer.length, compressed, width, height, storage: stored.storage };
    if (artifactService) {
      const metadata = identityMetadata(req, user);
      requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`media:${stored.key}`, metadata.idempotencyKey) }, "products:write", {
        scope: "artifact.media.upload", entity: "media", entityId: stored.key, action: "upload", changes: jsonObjectValue(changes)
      }));
    } else audit(user.id, "media", stored.key, "upload", changes);
    res.status(201).json({ url: stored.url, name: stored.key, mimeType: finalMimeType, bytes: stored.bytes, originalBytes: buffer.length, compressed, width, height, storage: stored.storage });
  });
}));

app.post("/api/media/validate-link", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "products:write");
  const value = String(req.body.url || "").trim();
  const result = await validateExternalMediaUrl(value);
  audit(user.id, "media", value, "validate_link", { contentType: result.contentType, bytes: result.bytes });
  res.json({ valid: true, ...result });
}));

app.post("/api/products/:id/barcodes", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:scan_manage");
  if (warehousePort) throw new DomainError("CATALOG_LEGACY_WRITE_DISABLED", "Каталог принадлежит Warehouse; legacy-запись отключена", 410);
  const barcode = String(req.body.barcode || "").trim();
  if (!barcode || barcode.length > 128) throw new DomainError("VALIDATION_ERROR", "Некорректный штрихкод");
  if (catalogService) {
    commandResponse(res, catalogService.addBarcode(identityMetadata(req, user), { productId: req.params.id, barcode }));
    return;
  }
  const product = legacyState.products.find((item) => item.id === req.params.id && item.status === "active");
  if (!product) throw new DomainError("NOT_FOUND", "Товар не найден", 404);
  const conflict = legacyState.products.find((item) => item.identifiers.some((identifier) => identifier.type === "barcode" && identifier.value.trim().toLocaleLowerCase("ru-RU") === barcode.toLocaleLowerCase("ru-RU")));
  if (conflict && conflict.id !== product.id) throw new DomainError("IDENTIFIER_CONFLICT", "Штрихкод уже принадлежит другому товару", 409);
  if (!conflict) {
    product.identifiers.push({ id: nanoid(), productId: product.id, type: "barcode", value: barcode });
    audit(user.id, "product", product.id, "barcode_add", { barcode });
  }
  res.status(conflict ? 200 : 201).json(product);
}));

app.patch("/api/products/:id", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:write");
  if (warehousePort) throw new DomainError("CATALOG_LEGACY_WRITE_DISABLED", "Каталог принадлежит Warehouse; legacy-запись отключена", 410);
  if (catalogService) {
    commandResponse(res, catalogService.update(identityMetadata(req, user), {
      productId: req.params.id,
      ...(req.body.photoUrl === undefined ? {} : { photoUrl: String(req.body.photoUrl) }),
      ...(req.body.status === undefined ? {} : { status: String(req.body.status) as Product["status"] }),
      ...(req.body.localName === undefined ? {} : { localName: String(req.body.localName) }),
      ...(req.body.category === undefined ? {} : { category: String(req.body.category) })
      ,...(req.body.groupId === undefined ? {} : { groupId: String(req.body.groupId) }),
      ...(req.body.manufacturerId === undefined ? {} : { manufacturerId: String(req.body.manufacturerId) }),
      ...(req.body.packageMassGrams === undefined ? {} : { packageMassGrams: Number(req.body.packageMassGrams) }),
      ...(req.body.article === undefined ? {} : { article: String(req.body.article) })
    }));
    return;
  }
  const product = legacyState.products.find((item) => item.id === req.params.id);
  if (!product) throw new DomainError("NOT_FOUND", "Товар не найден", 404);
  const status = req.body.status !== undefined ? String(req.body.status) : product.status;
  if (!["active", "archived", "deleted"].includes(status)) throw new DomainError("VALIDATION_ERROR", "Недопустимый статус товара");
  Object.assign(product, {
    status: status as typeof product.status,
    photoUrl: req.body.photoUrl !== undefined ? String(req.body.photoUrl).trim() : product.photoUrl,
    localName: req.body.localName !== undefined ? String(req.body.localName).trim() : product.localName,
    category: req.body.category !== undefined ? String(req.body.category).trim() : product.category,
    groupId: req.body.groupId !== undefined ? String(req.body.groupId || "") || undefined : product.groupId,
    manufacturerId: req.body.manufacturerId !== undefined ? String(req.body.manufacturerId || "") || undefined : product.manufacturerId,
    packageMassGrams: req.body.packageMassGrams !== undefined ? Number(req.body.packageMassGrams) : product.packageMassGrams,
    article: req.body.article !== undefined ? String(req.body.article) : product.article
  });
  audit(user.id, "product", product.id, "update", req.body);
  res.json(product);
}));

app.get("/api/product-groups", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:read");
  res.json(catalogQueries?.groups() ?? legacyState.productGroups ?? []);
}));

app.post("/api/product-groups", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService) {
    requirePermission(user, "products:write");
    const inventoryKind = String(req.body.inventoryKind || "") as ProductGroup["inventoryKind"];
    const name = String(req.body.name || "").trim();
    if (!name || !["piece", "weight"].includes(inventoryKind)) throw new DomainError("VALIDATION_ERROR", "Некорректная группа товара");
    const group: ProductGroup = { id: nanoid(), name, inventoryKind, status: "active", version: 0 };
    (legacyState.productGroups ||= []).push(group); audit(user.id, "product_group", group.id, "create", group); res.status(201).json(group); return;
  }
  commandResponse(res, catalogService.createGroup(identityMetadata(req, user), { name: String(req.body.name || ""), inventoryKind: String(req.body.inventoryKind || "") as "piece" | "weight" }));
}));

app.get("/api/manufacturers", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "products:read");
  res.json(catalogQueries?.manufacturers() ?? legacyState.manufacturers ?? []);
}));

app.post("/api/manufacturers", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService) {
    requirePermission(user, "products:write"); const name = String(req.body.name || "").trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "Название обязательно");
    const manufacturer: Manufacturer = { id: nanoid(), name, status: "active", version: 0 };
    (legacyState.manufacturers ||= []).push(manufacturer); audit(user.id, "manufacturer", manufacturer.id, "create", manufacturer); res.status(201).json(manufacturer); return;
  }
  commandResponse(res, catalogService.createManufacturer(identityMetadata(req, user), { name: String(req.body.name || "") }));
}));

app.get("/api/products/:id/packagings", asyncRoute((req, res) => {
  actor(req);
  res.json(catalogQueries?.packagings(req.params.id) ?? legacyState.packagings?.filter((item) => item.productId === req.params.id) ?? []);
}));

app.post("/api/products/:id/packagings", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService) {
    requirePermission(user, "products:write"); const name = String(req.body.name || "").trim(); if (!name) throw new DomainError("VALIDATION_ERROR", "Название обязательно");
    const packaging: ProductPackaging = { id: nanoid(), productId: req.params.id, name, unitsPerPackage: Number(req.body.unitsPerPackage || 1), massGrams: req.body.massGrams ? Number(req.body.massGrams) : undefined, isPrimary: Boolean(req.body.isPrimary), version: 0 };
    (legacyState.packagings ||= []).push(packaging); audit(user.id, "product_packaging", packaging.id, "create", packaging); res.status(201).json(packaging); return;
  }
  commandResponse(res, catalogService.addPackaging(identityMetadata(req, user), {
    productId: req.params.id, name: String(req.body.name || ""), unitsPerPackage: Number(req.body.unitsPerPackage || 1),
    massGrams: req.body.massGrams === undefined || req.body.massGrams === "" ? undefined : Number(req.body.massGrams), isPrimary: Boolean(req.body.isPrimary)
  }));
}));

app.get("/api/product-prices", asyncRoute((req, res) => {
  actor(req);
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined; const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
  res.json(catalogQueries?.prices({ groupId, productId }) ?? legacyState.priceHistory?.filter((item) => (!groupId || item.groupId === groupId) && (!productId || item.productId === productId)) ?? []);
}));

app.post("/api/product-prices", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService) {
    requirePermission(user, "products:write"); const price: ProductPriceHistory = { id: nanoid(), groupId: req.body.groupId ? String(req.body.groupId) : undefined, productId: req.body.productId ? String(req.body.productId) : undefined, priceKopecks: Number(req.body.priceKopecks), priceUnit: String(req.body.priceUnit) as ProductPriceHistory["priceUnit"], effectiveFrom: String(req.body.effectiveFrom), createdByUserId: user.id, createdAt: new Date().toISOString() };
    (legacyState.priceHistory ||= []).push(price); audit(user.id, "product_price", price.id, "create", price); res.status(201).json(price); return;
  }
  commandResponse(res, catalogService.addPrice(identityMetadata(req, user), {
    groupId: req.body.groupId ? String(req.body.groupId) : undefined, productId: req.body.productId ? String(req.body.productId) : undefined,
    priceKopecks: Number(req.body.priceKopecks), priceUnit: String(req.body.priceUnit || "") as "piece" | "kilogram", effectiveFrom: String(req.body.effectiveFrom || "")
  }));
}));

app.post("/api/products/archive/preview", asyncRoute((req, res) => {
  const user = actor(req);
  res.json(previewArchiveCandidates(user, Number(req.body.inactiveDays || 90)));
}));

app.post("/api/products/archive/commit", asyncRoute((req, res) => {
  const user = actor(req);
  res.json(commitArchiveCandidates(user, { inactiveDays: Number(req.body.inactiveDays || 90), productIds: req.body.productIds || [], idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") }));
}));

app.get("/api/locations", asyncRoute((req, res) => {
  actor(req);
  if (catalogQueries) {
    res.json(catalogQueries.locations());
    return;
  }
  res.json(legacyState.locations.filter((location) => location.status === "active"));
}));

app.post("/api/locations", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис каталога недоступен", 503);
  commandResponse(res, catalogService.saveLocation(identityMetadata(req, user), {
    code: String(req.body.code || ""), name: String(req.body.name || ""), type: String(req.body.type || "other") as import("../shared/types").Location["type"],
    parentId: req.body.parentId ? String(req.body.parentId) : undefined
  }));
}));

app.patch("/api/locations/:id", asyncRoute((req, res) => {
  const user = actor(req);
  if (!catalogService || !catalogQueries) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис каталога недоступен", 503);
  const current = catalogQueries.locationById(req.params.id);
  if (!current) throw new DomainError("NOT_FOUND", "Полка не найдена", 404);
  commandResponse(res, catalogService.saveLocation(identityMetadata(req, user), {
    id: current.id, code: req.body.code === undefined ? current.code : String(req.body.code), name: req.body.name === undefined ? current.name : String(req.body.name),
    type: req.body.type === undefined ? current.type : String(req.body.type) as typeof current.type,
    parentId: req.body.parentId === undefined ? current.parentId : String(req.body.parentId || "") || undefined,
    status: req.body.status === undefined ? current.status : String(req.body.status) as typeof current.status
  }));
}));

app.get("/api/balances", asyncRoute((req, res) => {
  actor(req);
  if (catalogQueries) {
    res.json(catalogQueries.balances());
    return;
  }
  res.json(legacyState.balances);
}));

app.get("/api/stock/totals", asyncRoute((req, res) => {
  actor(req);
  res.json(catalogQueries?.totals() ?? []);
}));

app.get("/api/runtime/capabilities", asyncRoute((req,res)=>{
  actor(req);
  res.json({ warehouseWriteMode: warehousePort ? "fifo" : "legacy" });
}));

registerWarehouseRoutes(app,{
  actor,requirePermission,
  error:(code,message,status)=>new DomainError(code,message,status),
  service:warehousePort,
  cashStatus:()=>cashClient?cashClient.status():Promise.resolve({availability:"disabled",enabled:false}),
  parseSupplyFile,inspectSupplyFile
});
registerCompanyRoutes(app,{
  actor,requireReports:(user)=>requirePermission(user,"reports:read"),
  error:(code,message,status)=>new DomainError(code,message,status),
  queries:companyQueryService
});

app.post("/api/stock/operations", asyncRoute((req, res) => {
  const user = actor(req);
  if (warehousePort) throw new DomainError("WAREHOUSE_LEGACY_WRITE_DISABLED", "Операции склада выполняются через Warehouse", 410);
  if (stockService) {
    commandResponse(res, stockService.execute(identityMetadata(req, user), {
      type: String(req.body.type || "") as "receipt" | "transfer" | "write_off" | "correction",
      productId: String(req.body.productId || ""),
      ...(req.body.fromLocationId ? { fromLocationId: String(req.body.fromLocationId) } : {}),
      ...(req.body.toLocationId ? { toLocationId: String(req.body.toLocationId) } : {}),
      quantity: Number(req.body.quantity),
      reason: String(req.body.reason || "")
    }));
    return;
  }
  const operation = applyStockOperation({
    user,
    type: req.body.type,
    productId: req.body.productId,
    fromLocationId: req.body.fromLocationId,
    toLocationId: req.body.toLocationId,
    quantity: Number(req.body.quantity),
    reason: String(req.body.reason || ""),
    idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "")
  });
  res.status(201).json(operation);
}));

app.post("/api/stock/operations/:id/reverse", asyncRoute((req, res) => {
  const user = actor(req);
  if (warehousePort) throw new DomainError("WAREHOUSE_LEGACY_WRITE_DISABLED", "Операции склада выполняются через Warehouse", 410);
  if (reversalService) {
    commandResponse(res, reversalService.execute(identityMetadata(req, user), req.params.id));
    return;
  }
  const operation = reverseOperation(user, req.params.id, String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(201).json(operation);
}));

app.get("/api/stock/operations", asyncRoute((req, res) => {
  actor(req);
  if (catalogQueries) {
    res.json(catalogQueries.operations());
    return;
  }
  res.json(legacyState.operations.slice(0, 100));
}));

app.get("/api/reports/:type", asyncRoute((req, res) => {
  const user = actor(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "Неизвестный тип отчёта");
  const query = {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    productId: typeof req.query.productId === "string" ? req.query.productId : undefined,
    locationId: typeof req.query.locationId === "string" ? req.query.locationId : undefined
  };
  if (catalogQueries) {
    requirePermission(user, "reports:read");
    res.json(catalogQueries.reportRows(type, query));
    return;
  }
  res.json(reportRows(user, type, query));
}));

app.get("/api/reports/:type/export", asyncRoute((req, res) => {
  const user = actor(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "Неизвестный тип отчёта");
  const query = { from: typeof req.query.from === "string" ? req.query.from : undefined, to: typeof req.query.to === "string" ? req.query.to : undefined, productId: typeof req.query.productId === "string" ? req.query.productId : undefined, locationId: typeof req.query.locationId === "string" ? req.query.locationId : undefined };
  const rows = catalogQueries
    ? (requirePermission(user, "reports:read"), catalogQueries.reportRows(type, query))
    : reportRows(user, type, query);
  const columns = type === "movements" ? movementReportColumns : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(","))].join("\n");
  res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="report-${type}.csv"`).send(`\uFEFF${csv}`);
}));

app.get("/api/reports/:type/pdf", asyncRoute(async (req, res) => {
  const user = actor(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "Неизвестный тип отчёта");
  const query = { from: typeof req.query.from === "string" ? req.query.from : undefined, to: typeof req.query.to === "string" ? req.query.to : undefined, productId: typeof req.query.productId === "string" ? req.query.productId : undefined, locationId: typeof req.query.locationId === "string" ? req.query.locationId : undefined };
  const pdf = catalogQueries
    ? await (requirePermission(user, "reports:read"), renderReportPdfRows(type, catalogQueries.reportRows(type, query), query))
    : await renderReportPdf(user, type, query);
  res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", `attachment; filename="report-${type}.pdf"`).send(pdf);
}));

app.post("/api/reports/:type/telegram", asyncRoute(async (req, res) => {
  const user = actor(req);
  const type = req.params.type;
  if (!isReportType(type)) throw new DomainError("BAD_REPORT_TYPE", "Неизвестный тип отчёта");
  const message = await queueReportTelegram(user, type, { from: typeof req.body?.from === "string" ? req.body.from : undefined, to: typeof req.body?.to === "string" ? req.body.to : undefined, productId: typeof req.body?.productId === "string" ? req.body.productId : undefined, locationId: typeof req.body?.locationId === "string" ? req.body.locationId : undefined });
  res.status(202).json({ id: message.id, status: message.status });
}));

app.get("/api/inventory/:locationId/snapshot", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "inventory:write");
  if (catalogQueries) {
    if (!catalogQueries.locations().some((location) => location.id === req.params.locationId)) throw new DomainError("NOT_FOUND", "Точка не найдена", 404);
    res.json(catalogQueries.inventorySnapshot(req.params.locationId));
    return;
  }
  res.json(inventorySnapshot(req.params.locationId));
}));

app.get("/api/inventory/session/active", asyncRoute((req, res) => {
  actor(req);
  res.json(catalogQueries?.activeInventorySession() ?? null);
}));

app.post("/api/inventory/sessions", asyncRoute((req, res) => {
  const user = actor(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис инвентаризации недоступен", 503);
  commandResponse(res, inventorySessionService.start(identityMetadata(req, user)));
}));

app.post("/api/inventory/sessions/:id/close", asyncRoute((req, res) => {
  const user = actor(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис инвентаризации недоступен", 503);
  commandResponse(res, inventorySessionService.close(identityMetadata(req, user), req.params.id, { rows: Array.isArray(req.body.rows) ? req.body.rows : [], comment: String(req.body.comment || "") }));
}));

app.get("/api/consumption", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "inventory:write");
  res.json(catalogQueries?.consumptions() ?? []);
}));

app.post("/api/consumption", asyncRoute((req, res) => {
  const user = actor(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис инвентаризации недоступен", 503);
  commandResponse(res, inventorySessionService.consume(identityMetadata(req, user), { productId: String(req.body.productId || ""), quantity: Number(req.body.quantity), comment: String(req.body.comment || ""), source: req.body.source === "damage" ? "damage" : "manual" }));
}));

app.post("/api/stock/adjustments", asyncRoute((req, res) => {
  const user = actor(req);
  if (!inventorySessionService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис инвентаризации недоступен", 503);
  commandResponse(res, inventorySessionService.adjust(identityMetadata(req, user), { productId: String(req.body.productId || ""), delta: Number(req.body.delta), comment: String(req.body.comment || "") }));
}));

app.post("/api/inventory/apply", asyncRoute((req, res) => {
  const user = actor(req);
  if (warehousePort) throw new DomainError("WAREHOUSE_LEGACY_WRITE_DISABLED", "Операции склада выполняются через Warehouse", 410);
  if (inventoryService) {
    commandResponse(res, inventoryService.execute(identityMetadata(req, user), {
      rows: Array.isArray(req.body.rows) ? req.body.rows : [],
      comment: String(req.body.comment || "")
    }));
    return;
  }
  const operations = applyInventory(user, req.body.rows || [], String(req.body.comment || ""), String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(201).json({ operations });
}));

app.post("/api/stock/buffer/apply", asyncRoute((req, res) => {
  const user = actor(req);
  const results = applyBufferedStockOperations(user, req.body.entries || [], String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.status(200).json({ results });
}));

app.get("/api/schedule", asyncRoute(async (req, res) => {
  const user = actor(req);
  if (staffClient) { res.json(await staffClient.schedule({ ...(!hasPermission(user,"schedule:manage") ? {userId:user.id}:{}), ...(typeof req.query.from === "string" ? {from:req.query.from}:{}), ...(typeof req.query.to === "string" ? {to:req.query.to}:{}) })); return; }
  if (staffQueries) {
    res.json(staffQueries.shifts({
      ...(typeof req.query.from === "string" ? { from: req.query.from } : {}),
      ...(typeof req.query.to === "string" ? { to: req.query.to } : {})
    }));
    return;
  }
  refreshScheduleState();
  res.json(listVisibleScheduleShifts(user));
}));

app.get("/api/schedule/days", asyncRoute(async (req, res) => {
  const user = actor(req);
  if (staffClient) { res.json(await staffClient.scheduleDays({ ...(typeof req.query.from === "string" ? {from:req.query.from}:{}), ...(typeof req.query.to === "string" ? {to:req.query.to}:{}) })); return; }
  if (staffQueries) {
    res.json(staffQueries.days({
      ...(typeof req.query.from === "string" ? { from: req.query.from } : {}),
      ...(typeof req.query.to === "string" ? { to: req.query.to } : {})
    }));
    return;
  }
  res.json(legacyState.scheduleDays);
}));

app.put("/api/schedule/days/:date/:locationId", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){ const idempotencyKey=req.header("idempotency-key")?.trim(); if(!idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400); const current=(await staffClient.scheduleDays({from:req.params.date,to:req.params.date})).find((day)=>day.locationId===req.params.locationId); res.json(await staffClient.saveScheduleDay({date:req.params.date,locationId:req.params.locationId,status:req.body.status,comment:String(req.body.comment||""),expectedVersion:current?.version??null,idempotencyKey})); return; }
  if (scheduleService && staffQueries) {
    commandResponse(res, scheduleService.saveDay(identityMetadata(req, user), {
      date: req.params.date,
      locationId: req.params.locationId,
      status: req.body.status,
      comment: String(req.body.comment || ""),
      expectedVersion: staffQueries.dayRevision(req.params.date, req.params.locationId)
    }));
    return;
  }
  const day = setScheduleDay(user, {
    date: req.params.date,
    locationId: req.params.locationId,
    status: req.body.status,
    comment: String(req.body.comment || "")
  });
  res.json(day);
}));

app.get("/api/schedule/export", asyncRoute(async (req, res) => {
  const user = actor(req);
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const format = String(req.query.format || "csv");
  const locationId = req.query.locationId ? String(req.query.locationId) : undefined;
  const rows = staffClient
    ? await staffClient.schedule({from,to})
    : staffQueries
    ? (() => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new DomainError("BAD_EXPORT_RANGE", "Неверный диапазон дат");
      return staffQueries.shifts({ from, to }).filter((shift) => !locationId || shift.locationId === locationId);
    })()
    : scheduleExportRows(user, from, to, locationId);
  const sqlLocations = catalogQueries ? new Map(catalogQueries.locations().map((location) => [location.id, location.name])) : undefined;
  const employeeName = (id: string) => {
    const employee = identityQueryService?.findById(id) ?? (!catalogQueries ? legacyState.users.find((item) => item.id === id) : undefined);
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() || employee.id : id;
  };
  if (format === "csv") {
    const csv = [
      ["Дата", "Локация", "Сотрудники", "Статус", "Комментарий"].map(csvCell).join(","),
      ...rows.map((shift) => [shift.date, sqlLocations?.get(shift.locationId) ?? (legacyState.locations.find((item) => item.id === shift.locationId)?.name || shift.locationId), shift.employeeIds.map(employeeName).join("; "), shift.status, shift.comment].map(csvCell).join(","))
    ].join("\n");
    res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="schedule-${from}_${to}.csv"`).send(`\uFEFF${csv}`);
    return;
  }
  if (format === "pdf") return renderSchedulePdf(res, rows, from, to, catalogQueries ? { locationName: (id) => sqlLocations?.get(id) ?? id, employeeName } : undefined);
  throw new DomainError("BAD_EXPORT_FORMAT", "Поддерживаются только CSV и PDF");
}));

app.post("/api/schedule/rotation/preview", asyncRoute(async (req, res) => {
  const user = actor(req);
  if (staffClient) {
    requirePermission(user, "schedule:manage");
    for (const id of Array.isArray(req.body.employeeIds) ? req.body.employeeIds.map(String) : []) {
      const target = identityQueryService?.findById(id);
      if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
      await staffClient.syncIdentity({ userId: target.id, status: target.status });
    }
    res.json(await staffClient.previewRotation(req.body));
    return;
  }
  res.json(previewRotation(user, req.body));
}));

app.post("/api/schedule/rotation/commit", asyncRoute(async (req, res) => {
  const user = actor(req);
  const input = { ...req.body, idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") };
  if (staffClient) {
    requirePermission(user, "schedule:manage");
    if (!input.idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Требуется Idempotency-Key", 400);
    for (const id of Array.isArray(req.body.employeeIds) ? req.body.employeeIds.map(String) : []) {
      const target = identityQueryService?.findById(id);
      if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
      await staffClient.syncIdentity({ userId: target.id, status: target.status });
    }
    res.status(201).json(await staffClient.commitRotation(input));
    return;
  }
  res.status(201).json(commitRotation(user, input));
}));

app.post("/api/schedule/future-replacement/preview", asyncRoute(async (req, res) => {
  const user = actor(req);
  if (staffClient) {
    requirePermission(user, "schedule:manage");
    for (const id of [String(req.body.fromUserId || ""), String(req.body.toUserId || "")]) {
      const target = identityQueryService?.findById(id);
      if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
      await staffClient.syncIdentity({ userId: target.id, status: target.status });
    }
    res.json(await staffClient.previewFutureReplacement(req.body));
    return;
  }
  res.json(previewFutureReplacement(user, req.body));
}));

app.post("/api/schedule/future-replacement/commit", asyncRoute(async (req, res) => {
  const user = actor(req);
  const input = { ...req.body, idempotencyKey: String(req.header("idempotency-key") || req.body.idempotencyKey || "") };
  if (staffClient) {
    requirePermission(user, "schedule:manage");
    if (!input.idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Требуется Idempotency-Key", 400);
    for (const id of [String(req.body.fromUserId || ""), String(req.body.toUserId || "")]) {
      const target = identityQueryService?.findById(id);
      if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
      await staffClient.syncIdentity({ userId: target.id, status: target.status });
    }
    res.json(await staffClient.commitFutureReplacement(input));
    return;
  }
  res.json(commitFutureReplacement(user, input));
}));

app.post("/api/schedule", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){ const employeeIds=Array.isArray(req.body.employeeIds)?req.body.employeeIds.map(String):[]; for(const id of employeeIds){const target=identityQueryService?.findById(id);if(!target)throw new DomainError("USER_NOT_FOUND","Пользователь не найден",404);await staffClient.syncIdentity({userId:target.id,status:target.status});} const idempotencyKey=req.header("idempotency-key")?.trim();if(!idempotencyKey)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400);res.status(201).json(await staffClient.saveShift({date:String(req.body.date||""),start:String(req.body.start||""),end:String(req.body.end||""),locationId:String(req.body.locationId||""),employeeIds,status:req.body.status,comment:String(req.body.comment||""),expectedVersion:null,idempotencyKey}));return;}
  if (scheduleService) {
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      date: String(req.body.date || ""),
      start: String(req.body.start || ""),
      end: String(req.body.end || ""),
      locationId: String(req.body.locationId || ""),
      employeeIds: Array.isArray(req.body.employeeIds) ? req.body.employeeIds : [],
      status: req.body.status,
      comment: String(req.body.comment || ""),
      expectedVersion: null
    }));
    return;
  }
  const shift = createShift(user, {
    date: String(req.body.date || ""),
    start: String(req.body.start || ""),
    end: String(req.body.end || ""),
    locationId: String(req.body.locationId || ""),
    employeeIds: req.body.employeeIds || [],
    status: req.body.status,
    comment: String(req.body.comment || "")
  });
  refreshScheduleState(new Date(), user.id);
  res.status(201).json(shift);
}));

app.patch("/api/schedule/:id", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){const current=(await staffClient.schedule({})).find((shift)=>shift.id===req.params.id);if(!current)throw new DomainError("NOT_FOUND","Смена не найдена",404);const employeeIds=Array.isArray(req.body.employeeIds)?req.body.employeeIds.map(String):current.employeeIds;for(const id of employeeIds){const target=identityQueryService?.findById(id);if(!target)throw new DomainError("USER_NOT_FOUND","Пользователь не найден",404);await staffClient.syncIdentity({userId:target.id,status:target.status});}const idempotencyKey=req.header("idempotency-key")?.trim();if(!idempotencyKey)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400);res.json(await staffClient.saveShift({id:current.id,date:req.body.date===undefined?current.date:String(req.body.date),start:req.body.start===undefined?current.start:String(req.body.start),end:req.body.end===undefined?current.end:String(req.body.end),locationId:req.body.locationId===undefined?current.locationId:String(req.body.locationId),employeeIds,status:req.body.status===undefined?current.status:req.body.status,comment:req.body.comment===undefined?current.comment:String(req.body.comment),expectedVersion:current.version,idempotencyKey}));return;}
  if (scheduleService && staffQueries) {
    const current = staffQueries.shiftForWrite(req.params.id);
    if (!current) throw new DomainError("NOT_FOUND", "Смена не найдена", 404);
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      id: current.shift.id,
      date: req.body.date === undefined ? current.shift.date : String(req.body.date),
      start: req.body.start === undefined ? current.shift.start : String(req.body.start),
      end: req.body.end === undefined ? current.shift.end : String(req.body.end),
      locationId: req.body.locationId === undefined ? current.shift.locationId : String(req.body.locationId),
      employeeIds: Array.isArray(req.body.employeeIds) ? req.body.employeeIds : current.shift.employeeIds,
      status: req.body.status === undefined ? current.shift.status : req.body.status,
      comment: req.body.comment === undefined ? current.shift.comment : String(req.body.comment),
      expectedVersion: Number(current.revision)
    }));
    return;
  }
  const shift = updateShift(user, req.params.id, req.body);
  refreshScheduleState(new Date(), user.id);
  res.json(shift);
}));

app.post("/api/schedule/:id/copy", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){const source=(await staffClient.schedule({})).find((shift)=>shift.id===req.params.id);if(!source)throw new DomainError("NOT_FOUND","Смена не найдена",404);for(const id of source.employeeIds){const target=identityQueryService?.findById(id);if(target)await staffClient.syncIdentity({userId:target.id,status:target.status});}const idempotencyKey=req.header("idempotency-key")?.trim();if(!idempotencyKey)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400);res.status(201).json(await staffClient.saveShift({date:String(req.body.date||""),start:source.start,end:source.end,locationId:source.locationId,employeeIds:source.employeeIds,status:source.status==="scheduled"||source.status==="draft"?source.status:"draft",comment:source.comment,expectedVersion:null,idempotencyKey}));return;}
  if (scheduleService && staffQueries) {
    const source = staffQueries.shiftForWrite(req.params.id);
    if (!source) throw new DomainError("NOT_FOUND", "Смена не найдена", 404);
    commandResponse(res, scheduleService.saveShift(identityMetadata(req, user), {
      date: String(req.body.date || ""), start: source.shift.start, end: source.shift.end,
      locationId: source.shift.locationId, employeeIds: source.shift.employeeIds,
      status: source.shift.status === "scheduled" || source.shift.status === "draft" ? source.shift.status : "draft",
      comment: source.shift.comment, expectedVersion: null
    }));
    return;
  }
  const shift = copyShift(user, req.params.id, String(req.body.date || ""));
  refreshScheduleState(new Date(), user.id);
  res.status(201).json(shift);
}));

app.get("/api/staff", asyncRoute((req, res) => {
  actor(req);
  res.json(identityQueryService?.listActive() ?? legacyState.users.filter((user) => user.status === "active"));
}));

app.get("/api/staff/profiles", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "staff:manage");
  if (staffClient) { res.json(await staffClient.profiles()); return; }
  res.json(staffQueries?.employeeProfiles() ?? []);
}));

app.get("/api/staff/status", asyncRoute(async (req,res)=>{
  const user=actor(req); requirePermission(user,"staff:manage");
  if(!staffClient) throw new DomainError("STAFF_UNAVAILABLE","Сервис сотрудников отключён",503);
  res.json(await staffClient.status());
}));

app.put("/api/staff/:id/profile", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "staff:manage");
  if (staffClient) {
    const target = identityQueryService?.findById(req.params.id);
    if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Требуется Idempotency-Key", 400);
    await staffClient.syncIdentity({ userId: target.id, status: target.status });
    res.json(await staffClient.saveProfile(req.params.id, { personnelNumber: req.body.personnelNumber, position: String(req.body.position || ""), hiredOn: String(req.body.hiredOn || ""), dismissedOn: req.body.dismissedOn ? String(req.body.dismissedOn) : undefined, status: req.body.status, expectedVersion: req.body.expectedVersion === undefined ? undefined : Number(req.body.expectedVersion), idempotencyKey }));
    return;
  }
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис сотрудников недоступен", 503);
  commandResponse(res, staffScheduleService.saveProfile(identityMetadata(req, user), req.params.id, {
    personnelNumber: req.body.personnelNumber,
    position: String(req.body.position || ""),
    hiredOn: String(req.body.hiredOn || ""),
    dismissedOn: req.body.dismissedOn ? String(req.body.dismissedOn) : undefined,
    status: req.body.status,
    expectedVersion: req.body.expectedVersion === undefined ? undefined : Number(req.body.expectedVersion)
  }));
}));

app.get("/api/hr-events", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "staff:manage");
  if (staffClient) { res.json(await staffClient.hrEvents({ ...(typeof req.query.userId === "string" ? { userId: req.query.userId } : {}), ...(typeof req.query.from === "string" ? { from: req.query.from } : {}), ...(typeof req.query.to === "string" ? { to: req.query.to } : {}) })); return; }
  res.json(staffQueries?.hrEvents({
    ...(typeof req.query.userId === "string" ? { userId: req.query.userId } : {}),
    ...(typeof req.query.from === "string" ? { from: req.query.from } : {}),
    ...(typeof req.query.to === "string" ? { to: req.query.to } : {})
  }) ?? []);
}));

app.post("/api/hr-events", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "staff:manage");
  if (staffClient) {
    const userId = String(req.body.userId || ""); const target = identityQueryService?.findById(userId);
    if (!target) throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Требуется Idempotency-Key", 400);
    await staffClient.syncIdentity({ userId: target.id, status: target.status });
    res.status(201).json(await staffClient.recordHrEvent({ userId, type: req.body.type, startDate: String(req.body.startDate || ""), endDate: req.body.endDate ? String(req.body.endDate) : undefined, shiftId: req.body.shiftId ? String(req.body.shiftId) : undefined, minutesLate: req.body.minutesLate === undefined ? undefined : Number(req.body.minutesLate), comment: String(req.body.comment || ""), actorId: user.id, idempotencyKey }));
    return;
  }
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис кадровых событий недоступен", 503);
  commandResponse(res, staffScheduleService.recordHrEvent(identityMetadata(req, user), {
    userId: String(req.body.userId || ""),
    type: req.body.type,
    startDate: String(req.body.startDate || ""),
    endDate: req.body.endDate ? String(req.body.endDate) : undefined,
    shiftId: req.body.shiftId ? String(req.body.shiftId) : undefined,
    minutesLate: req.body.minutesLate === undefined ? undefined : Number(req.body.minutesLate),
    comment: String(req.body.comment || "")
  }));
}));

app.get("/api/schedule/exchanges", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){res.json(await staffClient.exchanges(hasPermission(user,"schedule:manage")?undefined:user.id));return;}
  res.json(staffQueries?.exchanges(hasPermission(user, "schedule:manage") ? undefined : user.id) ?? []);
}));

app.post("/api/schedule/exchanges", asyncRoute(async (req, res) => {
  const user = actor(req);
  if(staffClient){const idempotencyKey=req.header("idempotency-key")?.trim();if(!idempotencyKey)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400);res.status(201).json(await staffClient.createExchange({fromShiftId:String(req.body.fromShiftId||""),toShiftId:String(req.body.toShiftId||""),actorId:user.id,idempotencyKey}));return;}
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис обменов недоступен", 503);
  commandResponse(res, staffScheduleService.createExchange(identityMetadata(req, user), {
    fromShiftId: String(req.body.fromShiftId || ""),
    toShiftId: String(req.body.toShiftId || "")
  }));
}));

app.post("/api/schedule/exchanges/:id/:action", asyncRoute(async (req, res) => {
  const user = actor(req);
  const action = req.params.action;
  if (action !== "accept" && action !== "decline" && action !== "cancel") throw new DomainError("BAD_ACTION", "Некорректное действие", 400);
  if(staffClient){const idempotencyKey=req.header("idempotency-key")?.trim();if(!idempotencyKey)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED","Требуется Idempotency-Key",400);res.json(await staffClient.resolveExchange(req.params.id,action,{actorId:user.id,idempotencyKey}));return;}
  if (!staffScheduleService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис обменов недоступен", 503);
  commandResponse(res, staffScheduleService.resolveExchange(identityMetadata(req, user), req.params.id, action));
}));

app.get("/api/schedule/swaps", asyncRoute((req, res) => {
  const user = actor(req);
  if (staffClient) throw new DomainError("FEATURE_REPLACED", "Используйте обмены смен", 410);
  if (staffQueries) {
    res.json(staffQueries.swaps(hasPermission(user, "schedule:manage") ? {} : { userId: user.id }));
    return;
  }
  refreshScheduleState();
  res.json(listVisibleScheduleSwaps(user));
}));

app.post("/api/schedule/swaps", asyncRoute((req, res) => {
  const user = actor(req);
  if (staffClient) throw new DomainError("FEATURE_REPLACED", "Используйте обмены смен", 410);
  if (scheduleService) {
    commandResponse(res, scheduleService.createSwap(identityMetadata(req, user), {
      shiftId: String(req.body.fromShiftId || ""), toUserId: String(req.body.toUserId || "")
    }));
    return;
  }
  refreshScheduleState();
  const swap = createSwapRequest(user, String(req.body.fromShiftId || ""), String(req.body.toUserId || ""));
  res.status(201).json(swap);
}));

app.post("/api/schedule/swaps/:id/accept", asyncRoute((req, res) => {
  const user = actor(req);
  if (staffClient) throw new DomainError("FEATURE_REPLACED", "Используйте обмены смен", 410);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "accept" }));
    return;
  }
  refreshScheduleState();
  res.json(acceptSwap(user, req.params.id));
}));

app.post("/api/schedule/swaps/:id/decline", asyncRoute((req, res) => {
  const user = actor(req);
  if (staffClient) throw new DomainError("FEATURE_REPLACED", "Используйте обмены смен", 410);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "decline" }));
    return;
  }
  refreshScheduleState();
  res.json(declineSwap(user, req.params.id));
}));

app.post("/api/schedule/swaps/:id/cancel", asyncRoute((req, res) => {
  const user = actor(req);
  if (staffClient) throw new DomainError("FEATURE_REPLACED", "Используйте обмены смен", 410);
  if (scheduleService) {
    commandResponse(res, scheduleService.resolveSwap(identityMetadata(req, user), { swapId: req.params.id, action: "cancel" }));
    return;
  }
  refreshScheduleState();
  res.json(cancelSwap(user, req.params.id));
}));

app.get("/api/users", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "users:manage");
  res.json(identityQueryService?.listForActor(user.id) ?? legacyState.users);
}));

app.patch("/api/users/:id", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "users:manage");
  if (identityService) {
    identityResponse(res, identityService.update(identityMetadata(req, user), req.params.id, {
      ...(req.body.status === undefined ? {} : { status: req.body.status }),
      ...(req.body.role === undefined ? {} : { role: req.body.role })
    }));
    return;
  }
  const target = legacyState.users.find((item) => item.id === req.params.id);
  if (!target) throw new DomainError("NOT_FOUND", "Пользователь не найден", 404);
  if (req.body.role && !hasPermission(user, "roles:manage")) throw new DomainError("FORBIDDEN", "Роль меняет только super admin", 403);
  if (req.body.status || req.body.role) sessionService?.revokeUser(target.id, user.id, "user_status_or_role_change");
  Object.assign(target, {
    status: req.body.status ?? target.status,
    role: req.body.role ?? target.role
  });
  if (req.body.role) {
    target.permissions = rolePermissions[target.role];
  }
  if (req.body.status || req.body.role) {
    const revokedAt = new Date().toISOString();
    for (const session of legacyState.sessions.filter((item) => item.userId === target.id && !item.revokedAt)) {
      session.revokedAt = revokedAt;
    }
  }
  audit(user.id, "user", target.id, "update", req.body);
  res.json(target);
}));

app.get("/api/audit", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "techlog:read");
  if (catalogQueries) {
    res.json(catalogQueries.audit());
    return;
  }
  res.json(legacyState.audit.slice(0, 100));
}));

app.post("/api/backups", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    const backup = createSqliteBackupBundle({ database: sessionDatabase, backupDirectory: runtimeConfig.backupDir, mediaDirectory: mediaDir });
    if (!artifactService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис аудита недоступен", 503);
    const metadata = identityMetadata(req, user);
    requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`backup:${backup.name}:create`, metadata.idempotencyKey) }, "techlog:read", {
      scope: "artifact.backup.create", entity: "backup", entityId: backup.name, action: "create", changes: jsonObjectValue(backup)
    }));
    res.status(201).json(backup);
    return;
  }
  const backup = createBackup();
  audit(user.id, "backup", path.basename(backup.path), "create", backup);
  res.status(201).json(backup);
}));

app.get("/api/backups", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    res.json(listSqliteBackupBundles(runtimeConfig.backupDir));
    return;
  }
  res.json(listBackups());
}));

app.post("/api/backups/:name/restore", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "techlog:read");
  if (sessionDatabase) {
    const backup = listSqliteBackupBundles(runtimeConfig.backupDir).find((item) => item.name === req.params.name);
    if (!backup) throw new DomainError("NOT_FOUND", "Backup not found", 404);
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    const restored = restoreSqliteBackupBundle({
      bundlePath: backup.path,
      databasePath: `${runtimeConfig.sqliteFile}.restore-${suffix}`,
      mediaDirectory: `${mediaDir}.restore-${suffix}`
    });
    if (!artifactService) throw new DomainError("SERVICE_UNAVAILABLE", "Сервис аудита недоступен", 503);
    const metadata = identityMetadata(req, user);
    requireArtifactRecorded(artifactService.recordExternal({ ...metadata, idempotencyKey: safeCommandIdentifier(`backup:${backup.name}:restore`, metadata.idempotencyKey) }, "techlog:read", {
      scope: "artifact.backup.restore", entity: "backup", entityId: backup.name, action: "restore_preflight", changes: jsonObjectValue(restored)
    }));
    res.json(restored);
    return;
  }
  const restored = restoreBackup(req.params.name);
  audit(user.id, "backup", req.params.name, "restore", restored);
  res.json(restored);
}));

app.post("/api/imports/preview", asyncRoute((req, res) => {
  const user = actor(req);
  const content = String(req.body.content || req.body.base64 || req.body.csv || "");
  const draft = previewCsvImport(user, String(req.body.fileName || "import.csv"), content, { supplierName: String(req.body.supplierName || ""), invoiceNumber: String(req.body.invoiceNumber || ""), columnMapping: req.body.columnMapping || undefined });
  res.status(201).json(draft);
}));

app.post("/api/imports/:id/commit", asyncRoute((req, res) => {
  const user = actor(req);
  const committed = commitCsvImport(user, req.params.id, String(req.body.locationId || "loc-main"), String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.json(committed);
}));

app.post("/api/imports/:id/undo", asyncRoute((req, res) => {
  const user = actor(req);
  const reverted = undoCsvImport(user, req.params.id, String(req.header("idempotency-key") || req.body.idempotencyKey || ""));
  res.json(reverted);
}));

app.get("/api/imports", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "imports:write");
  res.json(legacyState.imports.slice(0, 50));
}));

app.post("/api/merges/preview", asyncRoute((req, res) => {
  const user = actor(req);
  const merge = previewProductMerge(user, String(req.body.sourceProductId || ""), String(req.body.targetProductId || ""), req.body.resolution || {});
  res.status(201).json(merge);
}));

app.get("/api/merges/candidates", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "merge:write");
  const normalize = (value: string) => normalizeSearch(value).replace(/\b(товар|продукт|шт)\b/g, "").trim();
  const groups = new Map<string, typeof legacyState.products>();
  for (const product of legacyState.products.filter((item) => item.status === "active")) {
    const key = normalize(product.localName || product.officialName);
    if (key) groups.set(key, [...(groups.get(key) || []), product]);
  }
  res.json([...groups.entries()].filter(([, products]) => products.length > 1).map(([key, products]) => ({ key, score: 1, explanation: "Нормализованное название совпадает", productIds: products.map((product) => product.id) })));
}));

app.post("/api/merges/:id/commit", asyncRoute((req, res) => {
  const user = actor(req);
  res.json(commitProductMerge(user, req.params.id));
}));

app.post("/api/merges/:id/undo", asyncRoute((req, res) => {
  const user = actor(req);
  res.json(undoProductMerge(user, req.params.id));
}));

app.get("/api/merges", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "merge:write");
  res.json(legacyState.merges.slice(0, 50));
}));

app.get("/api/labels/products", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  const products = (await warehouseLabelCatalog())
    .filter((product) => product.status === "active")
    .map((product) => ({
      id: product.id,
      officialName: product.officialName,
      localName: product.localName,
      manufacturer: labelManufacturer(product.officialName)
    }));
  res.json({ items: products });
}));

app.post("/api/labels/preview", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  const job = await labelJobFromBody(user, req.body);
  const expandedLabels = expandLabels(job.labels);
  res.json({
    geometry: job.geometry,
    templateId: job.templateId,
    overflow: job.geometry.labelsPerPage < expandedLabels.length,
    items: job.labels,
    labels: expandedLabels
  });
}));

app.post("/api/labels/pdf", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  const job = await labelJobFromBody(user, req.body);
  if (expandLabels(job.labels).length > job.geometry.labelsPerPage) throw new DomainError("LABELS_OVERFLOW", "Этикетки не помещаются на одну страницу");
  if (artifactService) {
    const result = artifactService.createLabel(identityMetadata(req, user), job);
    if (result.outcome === "executed" || result.outcome === "replayed") {
      renderLabelsPdf(res, result.body as unknown as LabelPrintJob);
      return;
    }
    commandResponse(res, result);
    return;
  }
  legacyState.labelJobs.unshift(job);
  audit(user.id, "label_job", job.id, "create", { labels: expandLabels(job.labels).length, templateId: job.templateId, geometry: job.geometry });
  renderLabelsPdf(res, job);
}));

app.post("/api/labels/jobs", asyncRoute(async (req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  const job = await labelJobFromBody(user, req.body);
  if (artifactService) {
    commandResponse(res, artifactService.createLabel(identityMetadata(req, user), job));
    return;
  }
  legacyState.labelJobs.unshift(job);
  audit(user.id, "label_job", job.id, "create", { labels: expandLabels(job.labels).length, templateId: job.templateId, geometry: job.geometry });
  res.status(201).json(job);
}));

app.get("/api/labels/jobs", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  if (sessionDatabase) {
    res.json(sessionDatabase.query<Readonly<Record<string, unknown>>>("SELECT * FROM label_jobs ORDER BY created_at DESC, id DESC LIMIT 50").map(sqliteLabelJob));
    return;
  }
  res.json(legacyState.labelJobs.slice(0, 50));
}));

app.post("/api/labels/jobs/:id/reprint", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  if (artifactService) {
    commandResponse(res, artifactService.recordLabelReprint(identityMetadata(req, user), req.params.id));
    return;
  }
  const job = legacyState.labelJobs.find((item) => item.id === req.params.id);
  if (!job) throw new DomainError("NOT_FOUND", "Задание печати не найдено", 404);
  audit(user.id, "label_job", job.id, "reprint", { labels: expandLabels(job.labels).length });
  res.json(job);
}));

app.post("/api/labels/jobs/:id/pdf", asyncRoute((req, res) => {
  const user = actor(req);
  requirePermission(user, "labels:print");
  if (artifactService) {
    const result = artifactService.recordLabelReprint(identityMetadata(req, user), req.params.id);
    if (result.outcome === "executed" || result.outcome === "replayed") {
      renderLabelsPdf(res, result.body as unknown as LabelPrintJob);
      return;
    }
    commandResponse(res, result);
    return;
  }
  const job = legacyState.labelJobs.find((item) => item.id === req.params.id);
  if (!job) throw new DomainError("NOT_FOUND", "Задание печати не найдено", 404);
  audit(user.id, "label_job", job.id, "reprint", { labels: expandLabels(job.labels).length });
  renderLabelsPdf(res, job);
}));

app.use("/media", express.static(mediaStorage.localDirectory || mediaDir, { fallthrough: false, maxAge: "7d" }));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
    res.status(400).json({ code: "MALFORMED_JSON", message: "Malformed JSON request body" });
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    const mediaUpload = _req.originalUrl.startsWith("/api/media/upload");
    res.status(413).json({
      code: mediaUpload ? "MEDIA_BODY_TOO_LARGE" : "PAYLOAD_TOO_LARGE",
      message: mediaUpload ? `Тело загрузки превышает лимит изображения ${MEDIA_UPLOAD_MAX_LABEL}` : "Тело запроса слишком большое"
    });
    return;
  }
  if (error instanceof DomainError) {
    res.status(error.status).json({ code: error.code, message: error.message, details: error.details });
    return;
  }
  const requestId = String(res.getHeader("X-Request-Id") || "");
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
  console.error(JSON.stringify({ event: "http_error", requestId, method: _req.method, path: _req.path, name, message }));
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Внутренняя ошибка", requestId });
});

if (!devToolsEnabled) {
  app.all(["/api/auth/demo", "/api/dev/config", "/api/dev/telegram/init-data"], (_req, res) => {
    res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
  });
}

const port = Number(process.env.PORT || 5177);
let closeRuntime = async () => {};
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.resolve(__dirname, "public")));
  app.get("*", (_req, res) => res.sendFile(path.resolve(__dirname, "public/index.html")));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: path.resolve(__dirname, "../client")
  });
  app.use(vite.middlewares);
  closeRuntime = () => vite.close();
}

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Dvorik WebApp: http://localhost:${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: "shutdown", signal }));
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    try { warehouseDatabase?.close(); } catch { /* process exits non-zero below */ }
    try { sessionDatabase?.close(); } catch { /* process exits non-zero below */ }
    try { closeDatabase(); } catch { /* process exits non-zero below */ }
    process.exitCode = 1;
  }, 10_000);
  timeout.unref();
  server.close(async (error) => {
    clearTimeout(timeout);
    try {
      await closeRuntime();
      warehouseDatabase?.close();
      sessionDatabase?.close();
      closeDatabase();
    } catch {
      process.exitCode = 1;
      return;
    }
    process.exitCode = error ? 1 : 0;
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
