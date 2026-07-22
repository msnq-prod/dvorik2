# A05 Verification Notes

## Run

- `nl -ba gpt-version/README.md`
- `sed -n` по `gpt-version/src/server/index.ts`
- `sed -n` по `gpt-version/src/server/domain.ts`
- `sed -n` по `gpt-version/src/shared/types.ts`
- `npm run check`: passed.

## Skipped

- `npm run test`
- `npm run build`

## Residual Risk

README claims need runtime verification.
