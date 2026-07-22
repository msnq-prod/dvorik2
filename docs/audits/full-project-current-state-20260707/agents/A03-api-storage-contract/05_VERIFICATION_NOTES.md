# A03 Verification Notes

## Run

- `rg -n "app\\.(get|post|put|delete)" server/routes.ts`
- `rg -n "pgTable|export const" shared/schema.ts`
- `nl -ba server/routes.ts`
- `nl -ba shared/schema.ts`

## Skipped

- Typecheck.
- API smoke.
- DB connection.

## Residual Risk

Auth conclusion should be verified by reading all server files and running API checks.

