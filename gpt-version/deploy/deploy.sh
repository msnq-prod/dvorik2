#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

test -f .env.production || {
  echo "Missing .env.production" >&2
  exit 1
}

DVORIK_ENV_FILE=.env.production docker compose \
  --env-file .env.production \
  -f docker-compose.modular.yml \
  up -d --build --remove-orphans

DVORIK_ENV_FILE=.env.production docker compose \
  --env-file .env.production \
  -f docker-compose.modular.yml \
  ps

curl --fail --silent --show-error --retry 20 --retry-delay 2 \
  http://127.0.0.1:"$(grep '^DVORIK_WEB_PORT=' .env.production | cut -d= -f2)"/healthz >/dev/null

echo "Dvorik deployment is healthy"
