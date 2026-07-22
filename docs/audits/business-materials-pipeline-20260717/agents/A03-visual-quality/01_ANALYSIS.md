# A03 — Visual deliverables and presentation QA

## Iteration

Iteration 1 only. Read-only audit; PPTX, previews, storyboards and QA records were not changed.

## Scope inspected

- all four PPTX files in `learning-materials/visual-materials/outputs/presentations/`;
- all 80 rendered slides in the four preview directories, as four contact sheets;
- slides 1, 2, 6, 11, 16 and 20 of every deck at full size;
- all four storyboards, four visual units, four deliverable records, four page-level QA records and eight final reviews;
- the visual handoff, brand record and asset provenance;
- the corresponding accepted learning explanations and representative canonical claims.

## Deck-by-deck result

| Deck | Slides | Visible result | Client-ready |
|---|---:|---|---|
| `outputs/presentations/proc_current_user_api.pptx` | 20 | Slide 1 says “Текущий API: справочный материал”; slides 2–20 say “Справочный пункт”. All 20 repeat the same generic paragraph. Evidence: `previews/deliverable_proc_current_user_api/slide-1.png`, `slide-2.png`, `slide-6.png`, `slide-11.png`, `slide-16.png`, `slide-20.png`; the complete sequence is recorded in `proc_current_user_api.pptx.inspect.ndjson`. | No |
| `outputs/presentations/proc_legacy_supply_import.pptx` | 20 | Only slide 1 identifies legacy import; slides 2–20 are the same generic reference slide. Evidence: `previews/deliverable_proc_legacy_supply_import/slide-1.png` through `slide-20.png`. | No |
| `outputs/presentations/proc_target_label_print.pptx` | 20 | Only slide 1 identifies label printing as a target process; no user action, print preview, label, state or error is shown. Slides 2–20 are generic. Evidence: `previews/deliverable_proc_target_label_print/slide-1.png` through `slide-20.png`. | No |
| `outputs/presentations/proc_target_stock_receipt.pptx` | 20 | Only slide 1 identifies warehouse movement; no receipt sequence, actor, backend action, stock change or exception is shown. Slides 2–20 are generic. Evidence: `previews/deliverable_proc_target_stock_receipt/slide-1.png` through `slide-20.png`. | No |

## Quantitative observations

- The 80 slides contain one identical body paragraph: “Сведения этого пункта приведены в учебном материале…”.
- 76 of 80 slide titles are exactly “Справочный пункт”.
- All 80 storyboards use one placeholder copy: “См. утверждение в учебном материале.” and have no assets. Representative evidence: `records/storyboards/story_vunit_deliverable_proc_current_user_api_01.json:98-120`; the same pattern continues through line 542 and exists in all four storyboard files.
- Storyboard copy does not match deck copy, and neither reproduces the linked learning block. For example, `exp_lunit_proc_target_stock_receipt_normal_flow_01.json:13-19` points to `claim_target_stock_receipt_06`, whose actual action is “Кладовщик проводит приход как складское движение” (`records/claims/claim_target_stock_receipt_06.json:14-16`). None of these meanings appears on the corresponding slides.
- The four QA files mark all 80 pages `source_match: passed`, `full_size_inspected: true` and findings empty. Representative evidence: `qa/deliverable_proc_current_user_api.json:9-118`; the file continues identically through line 235.
- All eight content/visual reviews are `passed` with no findings. The authoring and reviewing actor is the same `visual-orchestrator` run; representative evidence: `records/reviews/vrev_proc_current_user_api_content_fidelity.json:8-24` and `vrev_proc_current_user_api_visual_qa.json:8-25`.
- `91_ASSET_PROVENANCE.md:1-5` contains no assets. The brand record declares `default_grid` and semantic colors (`01_BRAND.json:9-25`), but the decks use only one white card, one accent outline and text.
- PPTX XML uses 31.5 pt on slide 1 and 27 pt on slides 2–20; this is below the Presentations skill minimum of 50 pt for a deck title and 35 pt for slide titles. Evidence: each deck's internal `ppt/slides/slide1.xml`, `slide2.xml` and `slide20.xml` (`a:rPr sz="3150"` / `sz="2700"`). Body text is 18 pt.
- Speaker notes are empty in all 80 slides.

## Visual and instructional assessment

| Criterion | Result |
|---|---|
| Opens/renders | Passed from existing previews and deck inspection records. |
| Clipping/overlap | No visible clipping or unintended overlap in the 80 rendered previews. |
| Basic contrast | Adequate: dark blue text on light background; teal outline is visible. |
| Readability | Body is readable at full size, but meaning is absent; titles are undersized relative to the required presentation standard. |
| Visual instruction | Failed: no screenshots, icons, process maps, state transitions, backend/data split, error path or before/after state. |
| Narrative | Failed: decks start with exception-linked blocks, then normal flow, then purpose/entry, then surrounding system; there is no deliberate opening, learning progression or closing. Representative ordering: `story_vunit_deliverable_proc_current_user_api_01.json:115-533`. |
| Information density | Failed in the opposite direction: 20 slides per process are mostly empty and repeat one sentence, creating 80-slide volume without information. |
| Consistency | Mechanically consistent, but only because one placeholder layout is repeated. |
| Source fidelity | Failed on all 80 slides: visible copy does not match storyboard copy or linked learning content. |
| Lifecycle safety | Failed: `current`, `legacy` and `target` are not explained; after slide 1 the process/mode context disappears. |
| Client readiness | Failed. The files must not be sent to a client or used for employee training. |

## Overall conclusion

The visual stage produced four technically renderable placeholder decks, not visual instructions. It discarded linked content twice—first in the storyboard, then again in composition—and its QA certified the result as delivered. The package is structurally complete but semantically empty.
