import type { CashStatus } from "../contracts/cash";
import { signInternalRequest } from "../cash/signature";

export class CashClient {
  constructor(private readonly baseUrl: string, private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}

  async status(): Promise<CashStatus> {
    try {
      return await this.internal<CashStatus>("/internal/status");
    } catch {
      return { availability: "degraded", enabled: true };
    }
  }

  mappings() {
    return this.internal<unknown[]>("/internal/mappings");
  }

  saveMapping(input: object) {
    return this.internal("/internal/mappings", { method: "PUT", body: JSON.stringify(input) });
  }

  webhook(secret: string, payload: unknown) {
    return this.request(`/webhook/${encodeURIComponent(secret)}`, { method: "POST", body: JSON.stringify(payload ?? {}) });
  }

  private internal<T = unknown>(path: string, init: RequestInit = {}) {
    const body = typeof init.body === "string" ? init.body : "";
    const timestamp = new Date().toISOString();
    return this.request<T>(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-dvorik-timestamp": timestamp,
        "x-dvorik-signature": signInternalRequest(this.secret, timestamp, body),
        ...(init.headers || {})
      }
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      const payload = await response.json().catch(() => null) as T & { code?: string };
      if (!response.ok) throw new Error(payload?.code || `CASH_HTTP_${response.status}`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}
