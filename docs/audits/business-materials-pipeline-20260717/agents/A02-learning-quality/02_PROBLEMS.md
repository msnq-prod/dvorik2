# A02 — Confirmed problems

### P1-A02-01: Source content is replaced by claim-ID placeholders

- **Promise:** Turn canonical process analysis into simple, actionable employee explanations.
- **Reality:** Every known-fact block says only that a fact is stored in a named claim. For example, the source says “Кладовщик проводит приход как складское движение” (`records/claims/claim_target_stock_receipt_06.json:14-16`), while the learning output says “Целевое требование сохранено в исходном утверждении claim_target_stock_receipt_06” (`learning-materials/records/explanations/exp_lunit_proc_target_stock_receipt_normal_flow_01.json:13-19`). The same pattern covers all 49 known blocks.
- **Effect:** A staff member cannot learn what to do, what the system does, what data changes or how to verify success.
- **Cause:** Semantic transformation was replaced by a traceability template.
- **Status:** confirmed.

### P1-A02-02: Review and coverage gates pass unusable material

- **Promise:** Fidelity and clarity reviews check conditions, actionability, terminology, visible results and audience fit.
- **Reality:** The target stock normal-flow explanation contains only five claim references (`learning-materials/records/explanations/exp_lunit_proc_target_stock_receipt_normal_flow_01.json:11-56`), but both reviews pass with no findings (`learning-materials/records/reviews/lrev_lunit_proc_target_stock_receipt_normal_flow_01_clarity.json:9-25`, `learning-materials/records/reviews/lrev_lunit_proc_target_stock_receipt_normal_flow_01_fidelity.json:9-25`). All 32 reviews have the same reviewer actor/run and zero findings. Coverage reports no actionable issues (`learning-materials/reports/coverage.json:1-18`).
- **Effect:** Broken learning content is certified and passed to visual production, laundering structural completeness into apparent quality.
- **Cause:** Gates validate links/status fields, not preservation of meaning or real task completion; review is not independent.
- **Status:** confirmed.

### P1-A02-03: One fictitious “all staff” audience replaces actual roles

- **Promise:** Give role-specific instructions to warehouse, administrator, manager and other affected staff.
- **Reality:** The sole audience admits that roles were not identified, has no responsibilities or source roles, yet is marked ready and receives all four processes (`learning-materials/records/audiences/aud_all_staff.json:5-30`). This includes `proc_current_user_api`, which upstream classifies as technical and gives no role IDs (`records/processes/proc_current_user_api.json:25`, `records/processes/proc_current_user_api.json:197-205`). The role index is therefore one row mapping everybody to everything (`learning-materials/91_ROLE_LEARNING_INDEX.md:1-5`).
- **Effect:** Employees receive irrelevant technical material while no role gets a concrete responsibility, entry point or escalation boundary.
- **Cause:** Missing upstream roles were silently collapsed into a universal audience instead of becoming a blocking learning gap.
- **Status:** confirmed.

### P1-A02-04: Current, legacy and target behavior are packaged as equivalent instructions

- **Promise:** Preserve lifecycle certainty so users know what works now versus what is historical or only planned.
- **Reality:** Machine fields retain `current`, `legacy` and `target`, but every process is assigned `action: teach` and deliverable type `process_instruction` (`learning-materials/records/plans/mplan_primary.json:2-90`). Target requirements are rendered as `system_action` blocks (`learning-materials/records/explanations/exp_lunit_proc_target_stock_receipt_normal_flow_01.json:13-55`) and the glossary does not explain the lifecycle labels (`learning-materials/92_PLAIN_GLOSSARY.md:1-3`).
- **Effect:** A nontechnical employee can reasonably interpret planned behavior as available application behavior and follow a nonexistent flow.
- **Cause:** Certainty was preserved only as metadata, not converted into a visible operational warning and disposition.
- **Status:** confirmed.

### P1-A02-05: Troubleshooting provides no executable recovery path

- **Promise:** Explain errors, retries and “what to do when something goes wrong.”
- **Reality:** The troubleshooting index repeats one generic escalation sentence, without symptom, action, owner, contact, retry/cancel rule or success check (`learning-materials/93_TROUBLESHOOTING_INDEX.md:3-56`). It contains sections only for current API and legacy import; target exceptions are absent even though target exception units exist (`learning-materials/records/units/lunit_proc_target_stock_receipt_exceptions_01.json:16-24`).
- **Effect:** Staff cannot resolve or safely escalate failures; the index cannot serve as a workplace instruction.
- **Cause:** Index generation selects generic unknown blocks instead of converting error/recovery claims and gaps into scenario-based guidance.
- **Status:** confirmed.

### P2-A02-06: Internal vocabulary is exposed while the glossary is empty

- **Promise:** Plain-language material for people far from IT.
- **Reality:** Cards and indexes expose `API`, `current`, `legacy`, `target`, `system_action`, `escalation`, `claim_*` and process IDs (`learning-materials/cards/processes/proc_current_user_api.md:1-16`), while every explanation has an empty terms list and the glossary records no terms (`learning-materials/92_PLAIN_GLOSSARY.md:1-3`).
- **Effect:** The package requires technical context and knowledge of its internal evidence model.
- **Cause:** Terminology extraction and audience-level rewriting were not performed, despite clarity reviews claiming terminology and audience fit were checked.
- **Status:** confirmed.

### P2-A02-07: The instructional sequence starts with exceptions and repeats one non-learning objective

- **Promise:** Lead a novice from purpose and entry point through actions, backend behavior, result and exceptions.
- **Reality:** Every deliverable orders `exceptions`, then `normal_flow`, then `purpose_and_entry`, then `surrounding_system` (`learning-materials/records/plans/mplan_primary.json:10-15`, `learning-materials/records/plans/mplan_primary.json:27-35`, `learning-materials/records/plans/mplan_primary.json:44-52`, `learning-materials/records/plans/mplan_primary.json:61-69`). All sections repeat “Сотрудник различает… степень определённости” instead of a task outcome (`learning-materials/cards/processes/proc_target_stock_receipt.md:6-46`).
- **Effect:** Even after factual content is restored, the material will remain hard to follow and optimized for audit metadata rather than work performance.
- **Cause:** Unit taxonomy was copied directly into delivery order without an instructional-design pass.
- **Status:** confirmed.

### P1-A02-08: Learning handoff reports no own gaps despite failed readiness

- **Promise:** `READY_WITH_GAPS` should expose every unresolved learning limitation before visual production.
- **Reality:** The handoff has `open_learning_gap_ids: []` and lists only two propagated upstream gaps (`learning-materials/98_HANDOFF.json:39-75`); coverage likewise reports no learning gaps or actionable issues (`learning-materials/reports/coverage.json:1-18`). Missing roles, absent instructions, empty glossary and ineffective troubleshooting are not represented as gaps.
- **Effect:** Downstream visual production receives no machine-readable reason to stop and can turn placeholders into polished but misleading deliverables.
- **Cause:** Gap accounting covers source availability, not fitness for learning or operational use.
- **Status:** confirmed.
