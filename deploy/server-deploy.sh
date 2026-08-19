#!/usr/bin/env sh
set -eu

cd /home/lame/dvorik2/gpt-version

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

web_bind_address="$(grep '^DVORIK_WEB_BIND_ADDRESS=' .env.production | cut -d= -f2)"
web_port="$(grep '^DVORIK_WEB_PORT=' .env.production | cut -d= -f2)"
curl --fail --silent --show-error --retry 60 --retry-delay 2 \
  "http://${web_bind_address}:${web_port}/healthz" >/dev/null

public_url="$(grep '^DVORIK_PUBLIC_URL=' .env.production | cut -d= -f2)"
case "$public_url" in
  https://*) ;;
  *) echo "DVORIK_PUBLIC_URL must be an HTTPS URL" >&2; exit 1 ;;
esac
if [ "${DVORIK_VERIFY_PUBLIC_URL:-0}" = "1" ]; then
  curl --fail --silent --show-error --retry 60 --retry-delay 2 "$public_url/healthz" >/dev/null
fi

proxy_network="$(grep '^DVORIK_TELEGRAM_EGRESS_NETWORK=' .env.production | cut -d= -f2)"
proxy_url="$(grep '^DVORIK_TELEGRAM_PROXY_URL=' .env.production | cut -d= -f2)"
test -n "$proxy_network"
test -n "$proxy_url"
core_id="$(DVORIK_ENV_FILE=.env.production docker compose --env-file .env.production -f docker-compose.modular.yml ps -q core)"
docker network connect "$proxy_network" "$core_id"
trap 'docker network disconnect "$proxy_network" "$core_id" >/dev/null 2>&1 || true' EXIT
DVORIK_ENV_FILE=.env.production docker compose \
  --env-file .env.production \
  -f docker-compose.modular.yml \
  exec -T -e NODE_USE_ENV_PROXY=1 -e HTTPS_PROXY="$proxy_url" -e NO_PROXY=core,staff,warehouse,localhost,127.0.0.1 \
  core node dist/configure-telegram.js

echo "Dvorik deployment and Telegram bot are healthy"
