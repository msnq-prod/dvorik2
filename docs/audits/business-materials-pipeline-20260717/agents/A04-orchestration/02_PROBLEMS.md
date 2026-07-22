# A04 Problems

### P1-A04-01: Internal closure is treated as sufficient delivery

- **Promise:** The full-cycle orchestrator should deliver materials covering the
  whole requested project scope.
- **Reality:** It finalizes whenever all *discovered* records close, even when
  the discovery contains only 4 surfaces and role/data/integration maps are empty.
- **Evidence:** `reports/coverage.json`; analysis `98_HANDOFF.json`;
  pipeline `98_HANDOFF.json`.
- **Effect:** A structurally valid but materially incomplete package can be
  presented as delivered.
- **Cause:** No objective-fulfillment gate between user scope and inventory gate.
- **Status:** confirmed.

### P1-A04-02: QA records are self-review, not independent verification

- **Promise:** Balanced routing reserves final composition/visual judgment for
  Sol and the workflow calls for independent review where available.
- **Reality:** deliverables list `visual-orchestrator` as compositor; all content
  and visual reviews list the same `visual-orchestrator` and `/root` run. Pipeline
  checkpoints contain no visual model assignment.
- **Evidence:** visual `records/deliverables/*.json`,
  `records/reviews/*.json`, pipeline checkpoints 1–6, pipeline `00_PIPELINE.json`.
- **Effect:** “passed” QA cannot establish independent visual or factual quality.
- **Cause:** Sequential fallback records review decisions but does not distinguish
  self-check from independent QA strongly enough in the client-facing report.
- **Status:** confirmed.

### P1-A04-03: Coverage reports hide the significance of known incompleteness

- **Promise:** Gaps should be visible enough for downstream consumers to avoid
  false confidence.
- **Reality:** analysis reports `actionable_issues=[]`, learning and visual report
  no open local gaps, while 2 upstream scope gaps and dozens of unknown claims
  remain. The final index does not explain their business impact.
- **Evidence:** all three `reports/coverage.json`; visual
  `90_DELIVERABLE_INDEX.md`; pipeline `98_HANDOFF.json`.
- **Effect:** A client sees finished decks without understanding that current API
  and legacy import scope are incomplete.
- **Cause:** “terminal gap” is treated as non-actionable, and the final handoff
  transports IDs rather than impact summaries.
- **Status:** confirmed.

### P1-A04-04: Full-cycle runs were allowed to end while still in progress

- **Promise:** “Complete the full cycle” should remain active until delivery or
  a real blocker.
- **Reality:** two turns ended while visual work remained, with messages saying
  the stage was “in work” although no background execution existed.
- **Evidence:** user-provided screenshots from the run; earlier pipeline state
  showed `IN_PROGRESS` at the first storyboard.
- **Effect:** wasted user intervention and misleading status.
- **Cause:** The original orchestrator lacked a machine-enforced terminal-response
  gate. The installed skill has since been updated with `assert-terminal`.
- **Status:** confirmed; guard fixed, existing run history remains affected.

### P2-A04-05: Review timestamps contradict finalization chronology

- **Promise:** finalization should happen after all accepted reviews.
- **Reality:** review JSON says `updated_at=06:28Z`; visual and pipeline handoffs
  say `finalized_at=06:26:02Z`.
- **Evidence:** visual `records/reviews/*.json`, visual `98_HANDOFF.json`, pipeline
  `98_HANDOFF.json`.
- **Effect:** audit chronology is unreliable and cannot prove which review state
  was finalized.
- **Cause:** timestamps supplied by proposals are not validated against checkpoint
  and finalization time.
- **Status:** confirmed.

### P2-A04-06: Final artifact paths have an implicit base directory

- **Promise:** the pipeline handoff should be directly consumable.
- **Reality:** `final_artifacts[*].path` is relative, but the handoff does not
  attach the visual root to each record or define the resolution rule locally.
- **Evidence:** pipeline `98_HANDOFF.json`.
- **Effect:** automated or human consumers can resolve paths against the wrong
  folder.
- **Cause:** visual artifact records were copied without normalizing or declaring
  their path base.
- **Status:** confirmed.

