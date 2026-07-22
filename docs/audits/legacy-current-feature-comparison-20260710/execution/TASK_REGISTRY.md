# Реестр задач исполнения

Источник: `../94_FULL_COMPLETION_PLAN.md`. Статус меняется только после заполнения evidence. Допустимые статусы: `pending`, `in_progress`, `blocked`, `done`.

| ID | Phase | Priority | Dependencies | Status | Card |
|---|---:|---|---|---|---|
| DOC-001 | 0 | P0 | — | done | [card](tasks/DOC-001.md) |
| DOC-002 | 0 | P0 | DOC-001 | done | [card](tasks/DOC-002.md) |
| DOC-003 | 0 | P0 | DOC-001 | done | [card](tasks/DOC-003.md) |
| SEC-000 | 0 | P0 | SEC-001 | done | [card](tasks/SEC-000.md) |
| SEC-001 | 0 | P0 | DOC-002 | done | [card](tasks/SEC-001.md) |
| SEC-002 | 0 | P0 | SEC-001, DB-105, TX-201 | done | [card](tasks/SEC-002.md) |
| DB-101 | 1 | P0 | SEC-001 | done | [card](tasks/DB-101.md) |
| DB-102 | 1 | P0 | DB-101 | done | [card](tasks/DB-102.md) |
| DB-103 | 1 | P0 | DB-101 | done | [card](tasks/DB-103.md) |
| DB-104 | 1 | P0 | DB-101, DB-102 | done | [card](tasks/DB-104.md) |
| DB-105 | 1 | P0 | DB-104 | done | [card](tasks/DB-105.md) |
| DB-106 | 1 | P0 | DB-103, DB-105 | done | [card](tasks/DB-106.md) |
| DB-107 | 1 | P0 | DB-105, DB-106 | done | [card](tasks/DB-107.md) |
| DB-108 | 1 | P0 | DB-107, TX-203..209 | done | [card](tasks/DB-108.md) |
| DB-109 | 1 | P0 | DB-108, TX-201..209 | done | [card](tasks/DB-109.md) |
| TX-201 | 2 | P0 | DB-104, DB-105 | done | [card](tasks/TX-201.md) |
| TX-202 | 2 | P0 | TX-201 | done | [card](tasks/TX-202.md) |
| TX-203 | 2 | P0 | TX-202, DB-106 | done | [card](tasks/TX-203.md) |
| TX-204 | 2 | P0 | TX-203 | done | [card](tasks/TX-204.md) |
| TX-205 | 2 | P1 | TX-203, TX-204 | pending | — |
| TX-206 | 2 | P0 | TX-202 | done | [card](tasks/TX-206.md) |
| TX-207 | 2 | P0 | TX-202, SEC-002 | done | [card](tasks/TX-207.md) |
| TX-208 | 2 | P0 | TX-202 | pending | — |
| TX-209 | 2 | P0 | TX-202 | pending | — |
| OUT-301 | 3 | P0 | TX-201 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-302 | 3 | P0 | OUT-301 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-303 | 3 | P0 | OUT-302, DB-104 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-304 | 3 | P0 | OUT-303 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-305 | 3 | P0 | OUT-304 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-306 | 3 | P0 | OUT-304, OUT-305 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-307 | 3 | P1 | OUT-306 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| OUT-308 | 3 | P1 | OUT-305 | pending | — |
| OUT-309 | 3 | P1 | OUT-303, OUT-306 | pending | — |
| SEC-303 | 3 | P0 | DB-105 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| SEC-304 | 3 | P0 | SEC-303 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| SEC-305 | 3 | P0 | SEC-001 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| SEC-306 | 3 | P0 | SEC-001 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| SEC-307 | 3 | P1 | SEC-303 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| SEC-308 | 3 | P0 | SEC-001, SEC-306 | pending | — |
| OBS-301 | 3 | P1 | TX-201 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| OBS-302 | 3 | P0 | DB-102, OUT-306 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| OBS-303 | 3 | P1 | OBS-301, OBS-302 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| OBS-304 | 3 | P1 | OUT-306 | done | [EPIC-P4](tasks/EPIC-P4.md) |
| MIG-401 | 4 | P0 | DB-101 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| MIG-402 | 4 | P0 | DB-105 | done | [card](tasks/MIG-402.md) |
| MIG-403 | 4 | P0 | MIG-401, MIG-402 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| MIG-404 | 4 | P0 | MIG-402 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| MIG-405 | 4 | P0 | MIG-403, MIG-404 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| BKR-401 | 4 | P0 | DB-101 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| BKR-402 | 4 | P1 | BKR-401 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| BKR-403 | 4 | P0 | BKR-401 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| BKR-404 | 4 | P0 | BKR-403 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| MIG-406 | 4 | P0 | MIG-405 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| MIG-407 | 4 | P0 | MIG-406, BKR-404 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| FIX-501 | 5 | P0 | — | done | [card](tasks/FIX-501.md) |
| FIX-502 | 5 | P0 | — | done | [card](tasks/FIX-502.md) |
| FIX-503 | 5 | P0 | — | done | [card](tasks/FIX-503.md) |
| FIX-504 | 5 | P0 | SEC-001 | done | [card](tasks/FIX-504.md) |
| FIX-505 | 5 | P1 | TX-203 | pending | [card](tasks/FIX-505.md) |
| FIX-506 | 5 | P0 | TX-208 | pending | [card](tasks/FIX-506.md) |
| FIX-507 | 5 | P1 | SEC-303 | pending | [card](tasks/FIX-507.md) |
| FIX-508 | 5 | P0 | TX-204, TX-205 | pending | [card](tasks/FIX-508.md) |
| SCH-601 | 6 | P0 | DB-106 | pending | — |
| SCH-602 | 6 | P0 | TX-206 | pending | — |
| SCH-603 | 6 | P1 | TX-206 | pending | — |
| SCH-604 | 6 | P0 | DOC-002 | pending | — |
| SCH-605 | 6 | P1 | DB-107, SCH-604 | pending | — |
| SCH-606 | 6 | P1 | TX-206 | pending | — |
| SCH-607 | 6 | P1 | TX-206 | pending | — |
| SCH-608 | 6 | P1 | SCH-607 | pending | — |
| SCH-609 | 6 | P1 | TX-206 | pending | — |
| SCH-610 | 6 | P0 | TX-206 | pending | — |
| SCH-611 | 6 | P1 | SCH-601, SCH-603 | pending | — |
| BOT-701 | 7 | P0 | TX-201, OUT-303 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| BOT-702 | 7 | P1 | BOT-701, SCH-605 | pending | — |
| BOT-703 | 7 | P0 | BOT-701, TX-206 | pending | — |
| BOT-704 | 7 | P0 | BOT-701, TX-207 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| BOT-705 | 7 | P1 | SRCH-1001 | pending | — |
| BOT-706 | 7 | P1 | BOT-701, SEC-307 | pending | — |
| NTF-701 | 7 | P1 | OUT-301, OUT-303 | done | [EPIC-P3](tasks/EPIC-P3.md) |
| NTF-702 | 7 | P2 | NTF-701 | pending | — |
| NTF-703 | 7 | P0 | BOT-701, TX-202 | pending | — |
| IMP-801 | 8 | P1 | TX-208 | pending | — |
| IMP-802 | 8 | P0 | SEC-306 | pending | — |
| IMP-803 | 8 | P1 | IMP-801 | pending | — |
| IMP-804 | 8 | P0 | DB-103 | pending | — |
| IMP-805 | 8 | P1 | IMP-801, IMP-804 | pending | — |
| IMP-806 | 8 | P1 | DB-105 | pending | — |
| IMP-807 | 8 | P0 | IMP-806, TX-208 | pending | — |
| IMP-808 | 8 | P1 | TX-208 | pending | — |
| IMP-809 | 8 | P1 | IMP-801..808 | pending | — |
| RPT-901 | 9 | P0 | DB-107 | pending | — |
| RPT-902 | 9 | P1 | RPT-901 | pending | — |
| RPT-903 | 9 | P1 | RPT-901 | pending | — |
| RPT-904 | 9 | P0 | RPT-901 | pending | — |
| RPT-905 | 9 | P1 | RPT-901 | pending | — |
| RPT-906 | 9 | P1 | RPT-901, OUT-303 | pending | — |
| ARC-901 | 9 | P1 | MIG-402 | pending | — |
| ARC-902 | 9 | P1 | ARC-901 | pending | — |
| ARC-903 | 9 | P1 | ARC-902 | pending | — |
| ARC-904 | 9 | P2 | ARC-903, OUT-306 | pending | — |
| SRCH-1001 | 10 | P1 | DB-107 | pending | — |
| SRCH-1002 | 10 | P1 | SRCH-1001 | pending | — |
| SRCH-1003 | 10 | P1 | SRCH-1002 | pending | — |
| SRCH-1004 | 10 | P2 | SRCH-1002 | pending | — |
| SRCH-1005 | 10 | P1 | SRCH-1001..1004 | pending | — |
| MRG-1001 | 10 | P1 | SRCH-1002 | pending | — |
| MRG-1002 | 10 | P1 | MRG-1001 | pending | — |
| MRG-1003 | 10 | P1 | DOC-002 | pending | — |
| MRG-1004 | 10 | P1 | MRG-1002, MRG-1003 | pending | — |
| MRG-1005 | 10 | P0 | MRG-1004 | pending | — |
| MRG-1006 | 10 | P0 | MRG-1004 | pending | — |
| MRG-1007 | 10 | P0 | TX-209, MRG-1004..1006 | pending | — |
| MED-1101 | 11 | P0 | SEC-306 | pending | — |
| MED-1102 | 11 | P0 | MED-1101 | pending | — |
| MED-1103 | 11 | P1 | DB-105, MED-1102 | pending | — |
| MED-1104 | 11 | P0 | MED-1103, SEC-001 | pending | — |
| MED-1105 | 11 | P0 | SEC-308 | pending | — |
| MED-1106 | 11 | P1 | MED-1103 | pending | — |
| MED-1107 | 11 | P1 | MED-1103, MED-1104 | pending | — |
| TAB-1201 | 12 | P1 | SEC-303 | pending | — |
| TAB-1202 | 12 | P1 | TAB-1201 | pending | — |
| TAB-1203 | 12 | P1 | TAB-1202 | pending | — |
| TAB-1204 | 12 | P0 | TAB-1203, TX-205 | pending | — |
| TAB-1205 | 12 | P0 | TAB-1204 | pending | — |
| TAB-1206 | 12 | P0 | TAB-1205, TX-205 | pending | — |
| UI-1201 | 12 | P1 | — | pending | — |
| UI-1202 | 12 | P1 | UI-1201 | pending | — |
| UI-1203 | 12 | P1 | UI-1202 | pending | — |
| UI-1204 | 12 | P1 | UI-1203 | pending | — |
| UI-1205 | 12 | P1 | UI-1201 | pending | — |
| TST-1301 | 13 | P0 | DB-101 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1302 | 13 | P0 | TX-201..209 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1303 | 13 | P0 | DB-105, DB-106 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1304 | 13 | P0 | MIG-406 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1305 | 13 | P0 | SEC-306 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1306 | 13 | P0 | BOT-701..706 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1307 | 13 | P0 | OUT-304..307 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1308 | 13 | P0 | UI-1201..1205 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1309 | 13 | P0 | DB-104, OUT-305 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1310 | 13 | P0 | SEC-000..308 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1311 | 13 | P1 | DB-107 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1312 | 13 | P1 | RPT-905, UI-1204 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1313 | 13 | P0 | TST-1301..1312 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| TST-1314 | 13 | P0 | TST-1313 | done | [EPIC-P6](tasks/EPIC-P6.md) |
| REL-1401 | 14 | P0 | TST-1314 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1402 | 14 | P0 | MIG-407, BKR-404 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1403 | 14 | P0 | REL-1402 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1404 | 14 | P0 | REL-1403 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1405 | 14 | P0 | REL-1404 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1406 | 14 | P0 | REL-1405 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| REL-1407 | 14 | P0 | REL-1406 | done | [EPIC-P7](tasks/EPIC-P7.md) |
| RBK-1401 | 14 | P0 | OBS-303 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| RBK-1402 | 14 | P0 | RBK-1401 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| RBK-1403 | 14 | P0 | RBK-1402, MIG-407 | done | [EPIC-P5](tasks/EPIC-P5.md) |
| REL-1408 | 14 | P1 | REL-1407, RBK-1403 | done | [EPIC-P7](tasks/EPIC-P7.md) |

Диапазоны в dependencies обозначают все ID диапазона, а не свободную рекомендацию.
