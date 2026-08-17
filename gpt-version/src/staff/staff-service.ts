import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { EmployeeProfile, HrEvent, HrEventType, ScheduleDay, Shift, ShiftExchangeRequest, UserStatus } from "../shared/types";
import type { DatabaseAdapter, DatabaseContext } from "../server/database";
import type { StaffEvent } from "../contracts/events";
import { signInternalRequest } from "../cash/signature";

function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function dates(from:string,to:string){if(!validDate(from)||!validDate(to)||from>to)throw new Error("BAD_DATE_RANGE");const result:string[]=[];for(let d=new Date(`${from}T00:00:00.000Z`);d<=new Date(`${to}T00:00:00.000Z`);d=new Date(d.getTime()+86400000))result.push(d.toISOString().slice(0,10));return result;}

export class StaffService {
  constructor(private readonly database: DatabaseAdapter, private readonly now: () => string = () => new Date().toISOString(), private readonly delivery?: Readonly<{ coreBaseUrl: string; internalSecret: string; fetcher?: typeof fetch }>) {}

  upsertIdentity(input: Readonly<{ userId: string; status: UserStatus }>) {
    if (!input.userId) throw new Error("USER_ID_REQUIRED");
    this.database.execute(`INSERT INTO staff_identity_snapshots(platform_user_id,status,updated_at) VALUES (?,?,?)
      ON CONFLICT(platform_user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`, [input.userId, input.status, this.now()]);
  }

  status(){
    const pending=this.database.query<{count:number;oldest:string|null}>("SELECT count(*) count,min(created_at) oldest FROM staff_event_outbox WHERE status IN ('pending','failed')")[0];
    const failed=this.database.query<{count:number}>("SELECT count(*) count FROM staff_event_outbox WHERE status='failed'")[0]?.count??0;
    return {availability:failed?"degraded" as const:"connected" as const,pendingEvents:pending?.count??0,failedEvents:failed,oldestPendingAt:pending?.oldest??undefined};
  }

  profiles(): EmployeeProfile[] {
    return this.database.query<{ platform_user_id: string; personnel_number: string | null; position: string; hired_on: string; dismissed_on: string | null; status: EmployeeProfile["status"]; version: number }>(
      "SELECT platform_user_id,personnel_number,position,hired_on,dismissed_on,status,version FROM staff_employee_profiles ORDER BY status,position COLLATE NOCASE,platform_user_id"
    ).map((row) => ({ userId: row.platform_user_id, personnelNumber: row.personnel_number ?? undefined, position: row.position, hiredOn: row.hired_on, dismissedOn: row.dismissed_on ?? undefined, status: row.status, version: row.version }));
  }

  saveProfile(input: Readonly<{ userId: string; personnelNumber?: string; position: string; hiredOn: string; dismissedOn?: string; status: EmployeeProfile["status"]; expectedVersion?: number; idempotencyKey: string }>) {
    return this.idempotent("profile", input.idempotencyKey, input, (db) => {
      const identity = db.query<{ status: UserStatus }>("SELECT status FROM staff_identity_snapshots WHERE platform_user_id=?", [input.userId])[0];
      if (!identity) throw new Error("USER_NOT_FOUND");
      if (!input.position.trim() || !validDate(input.hiredOn) || (input.dismissedOn && !validDate(input.dismissedOn)) || (input.status === "active" ? Boolean(input.dismissedOn) : !input.dismissedOn)) throw new Error("BAD_PROFILE");
      const current = db.query<{ version: number }>("SELECT version FROM staff_employee_profiles WHERE platform_user_id=?", [input.userId])[0];
      if (current && input.expectedVersion !== current.version) throw new Error("STALE_PROFILE");
      const at = this.now();
      if (current) db.execute("UPDATE staff_employee_profiles SET personnel_number=?,position=?,hired_on=?,dismissed_on=?,status=?,version=version+1,updated_at=? WHERE platform_user_id=? AND version=?", [input.personnelNumber?.trim() || null, input.position.trim(), input.hiredOn, input.dismissedOn ?? null, input.status, at, input.userId, current.version]);
      else db.execute("INSERT INTO staff_employee_profiles(platform_user_id,personnel_number,position,hired_on,dismissed_on,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)", [input.userId, input.personnelNumber?.trim() || null, input.position.trim(), input.hiredOn, input.dismissedOn ?? null, input.status, at, at]);
      this.writeSnapshot(db);
      const row = db.query<{ version: number }>("SELECT version FROM staff_employee_profiles WHERE platform_user_id=?", [input.userId])[0];
      return { userId: input.userId, personnelNumber: input.personnelNumber?.trim() || undefined, position: input.position.trim(), hiredOn: input.hiredOn, dismissedOn: input.dismissedOn, status: input.status, version: row.version } satisfies EmployeeProfile;
    });
  }

