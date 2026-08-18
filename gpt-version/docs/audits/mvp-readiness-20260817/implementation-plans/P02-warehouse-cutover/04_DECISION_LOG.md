# P02 — Decision log

| Review feedback | Decision | Final-plan change |
|---|---|---|
| Option A is the only coherent urgent MVP | accepted | Global FIFO and single writer fixed as architecture. |
| Existing seed may be stale | accepted | Added cutover-time count or complete delta bridge. |
| Quantity evidence differs from cost evidence | accepted | Split approval for both unverified lots. |
| Lineage and reproducibility were weak | accepted | Added row/cell provenance, hashes and reproducible build. |
| Rollback changes after first write | accepted | Declared point of no simple rollback and coordinated recovery. |
| First-day ownership missing | accepted | Named operating roles and scheduled checks required. |
| Options B/C | rejected | Location model and legacy fallback remain out of MVP. |
