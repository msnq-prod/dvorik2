import express from "express";
import { openDatabase } from "../server/database";
import { signInternalRequest, verifyInternalRequest } from "../cash/signature";
import { WarehouseService } from "../modules/warehouse";
import { loadWarehouseRuntimeConfig } from "./config";

const config = loadWarehouseRuntimeConfig();
const database = openDatabase(config.databaseFile, { fileMustExist: true });
const service = new WarehouseService(database);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", verify: (req, _res, body) => { (req as typeof req & { rawBody?: string }).rawBody = body.toString("utf8"); } }));

function internal(req: express.Request, res: express.Response, next: express.NextFunction) {
  const body = (req as typeof req & { rawBody?: string }).rawBody ?? "";
  if (!verifyInternalRequest(config.internalSecret, req.header("x-dvorik-timestamp") || "", body, req.header("x-dvorik-signature") || "")) {
    res.status(401).json({ code: "INTERNAL_SIGNATURE_INVALID" });
    return;
  }
  next();
}

function requestError(res: express.Response, error: unknown) {
  res.status(422).json({ code: error instanceof Error ? error.message : "WAREHOUSE_REQUEST_FAILED" });
}

app.get("/live", (_req, res) => res.json({ live: true }));
app.get("/ready", (_req, res) => {
  try {
    const readiness = service.cutoverReadiness();
    if (!readiness.ready) {
      res.status(503).json(readiness);
      return;
    }
    res.json(readiness);
  }
  catch { res.status(503).json({ ready: false, code: "WAREHOUSE_DATABASE_UNAVAILABLE" }); }
});
app.get("/internal/status", internal, (_req, res) => res.json(service.status()));
app.get("/internal/balances", internal, (_req, res) => res.json(service.balances()));
app.get("/internal/catalog", internal, (_req, res) => res.json(service.catalog()));
app.post("/internal/catalog/products", internal, (req, res) => { try { res.status(201).json(service.createCatalogProduct(req.body)); } catch (error) { requestError(res, error); } });
app.get("/internal/recently-depleted", internal, (req, res) => res.json(service.recentlyDepleted(String(req.query.since || ""), Number(req.query.limit || 8))));
app.get("/internal/price-categories", internal, (_req, res) => res.json(service.priceCategories()));
app.get("/internal/price-categories/:id", internal, (req, res) => { try { res.json(service.priceCategory(req.params.id)); } catch (error) { requestError(res, error); } });
app.post("/internal/price-categories", internal, (req, res) => { try { res.status(201).json(service.createPriceCategory(req.body)); } catch (error) { requestError(res, error); } });
app.patch("/internal/price-categories/:id", internal, (req, res) => { try { res.json(service.updatePriceCategory(req.params.id, req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/price-categories/:id/products", internal, (req, res) => { try { res.json(service.assignProductToCategory(req.params.id, req.body)); } catch (error) { requestError(res, error); } });
app.delete("/internal/price-categories/:id/products/:productId", internal, (req, res) => { try { res.json(service.removeProductFromCategory(req.params.id, req.params.productId, req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/price-categories/:id/prices", internal, (req, res) => { try { res.status(201).json(service.addCategoryPrice(req.params.id, req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/supply-drafts", internal, (req, res) => { try { res.status(201).json(service.createSupplyDraft(req.body)); } catch (error) { requestError(res, error); } });
app.get("/internal/supply-drafts/:id", internal, (req, res) => { try { res.json(service.supplyDraft(req.params.id)); } catch (error) { requestError(res, error); } });
app.post("/internal/supply-drafts/:id/accept", internal, (req, res) => { try { res.status(201).json(service.acceptSupplyDraft(req.params.id, req.body)); } catch (error) { requestError(res, error); } });
app.get("/internal/journal", internal, (req, res) => res.json(service.journal(typeof req.query.from === "string" ? req.query.from : undefined, typeof req.query.to === "string" ? req.query.to : undefined)));
app.get("/internal/lots", internal, (req, res) => res.json(service.lots(typeof req.query.productId === "string" ? req.query.productId : undefined)));
app.get("/internal/suppliers", internal, (_req, res) => res.json(service.suppliers()));
app.get("/internal/cutover-readiness", internal, (_req, res) => res.json(service.cutoverReadiness()));
app.get("/internal/products/:id/profitability", internal, (req, res) => res.json(service.profitability(req.params.id, Boolean(req.query.cashConnected === "true"))));
app.post("/internal/cash-events", internal, (req, res) => { try { res.json(service.applyCashEvent(req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/supplies", internal, (req, res) => { try { res.status(201).json(service.acceptSupply(req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/opening-lots", internal, (req, res) => { try { res.status(201).json(service.registerOpeningLot(req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/write-offs", internal, (req, res) => { try { res.status(201).json(service.writeOff(req.body)); } catch (error) { requestError(res, error); } });
app.post("/internal/adjustments", internal, (req, res) => { try { res.status(201).json(service.adjust(req.body)); } catch (error) { requestError(res, error); } });

const server = app.listen(config.port, "0.0.0.0", () => console.log(`Dvorik Warehouse: http://0.0.0.0:${config.port}`));
let stopping = false;
async function dispatchPending() {
  const rows = database.query<{ event_id: string; producer: string; event_type: string; event_version: number; aggregate_id: string; payload_json: string; created_at: string }>("SELECT event_id,producer,event_type,event_version,aggregate_id,payload_json,created_at FROM domain_outbox WHERE producer='warehouse' AND status IN ('pending','failed') AND available_at<=? ORDER BY created_at,event_id LIMIT 100", [new Date().toISOString()]);
  for (const row of rows) {
    try {
      const body = JSON.stringify({ eventId: row.event_id, producer: row.producer, eventType: row.event_type, eventVersion: row.event_version, aggregateId: row.aggregate_id, occurredAt: row.created_at, payload: JSON.parse(row.payload_json) });
      const timestamp = new Date().toISOString();
      const response = await fetch(`${config.coreBaseUrl}/internal/v1/events/warehouse`, { method: "POST", headers: { "content-type": "application/json", "x-dvorik-timestamp": timestamp, "x-dvorik-signature": signInternalRequest(config.internalSecret, timestamp, body) }, body, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`CORE_HTTP_${response.status}`);
      database.execute("UPDATE domain_outbox SET status='sent',sent_at=?,last_error_code=NULL WHERE event_id=?", [new Date().toISOString(), row.event_id]);
    } catch (error) {
      database.execute("UPDATE domain_outbox SET status='failed',attempt_count=attempt_count+1,available_at=?,last_error_code=? WHERE event_id=?", [new Date(Date.now() + 5_000).toISOString(), error instanceof Error ? error.message : "COMPANY_DELIVERY_FAILED", row.event_id]);
    }
  }
}
async function work() {
  while (!stopping) {
    try { await dispatchPending(); }
    catch (error) { console.error(JSON.stringify({ event: "warehouse_worker_failed", code: error instanceof Error ? error.message : "UNKNOWN" })); }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
void work().catch((error) => console.error(JSON.stringify({ event: "warehouse_worker_crashed", code: error instanceof Error ? error.message : "UNKNOWN" })));
function stop() { stopping = true; server.close(() => database.close()); }
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
