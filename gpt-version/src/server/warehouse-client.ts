import { signInternalRequest } from "../cash/signature";

/** Signed client for the independently deployed Warehouse service. */
export class WarehouseClient {
  constructor(private readonly baseUrl: string, private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}
  status() { return this.internal("/internal/status"); }
  balances() { return this.internal("/internal/balances"); }
  catalog() { return this.internal("/internal/catalog"); }
  createCatalogProduct(input: object) { return this.internal("/internal/catalog/products", { method: "POST", body: JSON.stringify(input) }); }
  recentlyDepleted(since: string, limit = 8) { return this.internal(`/internal/recently-depleted?since=${encodeURIComponent(since)}&limit=${limit}`); }
  priceCategories() { return this.internal("/internal/price-categories"); }
  priceCategory(id: string) { return this.internal(`/internal/price-categories/${encodeURIComponent(id)}`); }
  createPriceCategory(input: object) { return this.internal("/internal/price-categories", { method: "POST", body: JSON.stringify(input) }); }
  updatePriceCategory(id: string, input: object) { return this.internal(`/internal/price-categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }); }
  assignProductToCategory(id: string, input: object) { return this.internal(`/internal/price-categories/${encodeURIComponent(id)}/products`, { method: "POST", body: JSON.stringify(input) }); }
  removeProductFromCategory(id: string, productId: string, input: object) { return this.internal(`/internal/price-categories/${encodeURIComponent(id)}/products/${encodeURIComponent(productId)}`, { method: "DELETE", body: JSON.stringify(input) }); }
  addCategoryPrice(id: string, input: object) { return this.internal(`/internal/price-categories/${encodeURIComponent(id)}/prices`, { method: "POST", body: JSON.stringify(input) }); }
  createSupplyDraft(input: object) { return this.internal("/internal/supply-drafts", { method: "POST", body: JSON.stringify(input) }); }
  supplyDraft(id: string) { return this.internal(`/internal/supply-drafts/${encodeURIComponent(id)}`); }
  acceptSupplyDraft(id: string, input: object) { return this.internal(`/internal/supply-drafts/${encodeURIComponent(id)}/accept`, { method: "POST", body: JSON.stringify(input) }); }
  journal(from?: string, to?: string) { const query = new URLSearchParams(); if (from) query.set("from", from); if (to) query.set("to", to); return this.internal(`/internal/journal${query.size ? `?${query}` : ""}`); }
  lots(productId?: string) { return this.internal(`/internal/lots${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`); }
  suppliers() { return this.internal("/internal/suppliers"); }
  cutoverReadiness() { return this.internal("/internal/cutover-readiness"); }
  profitability(productId: string, cashConnected: boolean) { return this.internal(`/internal/products/${encodeURIComponent(productId)}/profitability?cashConnected=${cashConnected}`); }
  applyCashEvent(event: object) { return this.internal("/internal/cash-events", { method: "POST", body: JSON.stringify(event) }); }
  acceptSupply(input: object) { return this.internal("/internal/supplies", { method: "POST", body: JSON.stringify(input) }); }
  registerOpeningLot(input: object) { return this.internal("/internal/opening-lots", { method: "POST", body: JSON.stringify(input) }); }
  writeOff(input: object) { return this.internal("/internal/write-offs", { method: "POST", body: JSON.stringify(input) }); }
  adjust(input: object) { return this.internal("/internal/adjustments", { method: "POST", body: JSON.stringify(input) }); }
  private async internal<T = unknown>(path: string, init: RequestInit = {}) {
    const body = typeof init.body === "string" ? init.body : "";
    const timestamp = new Date().toISOString();
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", "x-dvorik-timestamp": timestamp, "x-dvorik-signature": signInternalRequest(this.secret, timestamp, body), ...(init.headers || {}) } });
    const payload = await response.json().catch(() => null) as T & { code?: string };
    if (!response.ok) throw new Error(payload?.code || `WAREHOUSE_HTTP_${response.status}`);
    return payload;
  }
}
