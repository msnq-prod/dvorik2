# Итерация 06 — Schedule, Telegram, notifications и search

## IDs
`SRCH-1001–1005`, `SCH-601–611`, `BOT-701–706`, `NTF-701–703`,
`TST-1306`.

## Ведущий агент
- утверждает VLAT date/visibility/search result contracts;
- versioned preview и swap invariants;
- Telegram callback/state/event semantics;
- единый event preference resolver.

## Параллельные волны
1. Search index/fallback/corpus.
2. Schedule state machine/templates/preview UI+tests.
3. Telegram fake API/update/callback tests.

После SearchService — BOT search. После schedule contracts — calendar/swap bot.
После event catalog — preferences/digest.

## Нельзя делегировать
Shared date helpers, visibility rules, preview token semantics, callback ownership и
общий Web/bot parity gate.

## Exit gate
- Web/bot search IDs/ranking и schedule day совпадают;
- seller privacy доказана;
- calendar edges/VLAT/multi-staff проходят;
- callbacks replay/stale/concurrency безопасны;
- notification mode matrix и digest watermark корректны.
