# A04 Verification Notes

## Completed

- Verified current Git commit against analysis snapshot.
- Recomputed the three source SHA-256 values; all match frozen source records.
- Recomputed current specialist skill/script SHA-256 values; all match accepted
  dependency baselines.
- Confirmed stage state/handoff status pairs and final PPTX artifact existence.
- Traced checkpoint actors, timestamps, route records, review records, and gap
  propagation.

## Required tests for implementation

- inventory cannot close when a required source class has no surface or gap;
- an unknown dimension cannot be marked covered;
- a local closure source cannot be labeled externally blocked;
- missing role/data/integration maps block a “full project” objective;
- self-review cannot satisfy independent-review gates;
- missing model assignment downgrades profile conformance;
- finalization rejects future-dated or unaccepted reviews;
- final artifact paths resolve from an explicit base;
- `assert-terminal` rejects every nonfinal state and survives resume/compaction;
- material upstream gaps appear visibly in final index and affected decks.

## Residual risk

Even perfect orchestration cannot repair incomplete or semantically empty stage
outputs. The stage-specific gates must be fixed before rerunning the pipeline.
