#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

[ "$#" -gt 0 ] || fail 'usage --dry-run|--apply --target-lang <language>'

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
  exec -T -e CONFIRM_UI_TRANSLATION_SEED="${CONFIRM_UI_TRANSLATION_SEED:-}" \
  backend node /app/scripts/i18n/seedApprovedUiTranslations.js "$@"
