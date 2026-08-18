# P02 — Acceptance gates

- [ ] Production operation matrix contains only supported global-FIFO actions.
- [ ] Core legacy stock is excluded from production reads and writes.
- [ ] Cutover timestamp and freeze procedure are recorded.
- [ ] Source manifest, approvers and hashes are complete and retained.
- [ ] Opening state is current at cutover; both exceptional lots have quantity and cost disposition.
- [ ] Second artifact build is byte-identical.
- [ ] Zero FK, negative-balance, orphan or FIFO/accounting differences.
- [ ] Concurrency, idempotency, restart and outbox replay tests pass.
- [ ] External-mode browser flow passes for every retained action.
- [ ] Paired backup/restore and post-write recovery are rehearsed.
- [ ] First-day owners, thresholds and escalation are signed off.
