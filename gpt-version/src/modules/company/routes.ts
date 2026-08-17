import type express from "express";
import type { User } from "../../shared/types";
import type { CompanyQueryService } from "./company-query-service";

type Dependencies=Readonly<{
  actor(req:express.Request):User;
  requireReports(user:User):void;
  error(code:string,message:string,status:number):Error;
  queries?:CompanyQueryService;
}>;
const route=(handler:(req:express.Request,res:express.Response)=>unknown|Promise<unknown>)=>(req:express.Request,res:express.Response,next:express.NextFunction)=>Promise.resolve(handler(req,res)).catch(next);
export function registerCompanyRoutes(app:express.Express,deps:Dependencies){
  app.get("/api/company/products/:id/profitability",route((req,res)=>{
    const user=deps.actor(req);deps.requireReports(user);
    const profitability=deps.queries?.productProfitability(req.params.id);
    if(!profitability)throw deps.error("COMPANY_PROJECTION_NOT_READY","Данные компании ещё не построены",503);
    res.json(profitability);
  }));
  app.get("/api/company/overview",route((req,res)=>{
    const user=deps.actor(req);deps.requireReports(user);
    if(!deps.queries)throw deps.error("SERVICE_UNAVAILABLE","Company service unavailable",503);
    res.json(deps.queries.overview());
  }));
  app.get("/api/company/status",route((req,res)=>{
    const user=deps.actor(req);deps.requireReports(user);
    if(!deps.queries)throw deps.error("SERVICE_UNAVAILABLE","Company service unavailable",503);
    res.json(deps.queries.status());
  }));
}
