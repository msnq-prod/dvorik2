# Orchestration

## Wave 1

| Area | Subagent | Model | Status | Artifact folder |
|---|---|---|---|---|
| A01 | audit_analysis_coverage | inherited available model | complete | `agents/A01-analysis-coverage/` |
| A02 | audit_learning_quality | inherited available model | complete | `agents/A02-learning-quality/` |
| A03 | audit_visual_quality | inherited available model | complete | `agents/A03-visual-quality/` |
| A04 | main agent | current model | complete | `agents/A04-orchestration/` |

## Prompt template

Audit exactly one assigned area. Do not edit product code or generated pipeline
artifacts. Write `01_ANALYSIS.md`, `02_PROBLEMS.md`, and
`03_NEEDS_MORE_RESEARCH.md` in the assigned folder. Use exact file evidence,
separate confirmed findings from hypotheses, and grade P0-P3.

## Fallbacks

The requested `gpt-5.5 medium` selector is unavailable in this environment;
agents inherit the available reasoning model. A04 is handled by the main agent
because only three independent worker slots are available.
