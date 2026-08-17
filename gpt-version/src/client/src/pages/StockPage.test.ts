import assert from "node:assert/strict";
import type { StockBalance } from "../../../shared/types";
import { strongestBalanceForProduct } from "./StockPage";

const balances: StockBalance[] = [
  { productId: "p-1", locationId: "loc-small", quantity: 2, version: 0 },
  { productId: "p-1", locationId: "loc-main", quantity: 12, version: 0 },
  { productId: "p-1", locationId: "loc-empty", quantity: 0, version: 0 },
  { productId: "p-2", locationId: "loc-other", quantity: 30, version: 0 }
];

assert.equal(strongestBalanceForProduct("p-1", balances)?.locationId, "loc-main");
assert.equal(strongestBalanceForProduct("missing", balances), undefined);
console.log("stock page scanner tests passed");
