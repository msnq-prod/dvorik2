# A03 — Verification notes

## Iteration 2 status

- Priorities recalibrated: A03-01 and A03-02 are P1, not P0.
- No PPTX, preview, storyboard, QA record, source record or skill implementation was modified.
- Existing findings remain confirmed.

## Confirmed evidence baseline

| Check | Result |
|---|---|
| PPTX files | 4 files, 20 slides each. |
| Rendered-slide coverage | 80/80 slides inspected through contact sheets. |
| Full-size checks | Slides 1, 2, 6, 11, 16 and 20 inspected in each deck. |
| Visible body variation | 1 unique body paragraph across 80 slides. |
| Generic titles | 76/80 titles are “Справочный пункт”. |
| Storyboard visible copy | 1 unique placeholder sentence across 80 slides. |
| Storyboard assets | 0 assets. |
| Page-level QA claims | 80/80 marked source-matched, fully inspected and finding-free. |
| Final reviews | 8/8 passed with no findings; reviewer is the same orchestrator/run. |
| Lifecycle visibility | Present only on the first title; absent on slides 2–20. |
| Visual instruction | No verified UI screenshots, annotated steps or backend/data diagrams. |
| Typography | 31.5 pt first-slide title; 27 pt remaining titles; below required defaults. |

## Inspection methods

- Reviewed all rendered PNGs as four ordered contact sheets.
- Reviewed representative slides at original 1280×720 resolution.
- Inspected `.pptx.inspect.ndjson` for slide titles, visible text, object counts and notes.
- Inspected PPTX internal slide XML for font sizes.
- Compared deck text with storyboard copy, learning explanation blocks and representative canonical claims.
- Read page-level QA, independent-review records, handoff, brand and asset-provenance artifacts.

## Acceptance tests for the rebuilt package

| Gate | Required result |
|---|---|
| Upstream readiness | A01 process coverage and A02 learning quality explicitly accepted. |
| Semantic preservation | Every factual slide element maps to source; no meaning or certainty loss. |
| Duplicate detection | Repeated body/title ratio stays below an agreed threshold; every duplicate is justified. |
| Placeholder scan | Zero `claim_*`, “см. материал”, “сохранено в утверждении”, “справочный пункт” placeholders. |
| Process completeness | Goal, role, entry, user steps, backend, data, success, errors and recovery are visibly represented. |
| Lifecycle safety | Current/legacy/target label visible and explained on every applicable slide. |
| Asset truth | Every screenshot/diagram has provenance and matches the documented system version. |
| Visual QA | All slides rendered and inspected at full size; zero unresolved clipping, overlap, wrapping or contrast issues. |
| Typography | 50+/35+/24+/16+ pt hierarchy, unless an approved client template governs it. |
| Independent review | Author/compositor and reviewers have different actor and run IDs. |
| Human test | Nontechnical users complete critical scenarios without corrective prompting. |
| Handoff | Status and gaps exactly match test results; no structurally inferred quality claims. |

## Remaining verification dependencies

- A01 final process/role/lifecycle catalog.
- A02 rebuilt learning units and their independent review.
- Product-owner decisions for target and legacy boundaries.
- Current UI and Telegram-bot captures from a known application version.
- Client branding decision.
- Named operational owners for exceptions and escalation.
- Representative employees for usability testing.
- Working presentation QA runtime with rendering dependencies available.

## Iteration 2 conclusion

The failure is reproducible from saved artifacts and requires a clean visual rebuild after upstream correction. A cosmetic edit of the current PPTX files cannot satisfy the original training objective or repair the false QA chain.
