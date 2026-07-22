# A03 — Needs more research

## Required before visual rebuild

1. **Repair upstream learning content.** The visual stage must not run until learning blocks contain real actions, system behavior, data, results and recovery steps instead of claim references. Coordinate with A02.
2. **Confirm coverage.** The current visual package contains only four processes and no Telegram-bot, database, role-specific or application-overview deck. Recompute the visual plan after A01 establishes the complete process catalog.
3. **Confirm lifecycle boundaries.** Product ownership must state which target flows are conceptual only, whether legacy import may still be used, and what current replacement exists.
4. **Identify real audiences.** Replace `aud_all_staff` with verified roles and responsibilities before choosing screenshots, terminology and sequence.
5. **Collect trustworthy visual sources.** Capture the actual UI for current/legacy flows and obtain approved conceptual states for target flows. Do not invent controls or screens.
6. **Define client identity.** Obtain logo, brand colors, type and tone, or explicitly approve a neutral system. Current `default_grid` treatment is not a client brand.
7. **Define exception ownership.** For every stop/retry/error slide, identify the responsible role, escalation contact, required evidence and success check.
8. **Independent QA design.** Specify a reviewer who did not author/compose the deck and a release checklist that checks source meaning, lifecycle safety, visible actionability and slide-by-slide render quality.
9. **Usability test.** Ask at least one nontechnical representative of each real role to explain and perform the process from the rebuilt deck; record wrong interpretations and revise.

## Verification limits in Iteration 1

- No representative employees or product owners were available.
- Existing rendered PNGs were visually inspected; the bundled `slides_test.py` could not be rerun with the default Python because `pdf2image` was unavailable. PPTX XML and existing render outputs were still inspected directly.
- This pass audited generated visual artifacts and their contracts, not the visual skill implementation.
