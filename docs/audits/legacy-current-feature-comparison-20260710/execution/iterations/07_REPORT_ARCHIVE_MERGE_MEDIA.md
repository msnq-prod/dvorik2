# Итерация 07 — Reports, archive, merge и media lifecycle

## IDs
`RPT-901–906`, `ARC-901–904`, `MRG-1001–1007`, `MED-1101–1107`,
`SEC-308`, `TST-1310–1312` (focused части).

## Contract checkpoint
- report query/row/artifact DTO;
- archive timestamps/candidate/restore policy;
- candidate score и full merge resolution model;
- media record/variant/storage/delete lifecycle;
- единый SSRF redirect/DNS contract.

## Субагенты
1. Reports CSV/PDF/visual fixtures после DTO.
2. Candidate engine/merge UI после resolution model.
3. Media processor/storage/SSRF tests после record interface.

Archive transaction/scheduler и cross-domain dependencies интегрирует ведущий.

## Integration order
Shared schema/contracts → report/archive services → merge engine → media lifecycle →
UIs → security/visual/performance gates.

## Exit gate
- JSON/CSV/PDF/UI одинаковы и PDF portable;
- archived receipt/reactivation/sweep race безопасны;
- merge stale/identifier/balance/undo полностью проверены;
- multipart/image variants/object storage/delete/SSRF работают;
- report/media artifacts не хранятся base64 в DB.
