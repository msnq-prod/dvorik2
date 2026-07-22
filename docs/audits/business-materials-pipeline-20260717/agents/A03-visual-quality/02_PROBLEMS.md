# A03 — Confirmed problems

### P1-A03-01: All four delivered PPTX files are placeholder shells

- **Reality:** Across 80 slides, the body text is identical; 76 titles are “Справочный пункт”. Exact decks: `outputs/presentations/proc_current_user_api.pptx`, `proc_legacy_supply_import.pptx`, `proc_target_label_print.pptx`, `proc_target_stock_receipt.pptx`. Exact rendered evidence: all files in the four `previews/deliverable_*` directories, especially slides 1, 2, 6, 11, 16 and 20.
- **Effect:** No employee can learn what to do, what the backend does, what data changes, how success looks or how to recover from failure.
- **Fix:** Withdraw the four decks from delivery. Regenerate them only after usable learning content and role/mode boundaries pass a semantic gate.
- **Status:** confirmed.

### P1-A03-02: QA and handoff falsely certify the visual package

- **Reality:** All 80 pages are marked `source_match: passed`, fully inspected and finding-free; all eight reviews pass with no findings. Representative evidence: `qa/deliverable_proc_current_user_api.json:9-235`, `records/reviews/vrev_proc_current_user_api_content_fidelity.json:8-24`, `records/reviews/vrev_proc_current_user_api_visual_qa.json:8-25`. The handoff reports no visual gaps and status `DELIVERED_WITH_GAPS` (`98_HANDOFF.json:47-70`).
- **Contradiction:** Storyboard copy is “См. утверждение…” (`story_vunit_deliverable_proc_current_user_api_01.json:98-120`), while the deck uses another generic paragraph; therefore `source_match` is objectively false on all 80 pages.
- **Effect:** The pipeline converts file existence into apparent quality and permits unusable material to reach a client.
- **Fix:** Make release fail when visible text differs from storyboard/source blocks, when placeholder vocabulary remains, when every page has the same body, or when reviewer actor/run equals author/compositor actor/run.
- **Status:** confirmed.

### P1-A03-03: Storyboarding removes source meaning before slide composition

- **Reality:** Every linked block is marked `show`, but all 80 storyboard slides replace it with one placeholder sentence and empty `asset_ids`. Representative evidence: `story_vunit_deliverable_proc_current_user_api_01.json:11-120`; the same pattern covers all four storyboards.
- **Example:** The canonical action says “Кладовщик проводит приход как складское движение” (`records/claims/claim_target_stock_receipt_06.json:14-16`); the learning explanation only names its claim ID (`exp_lunit_proc_target_stock_receipt_normal_flow_01.json:13-19`); the storyboard then says only “См. утверждение…”.
- **Effect:** Even a competent compositor cannot build a truthful visual instruction from the accepted storyboard.
- **Fix:** Require each storyboard slide to contain audience-facing copy, a single learning job, visible lifecycle/certainty and exact source references. Reject indirect phrases such as “см. материал”, “сохранено в утверждении” and raw claim IDs.
- **Status:** confirmed.

### P1-A03-04: There is no visual instruction layer

- **Reality:** No deck contains screenshots, interface crops, icons, annotated actions, arrows, state changes, process maps or data/backend separation. Asset provenance is empty (`91_ASSET_PROVENANCE.md:1-5`); storyboard assets are empty.
- **Effect:** The original requirement—minimum text and immediate understanding by nontechnical employees—is not implemented.
- **Fix:** Build a visual grammar per process: employee action → system check → saved data → visible result → exception/recovery. Use verified application screenshots for current flows, clearly labeled conceptual diagrams for target flows, and no invented UI.
- **Status:** confirmed.

### P1-A03-05: Current, legacy and target states are visually unsafe

- **Reality:** Mode appears only in the first title. Slides 2–20 lose both process identity and lifecycle meaning. “Целевой процесс” is not explained as planned/not currently available; the `legacy` deck gives no do-not-use/current-replacement guidance.
- **Effect:** Employees can treat planned behavior as live or follow a legacy path as current.
- **Fix:** Apply persistent lifecycle chrome and a plain-language legend on every relevant slide: “Работает сейчас”, “Старый процесс”, “Планируется”. Target decks must never imitate screenshots of a nonexistent UI.
- **Status:** confirmed.

### P2-A03-06: The sequence is backwards and inflated

- **Reality:** Each 20-slide storyboard orders exceptions first, normal flow second, purpose/entry third and surrounding system last. Representative source references: `story_vunit_deliverable_proc_current_user_api_01.json:115-533`. Every slide uses the same layout and almost all canvas space is empty.
- **Effect:** The audience gets 80 slides without a learning progression, overview, decision point or useful close.
- **Fix:** Re-plan per process: goal/context → prerequisites → 3–7 core actions → backend/data response → success → exceptions/recovery → one-page recap. Merge or remove slides that do not advance the task.
- **Status:** confirmed.

### P2-A03-07: Typography violates the presentation standard

- **Reality:** Internal slide XML uses 31.5 pt for slide 1 titles and 27 pt for slides 2–20 in every deck. The required defaults are at least 50 pt for deck titles and 35 pt for slide titles.
- **Evidence:** `outputs/presentations/*.pptx`, internal members `ppt/slides/slide1.xml`, `slide2.xml`, `slide20.xml` (`sz="3150"` and `sz="2700"`).
- **Effect:** Titles are weaker than required and will be less readable on a shared screen.
- **Fix:** Use 50+ pt for opening titles, 35+ pt for slide titles, 24+ pt for step/callout headers and 16+ pt body, while reducing copy rather than shrinking it.
- **Status:** confirmed.

### P2-A03-08: Declared design system is not materially used

- **Reality:** `01_BRAND.json:15-23` declares the default-grid route and semantic colors for person, system, data, integration, success and error. The output uses only a neutral background, one outline and text; `91_ASSET_PROVENANCE.md` is empty.
- **Effect:** Roles, backend actions, data and errors are visually indistinguishable; the result is neither branded nor explanatory.
- **Fix:** Use semantic colors only for stable meanings, add a compact legend, and apply a client-approved visual identity or explicitly label the package as an unbranded draft.
- **Status:** confirmed.
