import assert from "node:assert/strict";
import { SabyClient } from "./saby-client";

const requests: Array<{ url: string; init?: RequestInit }> = [];
let salesCalls = 0;
const fetcher: typeof fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, init });
  if (url.includes("oauth/service")) return Response.json({ token: salesCalls ? "token-2" : "token-1" });
  salesCalls += 1;
  if (salesCalls === 1) return new Response("expired", { status: 401 });
  if (salesCalls === 2) return Response.json({ orders: Array.from({ length: 100 }, (_, index) => ({ Key: `sale-${index}` })) });
  return Response.json({ orders: [{ Key: "sale-last" }] });
};
const client = new SabyClient({ appClientId: "app", appSecret: "secret", secretKey: "key", authUrl: "https://online.sbis.ru/oauth/service/", apiBaseUrl: "https://api.sbis.ru", pointId: 77 }, fetcher);
const orders = await client.listOrders({ fromDateTime: "2026-07-20 00:00:00", toDateTime: "2026-07-21 00:00:00" });
assert.equal(orders.length, 101);
assert.equal(requests.filter((request) => request.url.includes("oauth/service")).length, 2);
const sales = requests.filter((request) => request.url.includes("retail/order/list"));
assert.equal(sales.length, 3);
assert.match(sales[0].url, /pointId=77/);
assert.match(sales[0].url, /pageSize=100/);
assert.equal((sales[2].init?.headers as Record<string, string>)["X-SBISAccessToken"], "token-2");
assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { app_client_id: "app", app_secret: "secret", secret_key: "key" });
console.log("saby client tests passed");
