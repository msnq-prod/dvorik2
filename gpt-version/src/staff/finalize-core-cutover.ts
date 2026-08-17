import path from "node:path";
import { openDatabase } from "../server/database";

const coreFile=process.env.DVORIK_SQLITE_FILE?.trim();
const staffFile=process.env.DVORIK_STAFF_SQLITE_FILE?.trim();
if(process.env.DVORIK_STAFF_FINALIZE!=="1") throw new Error("Set DVORIK_STAFF_FINALIZE=1 after an audited cutover");
if(!coreFile||!staffFile||!path.isAbsolute(coreFile)||!path.isAbsolute(staffFile)) throw new Error("DVORIK_SQLITE_FILE and DVORIK_STAFF_SQLITE_FILE must be absolute");
const core=openDatabase(coreFile,{fileMustExist:true});const staff=openDatabase(staffFile,{fileMustExist:true});
try{
  const pairs:[string,string][]=[["employee_profiles","staff_employee_profiles"],["hr_events","staff_hr_events"],["schedule_days","staff_schedule_days"],["shifts","staff_shifts"],["shift_assignments","staff_shift_assignments"],["shift_exchange_requests","staff_shift_exchanges"]];
  for(const [coreTable,staffTable] of pairs){const coreCount=core.query<{count:number}>(`SELECT count(*) count FROM ${coreTable}`)[0]?.count??0;const staffCount=staff.query<{count:number}>(`SELECT count(*) count FROM ${staffTable}`)[0]?.count??0;if(coreCount!==staffCount)throw new Error(`STAFF_CUTOVER_COUNT_MISMATCH:${coreTable}`);}
  const archiveSuffix=new Date().toISOString().slice(0,10).replaceAll("-","");
  core.transaction((db)=>{for(const table of ["shift_assignments","shift_exchange_requests","shift_swap_requests","shifts","schedule_days","employee_profiles","hr_events","rotation_templates"]){const exists=db.query<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table])[0];if(exists)db.execute(`ALTER TABLE ${table} RENAME TO ${table}_archive_${archiveSuffix}`);}}, {mode:"immediate"});
  process.stdout.write(`${JSON.stringify({event:"staff_core_cutover_finalized",archiveSuffix})}\n`);
}finally{staff.close();core.close();}
