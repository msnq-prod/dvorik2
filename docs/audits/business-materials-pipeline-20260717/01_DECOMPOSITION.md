# Decomposition

## A01: Analysis coverage and evidence

- **Boundary:** source inventory, surfaces, processes, claims, evidence, gaps, reviews, and coverage.
- **Likely files/routes:** repository entrypoints and `docs/process-analysis/dvorik-20260717/records/`, cards, reports, handoff.
- **Core questions:** Does the catalog cover the actual application? Are modes separated? Are process claims genuinely evidenced?
- **Risk focus:** severe undercoverage, fabricated completeness, weak evidence, missing bot/database/admin/automatic processes.
- **Assigned artifact folder:** `agents/A01-analysis-coverage/`

## A02: Learning fidelity and usability

- **Boundary:** audiences, learning units, explanations, reviews, troubleshooting, material plan, and learning handoff.
- **Likely files/routes:** `learning-materials/records/`, cards, indexes, reports, state, handoff.
- **Core questions:** Is every source process transformed faithfully and simply? Are employee roles and exception paths usable?
- **Risk focus:** technical language, duplicated templates, lost conditions, false certainty, missing role-specific instruction.
- **Assigned artifact folder:** `agents/A02-learning-quality/`

## A03: Visual deliverables

- **Boundary:** four PPTX files, storyboards, deliverable records, previews, content/visual QA, and visual handoff.
- **Likely files/routes:** `learning-materials/visual-materials/outputs/`, previews, records, QA, reports.
- **Core questions:** Are slides attractive, readable, non-repetitive, audience-facing, and sufficient as visual instructions?
- **Risk focus:** text density, templated sameness, misleading diagrams, internal jargon, claimed QA that misses visible defects.
- **Assigned artifact folder:** `agents/A03-visual-quality/`

## A04: Orchestration and state integrity

- **Boundary:** pipeline ledger, checkpoints, stage handoffs, status semantics, interruption/resume behavior, and final artifact index.
- **Likely files/routes:** stage `99_STATE.json`, `98_HANDOFF.json`, coverage reports, pipeline-orchestration files.
- **Core questions:** Did gates represent reality? Were gaps propagated? Did finalization happen only after real deliverables and QA?
- **Risk focus:** false completion, stale state, premature final responses, status laundering, untracked dependency drift.
- **Assigned artifact folder:** `agents/A04-orchestration/`