  hrEvents(input: Readonly<{ userId?: string; from?: string; to?: string }> = {}): HrEvent[] {
    const clauses: string[] = []; const values: string[] = [];
    if (input.userId) { clauses.push("platform_user_id=?"); values.push(input.userId); }
    if (input.from) { clauses.push("end_date>=?"); values.push(input.from); }
    if (input.to) { clauses.push("start_date<=?"); values.push(input.to); }
    return this.database.query<{ id: string; platform_user_id: string; type: HrEventType; start_date: string; end_date: string; shift_id: string | null; minutes_late: number | null; comment: string; created_by_platform_user_id: string; created_at: string }>(`SELECT * FROM staff_hr_events ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY start_date DESC,created_at DESC,id DESC`, values).map((row) => ({ id: row.id, userId: row.platform_user_id, type: row.type, startDate: row.start_date, endDate: row.end_date, shiftId: row.shift_id ?? undefined, minutesLate: row.minutes_late ?? undefined, comment: row.comment, createdByUserId: row.created_by_platform_user_id, createdAt: row.created_at }));
  }

  recordHrEvent(input: Readonly<{ userId: string; type: HrEventType; startDate: string; endDate?: string; shiftId?: string; minutesLate?: number; comment?: string; actorId: string; idempotencyKey: string }>) {
    return this.idempotent("hr", input.idempotencyKey, input, (db) => {
      const endDate = input.endDate || input.startDate;
      const identity = db.query<{ status: UserStatus }>("SELECT status FROM staff_identity_snapshots WHERE platform_user_id=?", [input.userId])[0];
      if (!identity) throw new Error("USER_NOT_FOUND");
      if (!validDate(input.startDate) || !validDate(endDate) || input.startDate > endDate || !["vacation","sick_leave","late","no_show","partial_shift"].includes(input.type) || ((input.type === "late") !== (Number.isSafeInteger(input.minutesLate) && Number(input.minutesLate) > 0))) throw new Error("BAD_HR_EVENT");
      const at = this.now(); const event: HrEvent = { id: nanoid(), userId: input.userId, type: input.type, startDate: input.startDate, endDate, shiftId: input.shiftId, minutesLate: input.type === "late" ? input.minutesLate : undefined, comment: input.comment?.trim() || "", createdByUserId: input.actorId, createdAt: at };
      db.execute("INSERT INTO staff_hr_events(id,platform_user_id,type,start_date,end_date,shift_id,minutes_late,comment,created_by_platform_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [event.id,event.userId,event.type,event.startDate,event.endDate,event.shiftId ?? null,event.minutesLate ?? null,event.comment,event.createdByUserId,event.createdAt]);
      this.writeSnapshot(db);
      return event;
    });
  }

  schedule(input: Readonly<{ userId?: string; from?: string; to?: string }> = {}): Shift[] {
    const clauses: string[] = []; const values: string[] = [];
    if (input.from) { clauses.push("s.local_date>=?"); values.push(input.from); }
    if (input.to) { clauses.push("s.local_date<=?"); values.push(input.to); }
    if (input.userId) { clauses.push("EXISTS (SELECT 1 FROM staff_shift_assignments a WHERE a.shift_id=s.id AND a.platform_user_id=?)"); values.push(input.userId); }
    return this.database.query<{ id: string; version: number; local_date: string; start_time: string; end_time: string; location_id: string; status: Shift["status"]; comment: string }>(
      `SELECT s.id,s.version,s.local_date,s.start_time,s.end_time,s.location_id,s.status,s.comment FROM staff_shifts s ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY s.local_date,s.start_time,s.id`, values
    ).map((row) => ({ id: row.id, version: row.version, date: row.local_date, start: row.start_time, end: row.end_time, locationId: row.location_id, employeeIds: this.database.query<{ platform_user_id: string }>("SELECT platform_user_id FROM staff_shift_assignments WHERE shift_id=? ORDER BY platform_user_id", [row.id]).map((item) => item.platform_user_id), status: row.status, comment: row.comment }));
  }

  scheduleDays(input: Readonly<{ from?: string; to?: string }> = {}): ScheduleDay[] {
    const clauses: string[] = []; const values: string[] = [];
    if (input.from) { clauses.push("local_date>=?"); values.push(input.from); }
    if (input.to) { clauses.push("local_date<=?"); values.push(input.to); }
    return this.database.query<{ id: string; local_date: string; location_id: string; status: ScheduleDay["status"]; comment: string; version: number }>(
      `SELECT id,local_date,location_id,status,comment,version FROM staff_schedule_days ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY local_date,location_id`, values
    ).map((row) => ({ id: row.id, date: row.local_date, locationId: row.location_id, status: row.status, comment: row.comment, version: row.version }));
  }

  saveScheduleDay(input: Readonly<{ date: string; locationId: string; status: ScheduleDay["status"]; comment?: string; expectedVersion?: number | null; idempotencyKey: string }>) {
    return this.idempotent("schedule-day", input.idempotencyKey, input, (db) => {
      if (!validDate(input.date) || !input.locationId || !["working","closed"].includes(input.status)) throw new Error("BAD_SCHEDULE_DAY");
      const current = db.query<{ id: string; version: number }>("SELECT id,version FROM staff_schedule_days WHERE local_date=? AND location_id=?", [input.date,input.locationId])[0];
      if (current && input.expectedVersion !== current.version) throw new Error("STALE_DAY");
      if (!current && input.expectedVersion !== null && input.expectedVersion !== undefined) throw new Error("DAY_NOT_FOUND");
      const at=this.now(); const id=current?.id ?? nanoid(); const version=current ? current.version+1 : 0;
      if (current) db.execute("UPDATE staff_schedule_days SET status=?,comment=?,version=?,updated_at=? WHERE id=? AND version=?", [input.status,input.comment?.trim()||"",version,at,id,current.version]);
      else db.execute("INSERT INTO staff_schedule_days(id,local_date,location_id,status,comment,version,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)", [id,input.date,input.locationId,input.status,input.comment?.trim()||"",at,at]);
      this.writeSnapshot(db);
      return { id,date:input.date,locationId:input.locationId,status:input.status,comment:input.comment?.trim()||"",version } satisfies ScheduleDay;
    });
  }

  saveShift(input: Readonly<{ id?: string; date: string; start: string; end: string; locationId: string; employeeIds: string[]; status: Shift["status"]; comment?: string; expectedVersion?: number | null; idempotencyKey: string }>) {
    return this.idempotent("shift", input.idempotencyKey, input, (db) => {
      if (!validDate(input.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.end) || input.start>=input.end || !input.locationId || !input.employeeIds.length || input.employeeIds.length>3 || new Set(input.employeeIds).size!==input.employeeIds.length || !["draft","scheduled","in_progress","completed","cancelled"].includes(input.status)) throw new Error("BAD_SHIFT");
      for (const userId of input.employeeIds) if (db.query<{ status: UserStatus }>("SELECT status FROM staff_identity_snapshots WHERE platform_user_id=? AND status='active'", [userId]).length===0) throw new Error("EMPLOYEE_NOT_ACTIVE");
      const current=input.id ? db.query<{ version:number }>("SELECT version FROM staff_shifts WHERE id=?", [input.id])[0] : undefined;
      if (current && input.expectedVersion!==current.version) throw new Error("STALE_SHIFT");
      if (input.id && !current) throw new Error("SHIFT_NOT_FOUND");
      const overlap=db.query("SELECT s.id FROM staff_shifts s JOIN staff_shift_assignments a ON a.shift_id=s.id WHERE s.local_date=? AND s.status NOT IN ('cancelled','completed') AND a.platform_user_id IN ("+input.employeeIds.map(()=>"?").join(",")+") AND s.start_time<? AND s.end_time>? "+(input.id?"AND s.id<>?":"")+" LIMIT 1", [input.date,...input.employeeIds,input.end,input.start,...(input.id?[input.id]:[])]);
      if (overlap.length) throw new Error("SHIFT_CONFLICT");
      const at=this.now(); const id=input.id??nanoid();
      if (current) db.execute("UPDATE staff_shifts SET local_date=?,start_time=?,end_time=?,location_id=?,status=?,comment=?,version=version+1,updated_at=? WHERE id=? AND version=?", [input.date,input.start,input.end,input.locationId,input.status,input.comment?.trim()||"",at,id,current.version]);
      else db.execute("INSERT INTO staff_shifts(id,local_date,start_time,end_time,location_id,status,comment,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)", [id,input.date,input.start,input.end,input.locationId,input.status,input.comment?.trim()||"",at,at]);
      db.execute("DELETE FROM staff_shift_assignments WHERE shift_id=?", [id]);
      for (const userId of input.employeeIds) db.execute("INSERT INTO staff_shift_assignments(shift_id,platform_user_id) VALUES (?,?)", [id,userId]);
      this.writeSnapshot(db);
      return { id,version:current ? current.version+1 : 0,date:input.date,start:input.start,end:input.end,locationId:input.locationId,employeeIds:input.employeeIds,status:input.status,comment:input.comment?.trim()||"" } satisfies Shift;
    });
  }

  exchanges(userId?: string): ShiftExchangeRequest[] {
    const rows=this.database.query<{id:string;from_shift_id:string;to_shift_id:string;from_platform_user_id:string;to_platform_user_id:string;status:ShiftExchangeRequest["status"];warnings_json:string;created_at:string;resolved_at:string|null}>(`SELECT * FROM staff_shift_exchanges ${userId?"WHERE from_platform_user_id=? OR to_platform_user_id=?":""} ORDER BY created_at DESC,id DESC`, userId?[userId,userId]:[]);
    return rows.map((row)=>({id:row.id,fromShiftId:row.from_shift_id,toShiftId:row.to_shift_id,fromUserId:row.from_platform_user_id,toUserId:row.to_platform_user_id,status:row.status,warnings:JSON.parse(row.warnings_json),createdAt:row.created_at,resolvedAt:row.resolved_at??undefined}));
  }

  createExchange(input: Readonly<{fromShiftId:string;toShiftId:string;actorId:string;idempotencyKey:string}>) {
    return this.idempotent("exchange-create",input.idempotencyKey,input,(db)=>{
      const from=this.shiftRecord(db,input.fromShiftId); const to=this.shiftRecord(db,input.toShiftId);
      if(!from||!to||from.id===to.id||!from.employeeIds.includes(input.actorId)) throw new Error("BAD_EXCHANGE");
      const candidates=to.employeeIds.filter((id)=>id!==input.actorId); if(candidates.length!==1) throw new Error("TARGET_ASSIGNMENT_AMBIGUOUS");
      const at=this.now(); const id=nanoid(); db.execute("INSERT INTO staff_shift_exchanges(id,from_shift_id,to_shift_id,from_platform_user_id,to_platform_user_id,status,warnings_json,created_at,version) VALUES (?,?,?,?,?,'pending','[]',?,0)",[id,from.id,to.id,input.actorId,candidates[0],at]);
      this.writeSnapshot(db);
      return {id,fromShiftId:from.id,toShiftId:to.id,fromUserId:input.actorId,toUserId:candidates[0],status:"pending",warnings:[],createdAt:at} satisfies ShiftExchangeRequest;
    });
  }

  resolveExchange(input: Readonly<{id:string;action:"accept"|"decline"|"cancel";actorId:string;idempotencyKey:string}>) {
    return this.idempotent("exchange-resolve",input.idempotencyKey,input,(db)=>{
      const row=db.query<{from_shift_id:string;to_shift_id:string;from_platform_user_id:string;to_platform_user_id:string;status:string;version:number}>("SELECT * FROM staff_shift_exchanges WHERE id=?",[input.id])[0];
      if(!row||row.status!=="pending") throw new Error("STALE_EXCHANGE");
      if(input.action==="cancel"?input.actorId!==row.from_platform_user_id:input.actorId!==row.to_platform_user_id) throw new Error("EXCHANGE_ACTOR_MISMATCH");
      if(input.action==="accept"){ const from=this.shiftRecord(db,row.from_shift_id); const to=this.shiftRecord(db,row.to_shift_id); if(!from||!to) throw new Error("SHIFT_NOT_FOUND"); db.execute("DELETE FROM staff_shift_assignments WHERE shift_id=? AND platform_user_id=?",[from.id,row.from_platform_user_id]); db.execute("DELETE FROM staff_shift_assignments WHERE shift_id=? AND platform_user_id=?",[to.id,row.to_platform_user_id]); db.execute("INSERT INTO staff_shift_assignments VALUES (?,?)",[from.id,row.to_platform_user_id]); db.execute("INSERT INTO staff_shift_assignments VALUES (?,?)",[to.id,row.from_platform_user_id]); }
      const status=input.action==="accept"?"accepted":input.action==="decline"?"declined":"cancelled"; const at=this.now(); db.execute("UPDATE staff_shift_exchanges SET status=?,resolved_at=?,resolved_by_platform_user_id=?,version=version+1 WHERE id=? AND version=?",[status,at,input.actorId,input.id,row.version]); this.writeSnapshot(db); return this.exchanges().find((item)=>item.id===input.id)!;
    });
  }

  previewRotation(input: Readonly<{startDate:string;endDate:string;locationId:string;employeeIds:string[];comment?:string}>) {
    if(!input.locationId||!input.employeeIds.length)throw new Error("BAD_ROTATION");
    const result:{shifts:Array<Omit<Shift,"id"|"start"|"end">>;skippedClosedDays:string[];conflicts:Array<{date:string;employeeId:string;shiftIds:string[]}>}={shifts:[],skippedClosedDays:[],conflicts:[]};
    dates(input.startDate,input.endDate).forEach((date,index)=>{if(this.scheduleDays({from:date,to:date}).some((d)=>d.locationId===input.locationId&&d.status==="closed")){result.skippedClosedDays.push(date);return;}const employeeId=input.employeeIds[index%input.employeeIds.length];const conflicts=this.schedule({from:date,to:date,userId:employeeId}).filter((s)=>s.status!=="cancelled").map((s)=>s.id);if(conflicts.length)result.conflicts.push({date,employeeId,shiftIds:conflicts});else result.shifts.push({date,locationId:input.locationId,employeeIds:[employeeId],status:"scheduled",comment:input.comment?.trim()||""});});return result;
  }

  commitRotation(input: Readonly<{startDate:string;endDate:string;locationId:string;employeeIds:string[];comment?:string;idempotencyKey:string}>) {
    return this.idempotent("rotation",input.idempotencyKey,input,(db)=>{
      const preview=this.previewRotation(input);if(preview.conflicts.length)throw new Error("ROTATION_CONFLICT");
      const at=this.now();const shiftIds:string[]=[];
      for(const item of preview.shifts){
        const employeeId=item.employeeIds[0];
        if(!db.query("SELECT platform_user_id FROM staff_identity_snapshots WHERE platform_user_id=? AND status='active'",[employeeId]).length)throw new Error("EMPLOYEE_NOT_ACTIVE");
        const id=nanoid();db.execute("INSERT INTO staff_shifts(id,local_date,start_time,end_time,location_id,status,comment,version,created_at,updated_at) VALUES (?,?,'10:00','21:00',?,'scheduled',?,0,?,?)",[id,item.date,item.locationId,item.comment,at,at]);
        db.execute("INSERT INTO staff_shift_assignments(shift_id,platform_user_id) VALUES (?,?)",[id,employeeId]);shiftIds.push(id);
      }
      this.writeSnapshot(db);return {...preview,shiftIds};
    });
  }

  previewFutureReplacement(input:Readonly<{fromUserId:string;toUserId:string;startDate:string;endDate:string}>){
    if(input.fromUserId===input.toUserId||!this.database.query("SELECT platform_user_id FROM staff_identity_snapshots WHERE platform_user_id=? AND status='active'",[input.toUserId]).length)throw new Error("BAD_REPLACEMENT_TARGET");
    const result:{replacements:Array<{shiftId:string;date:string;locationId:string}>;conflicts:Array<{shiftId:string;date:string;conflictShiftIds:string[]}>}={replacements:[],conflicts:[]};
    for(const shift of this.schedule({userId:input.fromUserId,from:input.startDate,to:input.endDate}).filter((s)=>s.status==="draft"||s.status==="scheduled")){const conflictShiftIds=this.schedule({userId:input.toUserId,from:shift.date,to:shift.date}).filter((s)=>s.id!==shift.id&&s.status!=="cancelled").map((s)=>s.id);if(conflictShiftIds.length)result.conflicts.push({shiftId:shift.id,date:shift.date,conflictShiftIds});else result.replacements.push({shiftId:shift.id,date:shift.date,locationId:shift.locationId});}return result;
  }

  commitFutureReplacement(input:Readonly<{fromUserId:string;toUserId:string;startDate:string;endDate:string;idempotencyKey:string}>){
    return this.idempotent("future-replacement",input.idempotencyKey,input,(db)=>{const preview=this.previewFutureReplacement(input);if(preview.conflicts.length)throw new Error("FUTURE_REPLACEMENT_CONFLICT");for(const item of preview.replacements){db.execute("DELETE FROM staff_shift_assignments WHERE shift_id=? AND platform_user_id=?",[item.shiftId,input.fromUserId]);db.execute("INSERT INTO staff_shift_assignments(shift_id,platform_user_id) VALUES (?,?)",[item.shiftId,input.toUserId]);db.execute("UPDATE staff_shifts SET version=version+1,updated_at=? WHERE id=?",[this.now(),item.shiftId]);}this.writeSnapshot(db);return preview;});
  }

  async dispatchPending(limit=100) {
    if (!this.delivery) return 0;
    const rows=this.database.query<{event_id:string;event_type:"StaffSnapshotUpdated";aggregate_id:string;payload_json:string;created_at:string;attempt_count:number}>("SELECT event_id,event_type,aggregate_id,payload_json,created_at,attempt_count FROM staff_event_outbox WHERE status IN ('pending','failed') AND available_at<=? ORDER BY created_at,event_id LIMIT ?",[this.now(),limit]);
    let delivered=0;
    for(const row of rows){const event:StaffEvent={eventId:row.event_id,eventType:row.event_type,eventVersion:1,producer:"staff",aggregateId:row.aggregate_id,occurredAt:row.created_at,payload:JSON.parse(row.payload_json)};const body=JSON.stringify(event);const timestamp=this.now();try{const response=await (this.delivery.fetcher??fetch)(`${this.delivery.coreBaseUrl}/internal/v1/events/staff`,{method:"POST",headers:{"content-type":"application/json","x-dvorik-timestamp":timestamp,"x-dvorik-signature":signInternalRequest(this.delivery.internalSecret,timestamp,body)},body});if(!response.ok)throw new Error(`CORE_HTTP_${response.status}`);this.database.execute("UPDATE staff_event_outbox SET status='sent',sent_at=?,last_error_code=NULL WHERE event_id=?",[this.now(),row.event_id]);delivered++;}catch(error){const delay=Math.min(900000,2**Math.min(row.attempt_count,10)*1000);this.database.execute("UPDATE staff_event_outbox SET status='failed',attempt_count=attempt_count+1,available_at=?,last_error_code=? WHERE event_id=?",[new Date(new Date(this.now()).getTime()+delay).toISOString(),error instanceof Error?error.message:"DELIVERY_FAILED",row.event_id]);}}
    return delivered;
  }

  private shiftRecord(db: {query<T extends object>(sql:string,parameters?: readonly (string|number|null)[]):T[]}, id:string): Shift|undefined {
    const row=db.query<{id:string;local_date:string;start_time:string;end_time:string;location_id:string;status:Shift["status"];comment:string}>("SELECT id,local_date,start_time,end_time,location_id,status,comment FROM staff_shifts WHERE id=?",[id])[0]; if(!row)return undefined;
    return {id:row.id,date:row.local_date,start:row.start_time,end:row.end_time,locationId:row.location_id,employeeIds:db.query<{platform_user_id:string}>("SELECT platform_user_id FROM staff_shift_assignments WHERE shift_id=? ORDER BY platform_user_id",[id]).map((x)=>x.platform_user_id),status:row.status,comment:row.comment};
  }

  private writeSnapshot(db: {query<T extends object>(sql:string,parameters?: readonly (string|number|null)[]):T[];execute(sql:string,parameters?: readonly (string|number|null)[]):unknown}) {
    const at=this.now(); const payload={activeEmployees:db.query<{count:number}>("SELECT count(*) count FROM staff_employee_profiles WHERE status='active'")[0]?.count??0,scheduledShifts:db.query<{count:number}>("SELECT count(*) count FROM staff_shifts WHERE status IN ('draft','scheduled','in_progress')")[0]?.count??0,pendingExchanges:db.query<{count:number}>("SELECT count(*) count FROM staff_shift_exchanges WHERE status='pending'")[0]?.count??0,sourceUpdatedAt:at};
    db.execute("INSERT INTO staff_event_outbox(event_id,event_type,aggregate_id,payload_json,status,available_at,created_at) VALUES (?,'StaffSnapshotUpdated','staff',?,'pending',?,?)",[nanoid(),JSON.stringify(payload),at,at]);
  }

  private idempotent<T>(scope: string, key: string, input: unknown, run: (db: DatabaseContext) => T): T {
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const requestHash = hash(input);
    return this.database.transaction((db) => {
      const existing = db.query<{ request_hash: string; response_json: string }>("SELECT request_hash,response_json FROM staff_idempotency_keys WHERE scope=? AND key=?", [scope,key])[0];
      if (existing) { if (existing.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT"); return JSON.parse(existing.response_json) as T; }
      const result = run(db);
      db.execute("INSERT INTO staff_idempotency_keys(scope,key,request_hash,response_json,created_at) VALUES (?,?,?,?,?)", [scope,key,requestHash,JSON.stringify(result),this.now()]);
      return result;
    }, { mode: "immediate" });
  }
}
