# Orchestration

## Wave 1

| Area | Subagent | Model | Status | Artifact folder |
|---|---|---|---|---|
| A01 | warehouse | inherit | complete | `agents/A01-warehouse/` |
| A02 | scanner-webapp | inherit | complete | `agents/A02-scanner-webapp/` |
| A03 | employee-management | inherit | complete | `agents/A03-employee-management/` |
| A04 | launch-integration | main agent | complete | `agents/A04-launch-integration/` |

## Prompt template

Audit only the assigned MVP boundary. Do not modify product code or files outside the assigned artifact folder. Write `01_ANALYSIS.md`, `02_PROBLEMS.md`, and `03_NEEDS_MORE_RESEARCH.md` with concrete path/line evidence, readiness assessment, and commands run. Separate confirmed problems from hypotheses.

## Fallback

Main agent performs A04 and coordinates report synthesis; only audit documentation will be created.
