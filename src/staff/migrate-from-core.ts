import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/database";
import { applyMigrations } from "../server/migrations";

const coreFile=process.env.DVORIK_SQLITE_FILE?.trim();
const staffFile=process.env.DVORIK_STAFF_SQLITE_FILE?.trim();
if(!coreFile||!staffFile||!path.isAbsolute(coreFile)||!path.isAbsolute(staffFile)) throw new Error("DVORIK_SQLITE_FILE and DVORIK_STAFF_SQLITE_FILE must be absolute");
if(path.resolve(coreFile)===path.resolve(staffFile)) throw new Error("Core and Staff databases must be different");
if(!fs.existsSync(coreFile)) throw new Error("Core database does not exist");

const core=openDatabase(coreFile,{fileMustExist:true});
const staff=openDatabase(staffFile);
try{
  applyMigrations(staff,path.resolve(path.dirname(fileURLToPath(import.meta.url)),"migrations"));
  const occupied=["staff_employee_profiles","staff_hr_events","staff_shifts","staff_shift_exchanges"].some((table)=>staff.query<{count:number}>(`SELECT count(*) count FROM ${table}`)[0].count>0);
  if(occupied) throw new Error("STAFF_TARGET_NOT_EMPTY");
  const now=new Date().toISOString();
  staff.transaction((db)=>{
    for(const row of core.query<{platform_user_id:string;status:string;updated_at:string}>("SELECT platform_user_id,status,updated_at FROM staff_user_snapshots")) db.execute("INSERT INTO staff_identity_snapshots(platform_user_id,status,updated_at) VALUES (?,?,?)",[row.platform_user_id,row.status,row.updated_at]);
    for(const row of core.query<Record<string,string|number|null>>("SELECT * FROM employee_profiles")) db.execute("INSERT INTO staff_employee_profiles(platform_user_id,personnel_number,position,hired_on,dismissed_on,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",[String(row.user_id),row.personnel_number as string|null,String(row.position),String(row.hired_on),row.dismissed_on as string|null,String(row.status),Number(row.version),String(row.created_at),String(row.updated_at)]);
    for(const row of core.query<Record<string,string|number|null>>("SELECT * FROM hr_events")) db.execute("INSERT INTO staff_hr_events(id,platform_user_id,type,start_date,end_date,shift_id,minutes_late,comment,created_by_platform_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",[String(row.id),String(row.user_id),String(row.type),String(row.start_date),String(row.end_date),row.shift_id as string|null,row.minutes_late as number|null,String(row.comment),String(row.created_by_user_id),String(row.created_at)]);
    for(const row of core.query<Record<string,string|number|null>>("SELECT * FROM schedule_days")) db.execute("INSERT INTO staff_schedule_days(id,local_date,location_id,status,comment,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",[String(row.id),String(row.local_date),String(row.location_id),String(row.status),String(row.comment),Number(row.version),String(row.created_at),String(row.updated_at)]);
    for(const row of core.query<Record<string,string|number|null>>("SELECT * FROM shifts")) db.execute("INSERT INTO staff_shifts(id,local_date,start_time,end_time,location_id,status,comment,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",[String(row.id),String(row.local_date),String(row.start_time||"10:00"),String(row.end_time||"21:00"),String(row.location_id),String(row.status),String(row.comment),Number(row.version),String(row.created_at),String(row.updated_at)]);
    for(const row of core.query<{shift_id:string;user_id:string}>("SELECT shift_id,user_id FROM shift_assignments")) db.execute("INSERT INTO staff_shift_assignments(shift_id,platform_user_id) VALUES (?,?)",[row.shift_id,row.user_id]);
    for(const row of core.query<Record<string,string|number|null>>("SELECT * FROM shift_exchange_requests")){
      const warning=JSON.parse(String(row.warning_json||"[]")) as {value?:{conflicts?:unknown[]}}|unknown[];
      db.execute("INSERT INTO staff_shift_exchanges(id,from_shift_id,to_shift_id,from_platform_user_id,to_platform_user_id,status,warnings_json,created_at,resolved_at,resolved_by_platform_user_id,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)",[String(row.id),String(row.from_shift_id),String(row.to_shift_id),String(row.from_user_id),String(row.to_user_id),String(row.status),JSON.stringify(Array.isArray(warning)?warning:warning.value?.conflicts??[]),String(row.created_at),row.resolved_at as string|null,row.resolved_by_user_id as string|null,Number(row.version)]);
    }
    const payload={activeEmployees:db.query<{count:number}>("SELECT count(*) count FROM staff_employee_profiles WHERE status='active'")[0].count,scheduledShifts:db.query<{count:number}>("SELECT count(*) count FROM staff_shifts WHERE status IN ('draft','scheduled','in_progress')")[0].count,pendingExchanges:db.query<{count:number}>("SELECT count(*) count FROM staff_shift_exchanges WHERE status='pending'")[0].count,sourceUpdatedAt:now};
    db.execute("INSERT INTO staff_event_outbox(event_id,event_type,aggregate_id,payload_json,status,available_at,created_at) VALUES (?,'StaffSnapshotUpdated','staff',?,'pending',?,?)",[`staff-migration-${Date.now()}`,JSON.stringify(payload),now,now]);
  },{mode:"immediate"});
  const counts=Object.fromEntries([["identities","staff_identity_snapshots"],["profiles","staff_employee_profiles"],["hrEvents","staff_hr_events"],["days","staff_schedule_days"],["shifts","staff_shifts"],["assignments","staff_shift_assignments"],["exchanges","staff_shift_exchanges"]].map(([key,table])=>[key,staff.query<{count:number}>(`SELECT count(*) count FROM ${table}`)[0].count]));
  if(staff.query("PRAGMA foreign_key_check").length) throw new Error("STAFF_FOREIGN_KEY_CHECK_FAILED");
  process.stdout.write(`${JSON.stringify({event:"staff_migration_succeeded",counts})}\n`);
}finally{staff.close();core.close();}
