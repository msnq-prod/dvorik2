# Orchestration

## Wave 1

| Area | Worker | Model | Status | Artifact folder |
|---|---|---|---|---|
| A01 Legacy bot/calendar | main-agent fallback | current model | complete | `agents/A01-legacy-bot-calendar/` |
| A02 Legacy admin | main-agent fallback | current model | complete | `agents/A02-legacy-admin/` |
| A03 Current product | main-agent fallback | current model | complete | `agents/A03-current-product/` |
| A04 Visual/merge | main agent | current model | complete | `agents/A04-visual-merge/` |

## Prompt Template

Inspect only the assigned area. Do not modify product code. Write `01_ANALYSIS.md`, `02_PROBLEMS.md`, and `03_NEEDS_MORE_RESEARCH.md` with concrete file:line evidence. Separate confirmed facts from hypotheses. Then write `04_SOLUTION_PLAN.md` and `05_VERIFICATION_NOTES.md` focused on what should be transferred or merged into current.

## Fallbacks

Three subagents were started but all stopped on the agent usage limit before producing artifacts. The main agent completed all areas sequentially. Main agent owned browser capture and final synthesis.
