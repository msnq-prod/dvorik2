export type SabyClientConfig = Readonly<{
  appClientId: string;
  appSecret: string;
  secretKey: string;
  authUrl: string;
  apiBaseUrl: string;
  pointId: number;
}>;

export type SabyOrder = Readonly<Record<string, unknown>>;
type FetchLike = typeof fetch;

export class SabyApiError extends Error {
  constructor(readonly code: "AUTH_FAILED" | "API_FAILED" | "BAD_RESPONSE", readonly status?: number) {
    super(code);
    this.name = "SabyApiError";
  }
}

export class SabyClient {
  private token?: string;

  constructor(private readonly config: SabyClientConfig, private readonly fetcher: FetchLike = fetch) {}

  async listOrders(input: Readonly<{ fromDateTime: string; toDateTime: string }>): Promise<readonly SabyOrder[]> {
    const orders: SabyOrder[] = [];
    for (let page = 0; page < 10_000; page += 1) {
      const batch = await this.page({ ...input, page }, true);
      orders.push(...batch);
      if (batch.length < 100) return orders;
    }
    throw new SabyApiError("BAD_RESPONSE");
  }

  private async page(input: Readonly<{ fromDateTime: string; toDateTime: string; page: number }>, retryAuth: boolean): Promise<SabyOrder[]> {
    const token = this.token ?? await this.authenticate();
    const url = new URL("/retail/order/list", this.config.apiBaseUrl);
    url.searchParams.set("pointId", String(this.config.pointId));
    url.searchParams.set("fromDateTime", input.fromDateTime);
    url.searchParams.set("toDateTime", input.toDateTime);
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("needDiscountInfo", "true");
    const response = await this.fetcher(url, { headers: { "X-SBISAccessToken": token, accept: "application/json" } });
    if (response.status === 401 && retryAuth) {
      this.token = undefined;
      return this.page(input, false);
    }
    if (!response.ok) throw new SabyApiError("API_FAILED", response.status);
    const payload = await response.json() as unknown;
    if (!isObject(payload) || !Array.isArray(payload.orders) || payload.orders.some((order) => !isObject(order))) throw new SabyApiError("BAD_RESPONSE");
    return payload.orders as SabyOrder[];
  }

  private async authenticate() {
    const response = await this.fetcher(this.config.authUrl, {
      method: "POST",
      headers: { "content-type": "application/json;charset=utf-8", accept: "application/json" },
      body: JSON.stringify({ app_client_id: this.config.appClientId, app_secret: this.config.appSecret, secret_key: this.config.secretKey })
    });
    if (!response.ok) throw new SabyApiError("AUTH_FAILED", response.status);
    const payload = await response.json() as unknown;
    if (!isObject(payload) || typeof payload.token !== "string" || !payload.token.trim()) throw new SabyApiError("BAD_RESPONSE");
    this.token = payload.token;
    return payload.token;
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
