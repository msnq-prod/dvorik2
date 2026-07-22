# Orchestration

## Wave 1

| Area | Subagent | Model | Status | Artifact folder |
|---|---|---|---|---|
| A01 | sequential fallback | parent | complete | `agents/A01-root-loyalty-scaffold/` |
| A02 | sequential fallback | parent | complete | `agents/A02-frontend-ui-truth/` |
| A03 | sequential fallback | parent | complete | `agents/A03-api-storage-contract/` |
| A04 | sequential fallback | parent | complete | `agents/A04-docs-requirements/` |
| A05 | sequential fallback | parent | complete | `agents/A05-gpt-version-prototype/` |
| A06 | sequential fallback | parent | complete | `agents/A06-recovered-python-system/` |

## Prompt Template

Audit one assigned area only. Do not edit product code. Write:

- `01_ANALYSIS.md`
- `02_PROBLEMS.md`
- `03_NEEDS_MORE_RESEARCH.md`
- `04_SOLUTION_PLAN.md`
- `05_VERIFICATION_NOTES.md`

Use concrete file evidence and separate confirmed problems from hypotheses.

## Fallbacks

Subagent tool exists, but this thread has no explicit user permission to delegate. Running Wave 1 sequentially in the main agent.
