# Architecture Risks

## R1 — Completeness is relative to a self-selected inventory

The system can declare 100% coverage after overlooking entire product roots.
Future projects will repeat the same failure unless scope expectations and
scanner receipts are machine-reconciled before synthesis.

## R2 — Referential correctness masks semantic emptiness

Every ID can link correctly while user-facing meaning is absent. Schema and
coverage gates must validate required semantic dimensions, not only references.

## R3 — Gap laundering across stages

Upstream unknowns become terminal gaps, then disappear as local learning/visual
gaps. Final consumers see polished files without the business impact of missing
truth.

## R4 — Self-review produces false confidence

The same actor authors, composes and approves. This is useful as a self-check but
cannot establish fidelity or usability.

## R5 — Lifecycle modes are unsafe for training

Keeping `current/legacy/target` only as metadata allows planned or historical
behavior to look operational to employees.

## R6 — Presentation release is file-centric

Opening, rendering, hashes and no-overflow checks can pass for semantically empty
decks. Release needs text/source comparison, duplicate detection, required
dimension checks and human task tests.

## R7 — Dirty/untracked sources weaken reproducibility

The Git commit does not capture major project roots. Every included source must
have an independent file/tree fingerprint and staleness links.

## R8 — Final status is too coarse

`DELIVERED_WITH_GAPS` currently combines acceptable external uncertainty with
fundamental unfitness. Add explicit dimensions such as structural integrity,
scope completeness, semantic readiness, visual readiness and client safety.

