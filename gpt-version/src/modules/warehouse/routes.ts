import type express from "express";
import type { CashStatus } from "../../contracts/cash";
import type { User } from "../../shared/types";
type Awaitable<T> = T | Promise<T>;
type WarehousePort = Readonly<{
  suppliers(): Awaitable<unknown>; balances(): Awaitable<unknown>; catalog?(): Awaitable<unknown>; createCatalogProduct?(input:unknown):Awaitable<unknown>; journal?(from?: string,to?: string): Awaitable<unknown>; lots(productId?: string): Awaitable<unknown>;
  recentlyDepleted?(since:string,limit?:number):Awaitable<unknown>;
  priceCategories?():Awaitable<unknown>; priceCategory?(id:string):Awaitable<unknown>;
  createPriceCategory?(input:unknown):Awaitable<unknown>; updatePriceCategory?(id:string,input:unknown):Awaitable<unknown>;
  assignProductToCategory?(id:string,input:unknown):Awaitable<unknown>; removeProductFromCategory?(id:string,productId:string,input:unknown):Awaitable<unknown>;
  addCategoryPrice?(id:string,input:unknown):Awaitable<unknown>;
  createSupplyDraft?(input:unknown):Awaitable<unknown>; supplyDraft?(id:string):Awaitable<unknown>; acceptSupplyDraft?(id:string,input:unknown):Awaitable<unknown>;
  acceptSupply(input: unknown): Awaitable<unknown>; registerOpeningLot?(input: unknown): Awaitable<unknown>;
  writeOff(input: unknown): Awaitable<unknown>; adjust(input: unknown): Awaitable<unknown>;
  profitability(productId: string, cashAvailable: boolean): Awaitable<unknown>; cutoverReadiness(): Awaitable<unknown>; status(): Awaitable<unknown>;
}>;

type Dependencies=Readonly<{
  actor(req:express.Request):User;
  requirePermission(user:User,permission:"stock:move"|"reports:read"|"products:read"|"products:write"):void;
  error(code:string,message:string,status:number):Error;
  service?:WarehousePort;
  cashStatus():Promise<CashStatus>;
  parseSupplyFile(fileName:string,content:string,mapping?:Record<string,number>):Promise<readonly unknown[]>;
  inspectSupplyFile(fileName:string,content:string):Promise<unknown>;
}>;

const route=(handler:(req:express.Request,res:express.Response)=>unknown|Promise<unknown>)=>(req:express.Request,res:express.Response,next:express.NextFunction)=>Promise.resolve(handler(req,res)).catch(next);

