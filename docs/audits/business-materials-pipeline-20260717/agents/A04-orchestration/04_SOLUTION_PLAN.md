# A04 Solution Plan

## Recommended direction

### 1. Add an objective-coverage gate before Inventory Gate

Persist a scope contract containing required product roots, lifecycle modes,
source classes, and mandatory maps. Inventory cannot close until each required
class is either inventoried or represented by a justified unavailable-source gap.

Minimum required classes for this project:

- current product source-of-truth;
- UI actions, HTTP/Telegram entrypoints, jobs/workers;
- tables/state owners and roles/permissions;
- integrations, notifications, exports, backup/restore;
- target requirements and legacy reference roots.

### 2. Separate structural closure from fitness gates

Each stage should report both:

- graph integrity: IDs, links, hashes, terminal records;
- fitness: completeness for the user's objective, semantic usefulness, and
  audience readiness.

Downstream initialization must require both, or explicitly carry a material
fitness gap displayed in every final deliverable.

### 3. Make review provenance enforceable

Store compositor/author run, reviewer run, model route, model actually used,
artifact hash, and review time in every review. A review by the same actor/run
must be labeled `self_check`, never `independent_review`. Balanced/maximum
profiles should not claim their intended quality level when recorded routing is
missing.

### 4. Strengthen gap propagation

Every stage should translate upstream gaps into audience-facing impact, not just
copy IDs. Final handoff should include severity, affected deliverables, missing
truth, and whether client delivery is safe.

### 5. Validate chronology and path contracts

- reject review timestamps later than finalization;
- require accepted review records before final handoff creation;
- include an explicit `artifact_base_root` or normalize final artifact paths to
  absolute paths;
- hash all canonical inputs used by downstream stages.

### 6. Keep the new terminal-response guard

Require `assert-terminal` as the last command. Exit 3 continues the loop; exit 2
allows only a concrete blocker response; exit 0 permits delivery. Preserve the
same root across compaction and follow-up turns.

## Migration of this run

Do not patch the four decks in place. Mark this package `superseded_incomplete`,
freeze it as audit evidence, rebuild analysis from a corrected scope, then
regenerate learning and visuals from new immutable handoffs.

## Rollout order

1. Correct A01 scope and evidence gates.
2. Correct A02 semantic fitness and role gates.
3. Correct A03 visual QA and deliverable architecture.
4. Add orchestration objective/fitness/review-provenance gates.
5. Re-run the full pipeline in a new dated analysis root.

