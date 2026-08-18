# P02 — Draft alternatives

## Option A — Clean global-FIFO cutover (initial recommendation)

Rebuild seed from approved source evidence, resolve all exceptions, start a clean Warehouse volume, and expose only global FIFO operations. Replace “inventory” claims with controlled per-item correction until Warehouse count sessions exist.

**Pros:** coherent source of truth; fastest safe scope; no location model invented under deadline.

**Cons:** transfers and full inventory are explicitly unavailable; needs operational count procedure.

## Option B — Import current Core location balances into Warehouse allocations

Add locations/allocations before launch and preserve transfer UX.

**Pros:** broader feature parity.

**Cons:** major model expansion, allocation/FIFO consistency rules and migration risk; unsuitable for urgent MVP.

## Option C — Keep legacy Core stock temporarily

Delay Warehouse cutover and use existing screens.

**Pros:** superficially smaller UI change.

**Cons:** forbidden by current production policy and incompatible with FIFO/cash ownership; creates two truths.

## Draft delivery sequence

1. Freeze MVP operation matrix and remove unsupported claims/actions.
2. Define import manifest: source document hash, parser version, row-level disposition, approver and timestamp.
3. Resolve two unverified lots through source document or physical count; no silent default.
4. Build immutable seed artifact and run schema/business reconciliation.
5. Rehearse receive, write-off, positive/negative adjustment, retry, restart and outbox replay.
6. Produce first-day operating procedure and rollback boundary before any writes.

## Draft gates

- Every opening lot has evidence or an explicit signed waiver.
- Accounting balance equals FIFO lot balance for every product.
- No visible transfer/full-inventory action exists in production MVP.
- Backup/restore and event replay preserve balances exactly.