export function registerWarehouseRoutes(app:express.Express,deps:Dependencies){
  app.get("/api/warehouse/suppliers",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.suppliers());
  }));
  app.get("/api/warehouse/balances",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:read");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.balances());
  }));
  app.get("/api/warehouse/catalog",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:read");
    if(!deps.service?.catalog)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.catalog());
  }));
  app.post("/api/warehouse/products",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.createCatalogProduct)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.createCatalogProduct({
      officialName:String(req.body.officialName||""),localName:req.body.localName?String(req.body.localName):undefined,
      article:req.body.article?String(req.body.article):undefined,supplierId:req.body.supplierId?String(req.body.supplierId):undefined,
      inventoryKind:String(req.body.inventoryKind||"piece"),packageMassGrams:Number(req.body.packageMassGrams),actorId:user.id
    }));}catch(error){throw deps.error(error instanceof Error?error.message:"PRODUCT_CREATE_FAILED","Не удалось создать товар",422);}
  }));
  app.post("/api/warehouse/supply-previews",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    try{return res.json(await deps.inspectSupplyFile(String(req.body.fileName||""),String(req.body.content||"")));}
    catch(error){throw deps.error(error instanceof Error?error.message:"SUPPLY_FILE_INVALID","Не удалось разобрать файл поставки",422);}
  }));
  app.get("/api/warehouse/recently-depleted",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"reports:read");
    if(!deps.service?.recentlyDepleted)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    const since=typeof req.query.since==="string"?req.query.since:new Date(Date.now()-7*24*60*60_000).toISOString();
    res.json(await deps.service.recentlyDepleted(since,Number(req.query.limit||8)));
  }));
  app.get("/api/warehouse/price-categories",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:read");
    if(!deps.service?.priceCategories)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.priceCategories());
  }));
  app.get("/api/warehouse/price-categories/:id",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:read");
    if(!deps.service?.priceCategory)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.priceCategory(req.params.id));
  }));
  app.post("/api/warehouse/price-categories",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.createPriceCategory)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.status(201).json(await deps.service.createPriceCategory({name:String(req.body.name||""),inventoryKind:String(req.body.inventoryKind||""),actorId:user.id}));
  }));
  app.patch("/api/warehouse/price-categories/:id",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.updatePriceCategory)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.updatePriceCategory(req.params.id,{name:req.body.name===undefined?undefined:String(req.body.name),status:req.body.status===undefined?undefined:String(req.body.status),actorId:user.id}));
  }));
  app.post("/api/warehouse/price-categories/:id/products",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.assignProductToCategory)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.assignProductToCategory(req.params.id,{productId:String(req.body.productId||""),actorId:user.id}));
  }));
  app.delete("/api/warehouse/price-categories/:id/products/:productId",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.removeProductFromCategory)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.removeProductFromCategory(req.params.id,req.params.productId,{actorId:user.id}));
  }));
  app.post("/api/warehouse/price-categories/:id/prices",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:write");
    if(!deps.service?.addCategoryPrice)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.status(201).json(await deps.service.addCategoryPrice(req.params.id,{priceKopecks:Number(req.body.priceKopecks),effectiveFrom:String(req.body.effectiveFrom||""),actorId:user.id}));
  }));
  app.post("/api/warehouse/supply-drafts",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service?.createSupplyDraft)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    const fileName=String(req.body.fileName||"");const content=String(req.body.content||"");
    try{
      const mapping=req.body.mapping&&typeof req.body.mapping==="object"?req.body.mapping as Record<string,number>:undefined;
      const rows=await deps.parseSupplyFile(fileName,content,mapping);
      res.status(201).json(await deps.service.createSupplyDraft({supplierId:String(req.body.supplierId||""),deliveryCostKopecks:Number(req.body.deliveryCostKopecks),fileName,actorId:user.id,rows}));
    }catch(error){throw deps.error(error instanceof Error?error.message:"SUPPLY_FILE_INVALID","Не удалось разобрать файл поставки",422);}
  }));
  app.get("/api/warehouse/supply-drafts/:id",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service?.supplyDraft)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.supplyDraft(req.params.id));
  }));
  app.post("/api/warehouse/supply-drafts/:id/accept",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service?.acceptSupplyDraft)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.acceptSupplyDraft(req.params.id,{invoiceNumber:req.body.invoiceNumber?String(req.body.invoiceNumber):undefined,deliveredAt:String(req.body.deliveredAt||new Date().toISOString()),actorId:user.id,idempotencyKey:req.header("idempotency-key")||undefined,lines:Array.isArray(req.body.lines)?req.body.lines.map((line:Record<string,unknown>)=>({id:line.id?String(line.id):undefined,productId:String(line.productId||""),packageCount:Number(line.packageCount),packageMassGrams:Number(line.packageMassGrams),purchaseCostKopecks:Number(line.purchaseCostKopecks)})):[]}));}
    catch(error){throw deps.error(error instanceof Error?error.message:"SUPPLY_DRAFT_ACCEPT_FAILED","Не удалось принять поставку",422);}
  }));
  app.get("/api/warehouse/journal",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"reports:read");
    if(!deps.service?.journal)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.journal(typeof req.query.from==="string"?req.query.from:undefined,typeof req.query.to==="string"?req.query.to:undefined));
  }));
  app.post("/api/warehouse/supplies",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.acceptSupply({id:req.body.id?String(req.body.id):undefined,supplierId:String(req.body.supplierId||""),invoiceNumber:req.body.invoiceNumber?String(req.body.invoiceNumber):undefined,deliveredAt:String(req.body.deliveredAt||new Date().toISOString()),actorId:user.id,idempotencyKey:req.header("idempotency-key")||undefined,lines:Array.isArray(req.body.lines)?req.body.lines.map((line:Record<string,unknown>)=>({productId:String(line.productId||""),packageCount:Number(line.packageCount),packageMassGrams:line.packageMassGrams===undefined?undefined:Number(line.packageMassGrams),purchaseCostKopecks:Number(line.purchaseCostKopecks),allocatedDeliveryCostKopecks:line.allocatedDeliveryCostKopecks===undefined?undefined:Number(line.allocatedDeliveryCostKopecks)})):[]}));}
    catch(error){throw deps.error(error instanceof Error?error.message:"SUPPLY_FAILED","Не удалось принять поставку",422);}
  }));
  app.post("/api/warehouse/opening-lots",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service?.registerOpeningLot)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.registerOpeningLot({id:req.body.id?String(req.body.id):undefined,productId:String(req.body.productId||""),packageCount:Number(req.body.packageCount),packageMassGrams:req.body.packageMassGrams===undefined?undefined:Number(req.body.packageMassGrams),totalCostKopecks:Number(req.body.totalCostKopecks),observedAccountingQuantityMinor:Number(req.body.observedAccountingQuantityMinor),actorId:user.id,recordedAt:String(req.body.recordedAt||new Date().toISOString()),idempotencyKey:req.header("idempotency-key")||undefined}));}
    catch(error){throw deps.error(error instanceof Error?error.message:"OPENING_LOT_FAILED","Не удалось зарегистрировать начальный остаток",422);}
  }));
  app.post("/api/warehouse/write-offs",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.writeOff({productId:String(req.body.productId||""),quantityPackageMilli:Number(req.body.quantityPackageMilli),reason:String(req.body.reason||""),actorId:user.id,occurredAt:req.body.occurredAt?String(req.body.occurredAt):undefined,idempotencyKey:req.header("idempotency-key")||undefined}));}
    catch(error){throw deps.error(error instanceof Error?error.message:"WRITE_OFF_FAILED","Не удалось списать товар",422);}
  }));
  app.post("/api/warehouse/adjustments",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"stock:move");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    try{return res.status(201).json(await deps.service.adjust({productId:String(req.body.productId||""),deltaPackageMilli:Number(req.body.deltaPackageMilli),totalCostKopecks:req.body.totalCostKopecks===undefined?undefined:Number(req.body.totalCostKopecks),reason:String(req.body.reason||""),actorId:user.id,occurredAt:req.body.occurredAt?String(req.body.occurredAt):undefined,idempotencyKey:req.header("idempotency-key")||undefined}));}
    catch(error){throw deps.error(error instanceof Error?error.message:"ADJUSTMENT_FAILED","Не удалось скорректировать товар",422);}
  }));
  app.get("/api/warehouse/products/:id/profitability",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"reports:read");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    const status=await deps.cashStatus();res.json(await deps.service.profitability(req.params.id,status.availability==="connected"));
  }));
  app.get("/api/warehouse/cutover-readiness",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"reports:read");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.cutoverReadiness());
  }));
  app.get("/api/warehouse/status",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"products:read");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.status());
  }));
  app.get("/api/warehouse/lots",route(async(req,res)=>{
    const user=deps.actor(req);deps.requirePermission(user,"reports:read");
    if(!deps.service)throw deps.error("SERVICE_UNAVAILABLE","Складской сервис недоступен",503);
    res.json(await deps.service.lots(typeof req.query.productId==="string"?req.query.productId:undefined));
  }));
}
