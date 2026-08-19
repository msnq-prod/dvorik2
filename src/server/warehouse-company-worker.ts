import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";
import { CompanyOutboxBridge, CompanyProjectionService } from "../modules/company";

const databaseFile=process.env.DVORIK_SQLITE_FILE?.trim();
if(!databaseFile||!path.isAbsolute(databaseFile)) throw new Error("DVORIK_SQLITE_FILE must be absolute");
const database=openDatabase(databaseFile,{fileMustExist:true});
applyMigrations(database,path.resolve(path.dirname(fileURLToPath(import.meta.url)),"migrations"));
const company=new CompanyProjectionService(database);
const bridge=new CompanyOutboxBridge(database,company);
let stopping=false;
async function work(){
  do {
    try { bridge.dispatchPending(100); company.recordWorkerHeartbeat(); }
    catch(error) { console.error(JSON.stringify({event:"warehouse_company_worker_failed",code:error instanceof Error?error.message:"UNKNOWN"})); }
    if(process.env.DVORIK_COMPANY_WORKER_ONCE==="1") break;
    await new Promise((resolve)=>setTimeout(resolve,5000));
  } while(!stopping);
  database.close();
}
void work().catch((error)=>console.error(JSON.stringify({event:"warehouse_company_worker_crashed",code:error instanceof Error?error.message:"UNKNOWN"})));
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{stopping=true;});
