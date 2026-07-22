# A02 — Verification notes

## Iteration 2 status

Planning only. No product code, skill implementation, generated learning material or visual artifact was changed. The checks below are acceptance requirements for later implementation.

## Required verification sequence

### 1. Upstream entry gate

- Confirm the rebuilt A01 snapshot identifies the correct current product.
- Confirm every current surface is classified or explicitly excluded.
- Confirm teachable processes have two-way role, data, state, job/integration and evidence links.
- Confirm `unknown` dimensions remain gaps and locally available sources are not marked externally blocked.
- Re-run freshness before learning starts.

Failure blocks the learning stage.

### 2. Contract and structural tests

Use fixtures for current, legacy, target, unknown and conflicted claims. Verify:

- every user-facing block has source claim IDs but does not display them;
- mode/certainty cannot be omitted;
- user actions cannot be emitted as `system_action`;
- current operational instructions require role, trigger, action, result and error/recovery coverage;
- missing required dimensions create learning gaps;
- author and fidelity/clarity reviewer actor/run pairs differ;
- target material cannot be typed as an operational current instruction;
- critical gaps prevent a visual handoff.

### 3. Anti-placeholder regression checks

Reject employee-facing copy containing patterns such as:

- `claim_`, `proc_`, `lunit_`, `exp_`;
- “сохранено в исходном утверждении”;
- generic repeated “Для этого аспекта…” without a named aspect, owner and safe action;
- raw `system_action`, `escalation`, `current`, `legacy`, `target` labels.

Require every known source claim dispositioned as `teach` to have a meaning-bearing paraphrase. Automated lexical checks are necessary but not sufficient; an independent reviewer must compare the paraphrase with the source text.

### 4. Semantic fidelity checks

For each explanation, independently verify:

- all source claims are taught, explicitly deferred or excluded with reason;
- no action, condition, permission, data effect, error path or result changes meaning;
- lifecycle and certainty match the canonical records;
- unsupported detail is absent;
- exact evidence links remain machine-readable.

Acceptance: zero unresolved critical fidelity findings and zero new facts.

### 5. Role and coverage checks

- Produce a role × process matrix from canonical links.
- Ensure every material has one primary audience and only relevant secondary audiences.
- Ensure each audience has responsibilities, exclusions, vocabulary level and escalation ownership.
- Confirm technical/API materials are excluded from general employee training unless a named role needs them.
- Confirm current process coverage includes Telegram, database effects, automatic jobs and integrations where A01 proves they participate.

Acceptance: no orphan teachable process, audience or role; no “all staff” fallback created from missing data.

### 6. Troubleshooting checks

For every current process, verify scenarios cover all applicable confirmed:

- validation failures;
- permission failures;
- duplicate/retry/idempotency behavior;
- cancellation/rollback;
- timeouts/background work;
- integration failure;
- visible failure and success signals.

Each scenario must specify safe action, retry rule, escalation owner, evidence to attach and recovery check. Unknown recovery behavior must visibly block that instruction.

### 7. Plain-language and terminology checks

- Run terminology extraction against final copy and source claims.
- Confirm all unavoidable technical terms are defined in Russian.
- Check that action sentences begin with the role/user action and use visible UI language.
- Check that backend/data explanations answer “что проверяет система” and “что сохраняется” without implementation jargon.
- Check the order: purpose → start/prerequisites → actions/system/data → result → errors.

Acceptance: no unexplained internal IDs or lifecycle labels; no empty glossary when technical terms remain.

### 8. Human usability test

Use at least one representative nontechnical employee per actual role for the pilot and broader sampling before full release. Give only the final learning material and a safe test environment.

Measure:

- task completion without coaching;
- correct entry point and action order;
- correct explanation of expected system/data result;
- correct response to at least one error;
- correct distinction between current, legacy and target;
- questions or terms that required explanation.

Acceptance for an operational instruction:

- 100% of safety/irreversibility steps performed correctly;
- at least 90% task completion without coaching across tested participants;
- zero target/current or legacy/current confusion;
- zero unresolved terminology blocker;
- every observed failure becomes a recorded finding and requires re-review.

### 9. Handoff and downstream check

Before visual generation:

- verify the source snapshot is unchanged;
- verify all review IDs are independent and passed;
- verify coverage contains no critical learning gap;
- inspect the final handoff for role/process/deliverable maps and explicit exclusions;
- have the visual stage reject missing quality fields or stale schema versions.

After visual generation, repeat clarity checks against rendered slides, not source JSON alone.

## Checks performed in this audit

- Re-read A02 iteration-1 analysis, findings and research gaps.
- Reconciled the plan with A01 iteration-1 findings, especially wrong current scope, massive inventory undercoverage, unsupported evidence, `unknown` counted as covered and missing role/data/integration links.
- No implementation tests were run because implementation is outside the requested iteration.

## Remaining verification dependencies

- Product owner decision on current/legacy/target boundaries and real deployment status.
- Named operational escalation owners.
- Representative employees and a safe test environment.
- Rebuilt A01 process catalog.
- Inspection and modification of the learning skill/CLI under a later explicitly approved implementation phase.
