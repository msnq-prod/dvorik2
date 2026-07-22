# Scope

## Target

Полный разбор локального workspace `/Users/nikitamysnik/Documents/дворик` на текущее состояние проекта.

## Included

- основной tracked repo `msnq-prod/dvorik2`;
- React/Express/Drizzle scaffold в корне;
- текущие страницы admin UI;
- backend API, storage layer, schema;
- `docs/crm` и старый аудит `docs/audits/crm-requirements-20260623`;
- `gpt-version` как отдельный складской WebApp-прототип;
- `recovered-dvorik` как восстановленная Python/Telegram/Flask-система;
- локальное ТЗ `ТЗ-склад-смены-маркировки`.

## Boundaries

- Код не менять.
- Не считать UI-экран реализованным бизнес-процессом без schema/API/storage.
- Разделять основной репозиторий, незакоммиченные справочные папки и альтернативные прототипы.

## Current Repo Identity

- `origin`: `https://github.com/msnq-prod/dvorik2.git`
- git status на старте: есть существующие незакоммиченные `.DS_Store`, `docs/`, `gpt-version/`, `recovered-dvorik/`, `dvorik-docs-staging/`, `ТЗ-склад-смены-маркировки/`.

## Non-goals

- Исправления кода.
- Деплой.
- Миграции БД.
- Выбор финальной архитектуры без отдельного решения пользователя.

## Verification Constraints

- Используется локальная статическая инспекция файлов.
- Live-сервер и БД не запускались на первом проходе.
- Проверки команд будут добавлены после завершения карты текущего состояния.

## Prior Context

- По памяти и текущим файлам: корневой проект был scaffold программы лояльности, не складская CRM.
- `docs/crm` уже содержит требования к складу/сменам/маркировкам.
- `gpt-version` и `recovered-dvorik` содержат более близкую к целевой предметной области реализацию, но не являются tracked-основой корневого repo.
