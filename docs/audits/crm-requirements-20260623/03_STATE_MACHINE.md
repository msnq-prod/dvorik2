# State machines

## Смена

`draft → scheduled → in_progress → completed`

Допустима отмена `draft|scheduled → cancelled`. Завершённая или отменённая смена не редактируется без отдельной административной операции.

## Сотрудник

`active → inactive`. История смен сохраняется.

## Товар

`active → archived`. Архивный товар нельзя добавлять в новые складские документы и задания печати.

## Инвентаризация

`draft → counting → completed|cancelled`. Остатки меняются только при переходе в `completed`.

## Задание печати

`draft → generating → ready|failed`. Повторная печать создаёт новое задание со ссылкой на исходное.
