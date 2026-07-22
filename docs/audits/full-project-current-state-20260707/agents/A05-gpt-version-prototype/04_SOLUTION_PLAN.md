# A05 Solution Plan

1. Рассматривать `gpt-version` как candidate implementation.
2. Не переносить механически: сначала решить PostgreSQL vs SQLite.
3. Вынести доменную модель из `gpt-version/src/shared/types.ts` в целевой spec.
4. Если выбран корень, мигрировать по доменам: auth, products, stock, shifts, labels, imports.

