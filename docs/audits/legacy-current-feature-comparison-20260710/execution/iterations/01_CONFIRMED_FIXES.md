# Итерация 01 — Независимые подтверждённые дефекты

## IDs
`FIX-501`, `FIX-502`, `FIX-503`, `FIX-504`.

`FIX-505–508` зависят от новых transaction/application services и выполняются в
итерации 03/05, чтобы не закреплять переходную архитектуру.

## Ведущий агент
- фиксирует DTO reports и visibility contract;
- выбирает временный upload-limit bridge до multipart;
- утверждает обязательный image processor/config gate;
- не расширяет scope до полного media lifecycle.

## Субагенты
1. Reports DTO/API/UI contract test (`reports.ts`, `ReportsPage`).
2. Seller schedule privacy regression test/UI/API trace.
3. Media limit/compression capability tests и dependency review.

## Integration order
Contracts/tests → backend → UI → full gate. Shared types меняет только ведущий.

## Exit gate
- movements UI не падает;
- seller не видит чужие shifts;
- фактический upload limit совпадает с UI/API;
- production compression capability обязательна;
- `check/test/build` и browser smoke.
