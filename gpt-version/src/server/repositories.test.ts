import assert from "node:assert/strict";
import type { Product } from "../shared/types";
import {
  createPageRequest,
  type CreateResult,
  type IdempotencyRecord,
  type IdempotencyReservation,
  type OutboxLeaseGuard,
  type PageRequest,
  type ProductsRepository,
  type RepositoryRecord,
  type UpdateResult,
  type WriteResult
} from "./repositories";

const product: Product = {
  id: "p-fake", officialName: "Fake", localName: "Fake", unit: "шт", photoUrl: "",
  category: "test", tags: [], status: "active", identifiers: [], lowStockThreshold: 1
};
const record: RepositoryRecord<Product> = { entity: product, revision: "rev-1" };

class FakeProductsRepository implements ProductsRepository {
  constructor(private current: RepositoryRecord<Product> | undefined) {}
  findById(productId: string) { return this.current?.entity.id === productId ? this.current : undefined; }
  findByIdentifier() { return undefined; }
  list(_query: Parameters<ProductsRepository["list"]>[0], _page: PageRequest) {
    return { items: this.current ? [this.current] : [] };
  }
  listAliases() { return { items: [] }; }
  create(entity: Product, options: Parameters<ProductsRepository["create"]>[1]): CreateResult<Product> {
    assert.equal(options.expectedRevision, null);
    if (this.current) return { outcome: "duplicate", current: this.current };
    this.current = { entity, revision: "rev-created" };
    return { outcome: "created", record: this.current };
  }
  save(entity: Product, options: Parameters<ProductsRepository["save"]>[1]): UpdateResult<Product> {
    if (!this.current) return { outcome: "missing" };
    if (options.expectedRevision !== this.current.revision) return { outcome: "stale", current: this.current };
    this.current = { entity, revision: "rev-updated" };
    return { outcome: "updated", record: this.current };
  }
  saveAlias(): ReturnType<ProductsRepository["saveAlias"]> { return { outcome: "missing" }; }
}

function applicationService(repository: ProductsRepository, productId: string) {
  return repository.findById(productId)?.entity.officialName;
}

const fake = new FakeProductsRepository(record);
assert.equal(applicationService(fake, "p-fake"), "Fake");
assert.equal(applicationService(fake, "missing"), undefined);
assert.equal(fake.create(product, { at: "2026-07-12T00:00:00.000Z", expectedRevision: null }).outcome, "duplicate");
assert.equal(fake.save({ ...product, officialName: "Stale" }, { at: "2026-07-12T00:00:00.000Z", expectedRevision: "wrong" }).outcome, "stale");
assert.equal(fake.save({ ...product, officialName: "Updated" }, { at: "2026-07-12T00:00:00.000Z", expectedRevision: "rev-1" }).outcome, "updated");
assert.equal(applicationService(fake, "p-fake"), "Updated");
assert.equal(new FakeProductsRepository(undefined).save(product, { at: "2026-07-12T00:00:00.000Z", expectedRevision: "missing" }).outcome, "missing");

assert.deepEqual(createPageRequest(25, "name_asc_id_asc", "opaque"), { limit: 25, order: "name_asc_id_asc", cursor: "opaque" });
for (const invalid of [0, 101, 1.5]) assert.throws(() => createPageRequest(invalid, "name_asc_id_asc"), RangeError);

const existingIdempotency: RepositoryRecord<IdempotencyRecord> = {
  revision: "idem-1",
  entity: {
    scope: "stock", key: "key", requestHash: "hash-a", status: "completed",
    responseStatus: 201, response: { schemaVersion: 1, value: { operationId: "operation-1" } },
    createdAt: "2026-07-12T00:00:00.000Z", completedAt: "2026-07-12T00:00:01.000Z"
  }
};
const reserve = (requestHash: string): IdempotencyReservation => requestHash === existingIdempotency.entity.requestHash
  ? { outcome: "replay", record: existingIdempotency }
  : { outcome: "conflict", record: existingIdempotency };
assert.equal(reserve("hash-a").outcome, "replay");
assert.equal(reserve("hash-b").outcome, "conflict");

const activeLease: OutboxLeaseGuard = { workerId: "worker-a", leaseToken: "lease-a", expectedRevision: "outbox-2" };
const maySettle = (attempt: OutboxLeaseGuard) => attempt.workerId === activeLease.workerId
  && attempt.leaseToken === activeLease.leaseToken
  && attempt.expectedRevision === activeLease.expectedRevision;
assert.equal(maySettle(activeLease), true);
assert.equal(maySettle({ ...activeLease, workerId: "stale-worker" }), false);
assert.equal(maySettle({ ...activeLease, leaseToken: "stale-token" }), false);
console.log("repository contract tests passed");
