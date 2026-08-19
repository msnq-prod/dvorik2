import assert from "node:assert/strict";
import type { Product } from "../../../shared/types";
import type { ApiClient } from "../api";
import { ApiError } from "../api";
import { isMissingActiveInventory, loadAllActiveProducts } from "./InventoryPage";

const products = Array.from({ length: 250 }, (_, index) => ({
  id: `product-${index + 1}`
} as Product));

const calls: string[] = [];
const client = {
  request: async (url: string) => {
    calls.push(url);
    const page = Number(new URL(url, "http://local").searchParams.get("page"));
    const start = (page - 1) * 100;
    return {
      items: products.slice(start, start + 100),
      total: products.length,
      page,
      limit: 100
    };
  }
} as ApiClient;

const loaded = await loadAllActiveProducts(client);
assert.equal(loaded.length, 250);
assert.deepEqual(loaded.map((product) => product.id), products.map((product) => product.id));
assert.deepEqual(calls, [
  "/api/products?status=active&page=1&limit=100",
  "/api/products?status=active&page=2&limit=100",
  "/api/products?status=active&page=3&limit=100"
]);

assert.equal(isMissingActiveInventory(new ApiError(404, { code: "NOT_FOUND" })), true);
assert.equal(isMissingActiveInventory(new ApiError(500, { code: "SERVICE_UNAVAILABLE" })), false);

console.log("InventoryPage pagination and empty-session handling passed");
