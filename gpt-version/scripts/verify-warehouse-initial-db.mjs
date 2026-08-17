import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

const seed = JSON.parse(fs.readFileSync(path.resolve("data/warehouse-initial-seed.json"), "utf8"));
const database = new BetterSqlite3(path.resolve("data/warehouse.sqlite"), { readonly: true });
try {
  const actual = seed.products.filter((product) => product.estimatedRemainingPackages > 0);
  assert.equal(actual.every((product) => Boolean(product.localName)), true, "Every actual product needs a local name");
  assert.equal(database.prepare("SELECT count(*) count FROM products WHERE local_name<>''").get().count >= actual.length, true);
  const expectedPackages = actual.reduce((sum, product) => sum + product.estimatedRemainingPackages, 0);
  assert.equal(database.prepare("SELECT sum(remaining_package_milli)/1000 total FROM inventory_lots").get().total, expectedPackages);
  assert.equal(database.prepare(`SELECT count(*) count FROM products p JOIN inventory_balances b ON b.product_id=p.id
    WHERE b.quantity_minor<>COALESCE((SELECT sum(CASE WHEN p.inventory_kind='weight' THEN l.remaining_package_milli*l.package_mass_grams/1000 ELSE l.remaining_package_milli END) FROM inventory_lots l WHERE l.product_id=p.id),0)`).get().count, 0);
  const unverified = database.prepare("SELECT count(*) count FROM inventory_lots WHERE supply_line_id LIKE 'line-OPENING-UNVERIFIED-%'").get().count;
  assert.equal(unverified, 2);
  const companyEvents = database.prepare("SELECT count(*) count FROM domain_outbox WHERE producer='warehouse' AND event_type='ProductProfitabilityUpdated'").get().count;
  assert.equal(companyEvents, actual.length);
  console.log(JSON.stringify({ actualProducts: actual.length, remainingPackages: expectedPackages, unverifiedOpeningLots: unverified, companyEvents }));
} finally {
  database.close();
}
