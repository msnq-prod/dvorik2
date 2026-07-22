# A02 — Solution plan

## Recommended direction

Rebuild the learning stage as a semantic, role-aware transformation with independent gates. Do not repair the current 16 explanations in place: A01 established that the upstream catalog selected the wrong current product, covers only four processes, lacks role/data/integration links and contains unsupported claims (`P1-A01-01`–`P1-A01-06`).

The next visual run must consume a new versioned learning package generated only after the A01 catalog is rebuilt.

## Ordered implementation

### Phase 0 — Stop and isolate invalid outputs

- Mark the existing learning handoff as unsuitable for client or employee use.
- Prevent its visual artifacts from being reused as approved templates or source content.
- Preserve the run read-only for audit traceability; create a new analysis/learning run rather than overwriting it.
- Block learning generation until A01 establishes the correct `current` root, full surface inventory, exact evidence locators and two-way role/data/job/integration links.

Addresses: `P1-A02-01`, `P1-A02-08`; depends on `P1-A01-01`–`P1-A01-06`.

### Phase 1 — Strengthen the analysis-to-learning input contract

Require every teachable process to provide:

- lifecycle mode and a user-facing availability statement;
- business goal, trigger and visible result;
- named roles and responsibility boundaries;
- user actions separately from backend actions;
- data read/written and visible confirmation;
- permissions, validation, error, retry, cancel and escalation behavior;
- exact claim/evidence links and explicit unknowns;
- disposition: `teach_current`, `reference_legacy`, `preview_target`, `technical_only`, `defer_gap`, or `exclude`.

Reject or defer a process when mandatory user-facing dimensions are unknown. A claim whose status is `unknown` must create a learning gap; it must never count as teachable coverage.

Addresses: `P1-A02-01`, `P1-A02-03`, `P1-A02-04`, `P1-A02-08`.

### Phase 2 — Build real audience profiles

- Derive audiences from canonical role links; never infer “all staff” merely because roles are missing.
- Each audience must include responsibilities, allowed actions, entry surfaces, assumed knowledge, exclusions and escalation owner.
- Generate a role × process matrix and make every mapping explain why the role needs the material.
- Separate technical/API/operator material from employee task instructions.
- Missing role ownership is a blocking learning gap, not a ready audience.

Addresses: `P1-A02-03`.

### Phase 3 — Replace placeholder generation with semantic transformation

For each role/process, create a compact instruction in this order:

1. what the employee wants to achieve;
2. where and when to start;
3. prerequisites and permissions;
4. numbered employee actions;
5. system checks and backend actions paired with those steps;
6. data created or changed;
7. visible success result;
8. errors, retry/cancel/escalation paths;
9. lifecycle/certainty warning.

User-facing text must contain the meaning of source claims, not their IDs. Evidence IDs remain machine metadata and optional author notes only. Block types must distinguish `user_action`, `system_action`, `data_change`, `decision`, `warning`, `result`, `error_recovery` and `escalation`.

For unknowns, state the specific unknown, affected action, safe restriction and closure owner. Generic “нужно подтвердить” text is prohibited.

Addresses: `P1-A02-01`, `P1-A02-05`, `P2-A02-07`.

### Phase 4 — Make lifecycle mode impossible to miss

- Current: “Работает сейчас” and eligible for task instruction.
- Legacy: “Старый процесс / только справка”; include migration relevance and do not teach it as the default flow.
- Target: “Планируемый процесс / сейчас недоступен”; allow only concept or future-state material, never operational steps unless current implementation is independently confirmed.
- Unknown/conflicted: explicit stop or escalation block.

Keep machine values in metadata, but use Russian labels and visible styling in every card, index and downstream packet. No mixed-mode deliverable without a comparison objective.

Addresses: `P1-A02-04`, `P2-A02-06`.

### Phase 5 — Create scenario-based troubleshooting

Each troubleshooting record must contain:

- user-visible symptom;
- likely confirmed cause or “cause unknown”;
- safe immediate action;
- whether retry/cancel is allowed and under what condition;
- data/operation that must not be duplicated;
- escalation role/contact and evidence to attach;
- success/recovery check;
- source claims and certainty.

