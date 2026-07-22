# Итерация 08 — Tablet, UI, accessibility и browser E2E

## IDs
`TAB-1201–1206`, `UI-1201–1205`, `TST-1308`, оставшиеся `TST-1312`.

## Ведущий агент
- фиксирует buffer run/partial/resume semantics;
- routing/async-state/accessibility component contracts;
- device/role/browser acceptance matrix.

## Субагенты
1. Buffer draft/run/retry E2E.
2. Dialog/navigation/keyboard/axe audit и fixes.
3. Responsive screenshots/real-device checklist/PDF visual evidence.

Файлы общих UI primitives меняет одна ветвь за раз; page fixes интегрируются после
primitive contract.

## Exit gate
- lost response не дублирует buffer operations;
- seller/admin draft isolation и permissions корректны;
- 320–1440px, tablet/mobile/Telegram WebView critical flows проходят;
- keyboard 100%, axe 0 serious/critical, targets ≥44px;
- refresh/back/deep link не теряют выбранный state.
