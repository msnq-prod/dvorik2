import type { EmployeeProfile, HrEvent, ScheduleDay, Shift, ShiftExchangeRequest, UserStatus } from "../shared/types";
import { signInternalRequest } from "../cash/signature";

export class StaffClient {
  constructor(private readonly baseUrl: string, private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}
  profiles() { return this.internal<EmployeeProfile[]>("/internal/profiles"); }
  async status(){try{return await this.internal<{availability:"connected"|"degraded";pendingEvents:number;failedEvents:number;oldestPendingAt?:string}>("/internal/status");}catch{return {availability:"degraded" as const,pendingEvents:0,failedEvents:0};}}
  hrEvents(input: Readonly<{ userId?: string; from?: string; to?: string }>) {
    const query = new URLSearchParams(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return this.internal<HrEvent[]>(`/internal/hr-events${query.size ? `?${query}` : ""}`);
  }
  async syncIdentity(input: Readonly<{ userId: string; status: UserStatus }>) { await this.internal("/internal/identities", { method: "POST", body: JSON.stringify(input) }); }
  saveProfile(userId: string, input: object) { return this.internal<EmployeeProfile>(`/internal/profiles/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify(input) }); }
  recordHrEvent(input: object) { return this.internal<HrEvent>("/internal/hr-events", { method: "POST", body: JSON.stringify(input) }); }
  schedule(input: Readonly<{ userId?: string; from?: string; to?: string }>) { return this.query<Shift[]>("/internal/schedule", input); }
  scheduleDays(input: Readonly<{ from?: string; to?: string }>) { return this.query<ScheduleDay[]>("/internal/schedule/days", input); }
  saveScheduleDay(input: object) { return this.internal<ScheduleDay>("/internal/schedule/days", {method:"PUT",body:JSON.stringify(input)}); }
  saveShift(input: Record<string, unknown> & {id?:string}) { const id=input.id; return this.internal<Shift>(id?`/internal/schedule/shifts/${encodeURIComponent(id)}`:"/internal/schedule/shifts",{method:id?"PUT":"POST",body:JSON.stringify(input)}); }
  exchanges(userId?:string) { return this.query<ShiftExchangeRequest[]>("/internal/schedule/exchanges",userId?{userId}:{}); }
  createExchange(input:object) { return this.internal<ShiftExchangeRequest>("/internal/schedule/exchanges",{method:"POST",body:JSON.stringify(input)}); }
  resolveExchange(id:string,action:string,input:object) { return this.internal<ShiftExchangeRequest>(`/internal/schedule/exchanges/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,{method:"POST",body:JSON.stringify(input)}); }
  previewRotation(input:object){return this.internal<Record<string,unknown>>("/internal/schedule/rotation/preview",{method:"POST",body:JSON.stringify(input)});}
  commitRotation(input:object){return this.internal<Record<string,unknown>>("/internal/schedule/rotation/commit",{method:"POST",body:JSON.stringify(input)});}
  previewFutureReplacement(input:object){return this.internal<Record<string,unknown>>("/internal/schedule/future-replacement/preview",{method:"POST",body:JSON.stringify(input)});}
  commitFutureReplacement(input:object){return this.internal<Record<string,unknown>>("/internal/schedule/future-replacement/commit",{method:"POST",body:JSON.stringify(input)});}
  private query<T>(path:string,input:Record<string,string|undefined>) { const q=new URLSearchParams(Object.entries(input).filter((entry):entry is [string,string]=>typeof entry[1]==="string")); return this.internal<T>(`${path}${q.size?`?${q}`:""}`); }
  private async internal<T = unknown>(path: string, init: RequestInit = {}) {
    const body = typeof init.body === "string" ? init.body : ""; const timestamp = new Date().toISOString();
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", "x-dvorik-timestamp": timestamp, "x-dvorik-signature": signInternalRequest(this.secret, timestamp, body), ...(init.headers || {}) } });
    const payload = await response.json().catch(() => null) as T & { code?: string };
    if (!response.ok) throw new Error(payload?.code || `STAFF_HTTP_${response.status}`); return payload;
  }
}
