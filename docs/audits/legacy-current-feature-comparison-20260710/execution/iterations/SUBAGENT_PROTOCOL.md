# Протокол субагентов

## Параллелить можно

- read-only трассировку разных контуров;
- isolated fixtures/tests;
- UI после утверждения DTO;
- mapper/repository после утверждения interface;
- docs/evidence/accessibility/security review;
- изменения в непересекающихся файлах без общего transaction boundary.

## Ведущий агент оставляет себе

- source of truth и архитектурные решения;
- schema migration и compatibility;
- shared types/API/error/permission/idempotency contracts;
- transaction boundaries и integration order;
- merge конфликтов, полный gate и completion claim.

## Шаблон поручения

```text
ID/результат:
Предусловия/решения:
Разрешённые файлы:
Запрещённые файлы:
Режим: read-only | edits allowed
Контракт/output:
Negative paths:
Focused tests:
Формат ответа: files, commands/results, risks, unresolved.
```

## Приём результата

Ведущий агент проверяет diff, scope, публичный contract, негативный путь и запускает
tests сам. Сообщение «готово» без evidence не меняет status. При shared worktree
субагенту запрещено откатывать или форматировать несвязанные файлы.
