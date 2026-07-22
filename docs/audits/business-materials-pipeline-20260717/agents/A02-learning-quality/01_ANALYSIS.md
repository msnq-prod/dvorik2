# A02 — Learning fidelity and usability

## Iteration

Iteration 1 only. Read-only audit; generated artifacts and product code were not changed.

## Inspected scope

- `learning-materials/00_INPUT.json`, `01_AUDIENCES.json`, `98_HANDOFF.json`, `99_STATE.json`;
- `learning-materials/reports/coverage.json`;
- all 16 learning units, 16 explanations and 32 learning reviews;
- process cards and indexes `90`–`94`;
- representative proposals and packets;
- all four canonical process records and their 80 source claims;
- upstream gaps and representative upstream reviews.

## Trace and source-of-truth

The canonical business content is in `records/claims/*.json`; learning units group those claims and explanations should translate them for an audience. For example:

- `records/claims/claim_target_stock_receipt_06.json:14-16` says that a storekeeper records receipt as a stock movement;
- `records/claims/claim_target_stock_receipt_09.json` says what stock data is stored;
- `records/claims/claim_target_stock_receipt_10.json` states the negative-stock rule;
- the learning packet points to these exact claim files (`learning-materials/packets/lunit_proc_target_stock_receipt_normal_flow_01.json:4-15`);
- the accepted explanation replaces their contents with record references such as “Целевое требование сохранено…” (`learning-materials/records/explanations/exp_lunit_proc_target_stock_receipt_normal_flow_01.json:11-56`).

Therefore the useful source content was available to the learning stage and was lost during transformation, not missing from its input.

## Quantitative observations

- 4 input processes became 16 units, 16 explanations and 4 deliverables.
- The 16 explanations contain 80 blocks: 49 `system_action`, 31 `escalation`, 0 user-action/result/data/warning blocks.
- All 49 known-fact blocks are metadata sentences that only name a claim ID; all 31 unknown blocks repeat one identical sentence.
- Every explanation has `terms: []`; the generated glossary says “No terms recorded” (`92_PLAIN_GLOSSARY.md:1-3`).
- All 16 clarity and all 16 fidelity reviews are `passed`, have zero findings, and identify `learning-orchestrator` / `/root` as reviewer; representative evidence is at `learning-materials/records/reviews/lrev_lunit_proc_target_stock_receipt_normal_flow_01_clarity.json:9-25` and `learning-materials/records/reviews/lrev_lunit_proc_target_stock_receipt_normal_flow_01_fidelity.json:9-25`.
- Coverage reports 16 units, no unit issues, no actionable issues and no learning gaps (`reports/coverage.json:1-18`).

## Usability assessment

| Requirement | Result | Evidence |
|---|---|---|
| Simple language | Failed | Cards expose internal IDs, `current`/`legacy`/`target`, `system_action`, `escalation`, `claim_*`; glossary is empty. |
| Employee action | Failed | Claim `claim_target_stock_receipt_06` contains an action, but its learning block is typed `system_action` and only references the claim ID (`learning-materials/records/explanations/exp_lunit_proc_target_stock_receipt_normal_flow_01.json:13-19`). |
| Backend behavior | Failed | Confirmed API behavior is present in `records/claims/claim_current_user_api_03.json:14-16`, while the card only says an observation was saved in that claim (`learning-materials/cards/processes/proc_current_user_api.md:36-40`). |
| Data read/write | Failed | Source claims describe query parameters and stock/history data; learning blocks contain no data description. |
| Errors and recovery | Failed | Troubleshooting repeats a generic “confirm before action” message with no symptom, owner, recovery step or success check (`learning-materials/93_TROUBLESHOOTING_INDEX.md:3-56`). |
| Roles | Failed | Only one audience exists; it has no responsibilities or source roles (`learning-materials/records/audiences/aud_all_staff.json:19-30`). |
| Certainty | Structurally preserved, operationally failed | `certain` / `declared` / `unknown` survive in JSON and cards, but their meaning is not explained and target material is still called a process instruction. |
| Mode separation | Structurally preserved, operationally risky | Cards retain mode, but English lifecycle labels are not explained and all modes are taught to all staff. |
| Coverage/handoff | Structurally complete, semantically false | All IDs are linked, yet content is not instructional; own gap registry is empty and status is `READY_WITH_GAPS` (`learning-materials/98_HANDOFF.json:39-75`). |

## Commands/checks used

- `find .../learning-materials -type f`
- `nl -ba <artifact>` for exact line evidence
- `jq` aggregation of claim text/status/dimension, block type/certainty/text and review actor/decision
- `rg` for action block types, terms and business vocabulary
- counts of explanations, units, reviews and checkpoints

## Overall conclusion

The learning stage achieved referential traceability but not learning transformation. It produced a machine-linked catalog of placeholders, not usable instructions for nontechnical employees. Its own review and coverage gates did not detect this semantic failure.
