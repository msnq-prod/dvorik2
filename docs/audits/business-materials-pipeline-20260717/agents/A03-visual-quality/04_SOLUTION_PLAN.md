# A03 — Solution plan

## Release rule

Do not patch the existing four decks. Withdraw them and rebuild visual materials only after A01 confirms process coverage and A02 produces usable, role-specific learning content.

## Phase 1 — Upstream readiness gate

1. A01 supplies the complete process catalog, lifecycle mode, roles, user steps, backend behavior, data changes, integrations, success criteria and negative paths.
2. A02 converts those facts into audience-facing instructions with no raw IDs or indirect placeholders.
3. Every learning unit identifies:
   - intended role;
   - task and entry point;
   - prerequisites;
   - user actions;
   - system checks and backend actions;
   - data read/written;
   - visible result;
   - errors, retry/cancel and escalation;
   - lifecycle status and certainty.
4. Block visual production if any required field is absent, if a unit is assigned to fictitious `aud_all_staff`, or if text contains `claim_*`, “см. материал” or “сохранено в утверждении”.

## Phase 2 — Deliverable architecture

Create a package, not four arbitrary 20-slide decks:

1. **Main client overview:** system map, roles, current/legacy/target legend and links to detailed instructions.
2. **Process instructions:** one concise deck per verified business process.
3. **Role paths:** warehouse, administrator, manager, Telegram-bot user and technical operator where evidence supports them.
4. **System explainers:** Telegram bot, database/data lifecycle, integrations and background jobs.
5. **Troubleshooting:** symptom → safe action → owner → evidence to provide → success check.
6. **Quick references:** one-page summaries only after detailed flows are validated.

Recommended process-deck sequence:

1. What the employee achieves.
2. When and by whom the process is used.
3. Prerequisites and entry point.
4. Three to seven user-action steps.
5. What the system checks after each material action.
6. What data changes and where it becomes visible.
7. Success state.
8. Error/retry/cancel/escalation paths.
9. One-slide recap.

## Phase 3 — Lifecycle and certainty system

- Use persistent plain-language labels: `Работает сейчас`, `Старый процесс`, `Планируется`.
- Keep the label visible on every process slide, not only the cover.
- Separate current, legacy and target decks or sections; never blend their steps.
- Target visuals must be labeled conceptual and must not imitate an existing UI unless an approved prototype exists.
- Legacy instructions must state whether the path is still permitted and what replaces it.
- Unknown facts become explicit gaps or escalation notes, not invented steps.

## Phase 4 — Visual source collection

1. Capture real screenshots for every current UI step with stable environment/version metadata.
2. Crop and annotate only the control, status or result needed for that step.
3. Obtain verified screenshots for Telegram-bot commands and responses.
4. Build conceptual diagrams for backend/data behavior from A01 evidence; distinguish people, system, data and integrations consistently.
5. For target flows, use approved wireframes or abstract diagrams, never fabricated production screens.
6. Record every asset in provenance with source path, system version, capture date, owner and allowed usage.
7. Obtain or explicitly waive client brand assets before visual styling.

## Phase 5 — Storyboard gate

Each storyboard slide must include:

- one audience-facing takeaway title;
- one narrative job;
- exact source block references;
- final visible copy, not a pointer to other material;
- asset IDs or a justified text-only disposition;
- role, lifecycle and certainty treatment;
- expected user understanding/action.

Reject the storyboard if:

- multiple slides repeat the same body text without a documented reason;
- exceptions precede purpose and normal flow;
- no opening or closing exists;
- visible copy differs from source meaning;
- a process step has no user/system/result distinction.

## Phase 6 — Composition standard

- Use a small set of varied, task-appropriate layouts rather than one repeated card.
- Prefer screenshots, annotated sequences and state changes over paragraphs.
- Use at least 50 pt for deck titles, 35 pt for slide titles, 24 pt for step/callout headers and 16 pt for body text.
- Keep one main message per slide and remove slides that do not advance the task.
- Use semantic colors consistently for person, system, data, integration, success and error.
- Add speaker notes only when they add facilitator guidance not needed on the slide.

## Phase 7 — Automated release gates

Run before human review:

1. PPTX opens and renders every page.
2. Overflow, clipping, overlap and font checks pass.
3. Slide/page counts match deliverable records.
4. Every visible factual element maps to an accepted source block.
5. Extracted deck text semantically matches storyboard text and lifecycle/certainty.
6. Placeholder and internal-ID vocabulary is absent.
7. Duplicate-content threshold detects repeated bodies/titles across the deck.
8. Required process dimensions are visibly covered.
9. Asset IDs resolve to provenance entries.
10. Target/current/legacy labeling is present on every applicable slide.

Any failed gate keeps status `IN_PROGRESS` or `BLOCKED`; it cannot produce `DELIVERED_WITH_GAPS`.

## Phase 8 — Independent visual and fidelity QA

- Compositor and reviewer must have different actor IDs and run IDs.
- Reviewer inspects a contact sheet for flow and every slide at full size.
- Fidelity reviewer compares visible claims with source blocks and the application state.
- Visual reviewer checks hierarchy, readability, density, consistency, accessibility and asset truth.
- Findings must identify deck, slide, source and required correction.
- Re-render and repeat both reviews after any PPTX change.

## Phase 9 — Human usability verification

For each real role, ask at least one nontechnical employee to:

1. identify whether the process works now, is legacy or is planned;
2. explain where to start;
3. perform or narrate the normal flow;
4. describe what the system does and what data changes;
5. recognize success;
6. choose the correct action for an error scenario.

Release only when all critical tasks are completed without facilitator correction and wrong interpretations are resolved in the deck.

## Completion criteria

- A01 and A02 readiness gates pass.
- All requested process/system/role materials exist.
- No placeholder or unsupported slide remains.
- Automated semantic and visual checks pass.
- Independent reviews pass after final render.
- Human usability checks pass.
- Handoff lists real gaps and never claims stronger readiness than the evidence supports.
