import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/database";
import { applyMigrations } from "../server/migrations";
import { SabyClient } from "../server/saby-client";
import { CashService } from "./cash-service";
import { loadCashRuntimeConfig } from "./config";
import { verifyInternalRequest } from "./signature";

const config = loadCashRuntimeConfig();
const database = openDatabase(config.databaseFile);
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");
applyMigrations(database, migrationsDirectory);
database.execute("UPDATE cash_sync_state SET cursor_updated_at=?,updated_at=? WHERE scope='retail_sales' AND cursor_updated_at IS NULL", [config.cutoverAt, new Date().toISOString()]);
const service = new CashService(database, new SabyClient(config.saby), {
  pointId: config.saby.pointId, timezone: config.timezone, overlapMinutes: config.overlapMinutes,
  initialLookbackHours: config.initialLookbackHours, coreBaseUrl: config.coreBaseUrl, internalSecret: config.internalSecret
});
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb", verify: (req, _res, buffer) => { (req as typeof req & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));

function internal(req: express.Request, res: express.Response, next: express.NextFunction) {
  const body = (req as typeof req & { rawBody?: string }).rawBody ?? "";
  if (!verifyInternalRequest(config.internalSecret, req.header("x-dvorik-timestamp") || "", body, req.header("x-dvorik-signature") || "")) {
    res.status(401).json({ code: "INTERNAL_SIGNATURE_INVALID" });
    return;
  }
  next();
}

app.get("/live", (_req, res) => res.json({ live: true }));
app.get("/ready", (_req, res) => {
  try { database.query("SELECT scope FROM cash_sync_state LIMIT 1"); res.json({ ready: true }); }
  catch { res.status(503).json({ ready: false, code: "CASH_DATABASE_UNAVAILABLE" }); }
});
app.post("/webhook/:secret", (req, res) => {
  const actual = Buffer.from(req.params.secret || "");
  const expected = Buffer.from(config.webhookSecret);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) { res.status(401).json({ code: "BAD_SABY_WEBHOOK_SECRET" }); return; }
  res.status(202).json(service.recordWebhookSignal(req.body));
});
app.get("/internal/status", internal, (_req, res) => res.json(service.status()));
app.get("/internal/mappings", internal, (_req, res) => res.json(service.listMappings()));
app.put("/internal/mappings", internal, async (req, res) => {
  try {
    await service.validateMapping(req.body);
    res.json(service.saveMapping(req.body));
  }
  catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "MAPPING_FAILED" }); }
});

const server = app.listen(config.port, "0.0.0.0", () => console.log(`Dvorik Cash: http://0.0.0.0:${config.port}`));
let stopping = false;
let nextSyncAt = 0;
async function work() {
  while (!stopping) {
    try {
      if (config.syncEnabled && (service.hasPendingWork() || Date.now() >= nextSyncAt)) {
        await service.synchronize();
        nextSyncAt = Date.now() + 15 * 60_000;
      }
      await service.dispatchPending();
    } catch (error) {
      console.error(JSON.stringify({ event: "cash_worker_failed", code: error instanceof Error ? error.message : "UNKNOWN" }));
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
void work();
function stop() { stopping = true; server.close(() => database.close()); }
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
