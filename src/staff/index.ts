import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDatabaseReadiness, openDatabase } from "../server/database";
import { applyMigrations, listMigrations } from "../server/migrations";
import { verifyInternalRequest } from "../cash/signature";
import { loadStaffRuntimeConfig } from "./config";
import { StaffService } from "./staff-service";

const config = loadStaffRuntimeConfig();
const database = openDatabase(config.databaseFile);
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");
applyMigrations(database, migrationsDirectory);
const service = new StaffService(database, () => new Date().toISOString(), { coreBaseUrl: config.coreBaseUrl, internalSecret: config.internalSecret });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", verify: (req, _res, body) => { (req as typeof req & { rawBody?: string }).rawBody = body.toString("utf8"); } }));
function internal(req: express.Request, res: express.Response, next: express.NextFunction) {
  const body = (req as typeof req & { rawBody?: string }).rawBody ?? "";
  if (!verifyInternalRequest(config.internalSecret, req.header("x-dvorik-timestamp") || "", body, req.header("x-dvorik-signature") || "")) { res.status(401).json({ code: "INTERNAL_SIGNATURE_INVALID" }); return; }
  next();
}
app.get("/live", (_req, res) => res.json({ live: true }));
app.get("/ready", (_req, res) => {
  const schema = checkDatabaseReadiness(database, listMigrations(migrationsDirectory).map((migration) => migration.version), ["staff_identity_snapshots", "staff_employee_profiles", "staff_event_outbox"]);
  const status = schema.ready ? service.status() : undefined;
  if (!schema.ready || (status?.failedEvents ?? 0) > 0) {
    res.status(503).json({ ready: false, code: schema.ready ? "STAFF_OUTBOX_FAILED" : schema.code, ...(status ? { outbox: status } : {}) });
    return;
  }
  res.json({ ready: true, outbox: status });
});
app.post("/internal/identities", internal, (req, res) => { try { service.upsertIdentity(req.body); res.status(204).end(); } catch (error) { res.status(422).json({ code: error instanceof Error ? error.message : "IDENTITY_FAILED" }); } });
app.post("/internal/identity-events", internal, (req, res) => { try { res.json(service.applyIdentityEvent(req.body)); } catch (error) { res.status(422).json({ code: error instanceof Error ? error.message : "IDENTITY_EVENT_FAILED" }); } });
app.get("/internal/profiles", internal, (_req, res) => res.json(service.profiles()));
app.get("/internal/status", internal, (_req,res)=>res.json(service.status()));
app.put("/internal/profiles/:id", internal, (req, res) => { try { res.json(service.saveProfile({ ...req.body, userId: req.params.id })); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "PROFILE_FAILED" }); } });
app.get("/internal/hr-events", internal, (req, res) => res.json(service.hrEvents({ ...(typeof req.query.userId === "string" ? { userId: req.query.userId } : {}), ...(typeof req.query.from === "string" ? { from: req.query.from } : {}), ...(typeof req.query.to === "string" ? { to: req.query.to } : {}) })));
app.post("/internal/hr-events", internal, (req, res) => { try { res.status(201).json(service.recordHrEvent(req.body)); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "HR_EVENT_FAILED" }); } });
app.get("/internal/schedule", internal, (req, res) => res.json(service.schedule({ ...(typeof req.query.userId === "string" ? { userId: req.query.userId } : {}), ...(typeof req.query.from === "string" ? { from: req.query.from } : {}), ...(typeof req.query.to === "string" ? { to: req.query.to } : {}) })));
app.get("/internal/schedule/days", internal, (req, res) => res.json(service.scheduleDays({ ...(typeof req.query.from === "string" ? { from: req.query.from } : {}), ...(typeof req.query.to === "string" ? { to: req.query.to } : {}) })));
app.put("/internal/schedule/days", internal, (req, res) => { try { res.json(service.saveScheduleDay(req.body)); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "SCHEDULE_DAY_FAILED" }); } });
app.post("/internal/schedule/shifts", internal, (req, res) => { try { res.status(201).json(service.saveShift(req.body)); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "SHIFT_FAILED" }); } });
app.put("/internal/schedule/shifts/:id", internal, (req, res) => { try { res.json(service.saveShift({ ...req.body, id: req.params.id })); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "SHIFT_FAILED" }); } });
app.get("/internal/schedule/exchanges", internal, (req, res) => res.json(service.exchanges(typeof req.query.userId === "string" ? req.query.userId : undefined)));
app.post("/internal/schedule/exchanges", internal, (req, res) => { try { res.status(201).json(service.createExchange(req.body)); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "EXCHANGE_FAILED" }); } });
app.post("/internal/schedule/exchanges/:id/:action", internal, (req, res) => { try { const action=req.params.action; if(action!=="accept"&&action!=="decline"&&action!=="cancel") throw new Error("BAD_ACTION"); res.json(service.resolveExchange({ ...req.body,id:req.params.id,action })); } catch (error) { res.status(409).json({ code: error instanceof Error ? error.message : "EXCHANGE_FAILED" }); } });
app.post("/internal/schedule/rotation/preview",internal,(req,res)=>{try{res.json(service.previewRotation(req.body));}catch(error){res.status(409).json({code:error instanceof Error?error.message:"ROTATION_FAILED"});}});
app.post("/internal/schedule/rotation/commit",internal,(req,res)=>{try{res.status(201).json(service.commitRotation(req.body));}catch(error){res.status(409).json({code:error instanceof Error?error.message:"ROTATION_FAILED"});}});
app.post("/internal/schedule/future-replacement/preview",internal,(req,res)=>{try{res.json(service.previewFutureReplacement(req.body));}catch(error){res.status(409).json({code:error instanceof Error?error.message:"REPLACEMENT_FAILED"});}});
app.post("/internal/schedule/future-replacement/commit",internal,(req,res)=>{try{res.json(service.commitFutureReplacement(req.body));}catch(error){res.status(409).json({code:error instanceof Error?error.message:"REPLACEMENT_FAILED"});}});
const server = app.listen(config.port, "0.0.0.0", () => console.log(`Dvorik Staff: http://0.0.0.0:${config.port}`));
let stopping=false;
async function work(){while(!stopping){try{await service.dispatchPending();}catch(error){console.error(JSON.stringify({event:"staff_worker_failed",code:error instanceof Error?error.message:"UNKNOWN"}));}await new Promise((resolve)=>setTimeout(resolve,5000));}}
void work();
function stop() { stopping=true; server.close(() => database.close()); }
process.once("SIGTERM", stop); process.once("SIGINT", stop);
