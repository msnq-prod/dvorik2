# A02 Verification Notes

## Run

- `rg -n "enabled: false|mock|TODO|useQuery" client/src`
- `nl -ba client/src/App.tsx`
- `nl -ba client/src/components/app-sidebar.tsx`

## Skipped

- Browser QA.
- Playwright screenshots.

## Residual Risk

Без запуска UI не проверены layout, routing behavior и console errors.