Generate scenarios from confirmed errors, validation, retries, cancellation, timeouts and gaps for every current process. Target-only errors remain future-state notes; unknown recovery behavior blocks publication as an operational instruction.

Addresses: `P1-A02-05`.

### Phase 6 — Add terminology and instructional design

- Extract terms from both source claims and final user-facing text.
- Replace internal terms where possible; define unavoidable terms in plain Russian with a task example.
- Prohibit `claim_*`, process IDs, schema names and English lifecycle labels in employee-facing copy.
- Set one measurable objective per deliverable, such as “кладовщик может принять поставку и проверить изменение остатка.”
- Order sections as purpose → entry/prerequisites → actions/system/data → result → exceptions.

Addresses: `P2-A02-06`, `P2-A02-07`.

### Phase 7 — Replace formal reviews with independent semantic gates

Use separate actors/runs for author, fidelity reviewer and clarity reviewer. No reviewer may approve their own explanation.

Fidelity gate must verify, claim by claim:

- meaning is preserved;
- mode and certainty are visible;
- conditions/negative paths are not dropped;
- no new facts are introduced;
- each displayed fact has evidence metadata.

Clarity gate must verify from the final user-facing text, without opening source claims:

- the role knows what to do and where;
- user/backend/data/result are distinguishable;
- errors have executable recovery or explicit stop;
- terminology is understandable;
- the material cannot be mistaken for another lifecycle mode.

Automated validation may reject obvious defects, but `passed` requires an independent semantic reread. Review findings and addressed changes must be retained.

Addresses: `P1-A02-02`.

### Phase 8 — Make readiness and handoff quality-based

Add learning-specific gaps and quality metrics to coverage/handoff:

- missing audience/role;
- missing action/backend/data/result/error coverage;
- generic or placeholder text;
- absent terminology definitions;
- reviewer non-independence;
- unresolved lifecycle ambiguity;
- failed human usability check.

Permit visual handoff only when every intended operational deliverable passes semantic fidelity, clarity and role coverage. `READY_WITH_GAPS` may pass only if gaps are explicitly non-operational and every affected deliverable is excluded or visibly marked. Critical learning gaps must yield `BLOCKED`.

Addresses: `P1-A02-02`, `P1-A02-08`.

## Rollout plan

1. Complete the A01 rebuild and freeze a fresh source snapshot.
2. Implement the new learning contracts and validators against synthetic fixtures covering current, legacy, target, unknown and conflicted claims.
3. Pilot one complete current warehouse process with one real role; do not start visual production.
4. Run independent fidelity/clarity reviews and a task-based employee test.
5. Refine rules, then generate the remaining current processes role by role in small batches.
6. Generate legacy/reference and target/concept materials separately.
7. Finalize the learning handoff only after cross-process role, terminology and troubleshooting coverage passes.
8. Regenerate visual materials from the new handoff; quarantine the old PPTX outputs.

## Alternatives

- **Patch current cards:** fast but rejected; it preserves the incomplete/wrong A01 catalog and weak gates.
- **Copy canonical claims verbatim:** improves factual content but remains too technical and does not solve roles, sequencing or usability.
- **Recommended — versioned rebuild with semantic gates:** more work, but it prevents recurrence and remains reusable for other projects.

## Migration and compatibility

- Keep stable source claim/process IDs only where the rebuilt A01 catalog validates them; do not force compatibility with fabricated or mis-scoped records.
- Version the learning schema and preserve old runs as immutable audit history.
- Downstream visual skill must reject prior schema/handoff versions once the semantic readiness contract is active.
- Provide a migration report mapping old deliverables to rebuilt, replaced or excluded processes; never silently reuse old approval statuses.

## Residual risks

- Independent AI review can still share systematic blind spots; human task testing remains necessary for operational material.
- Correct wording cannot compensate for unavailable runtime behavior or unverified external integrations.
- Audience profiles can become stale when permissions or responsibilities change; their source links and fingerprints must participate in freshness checks.
