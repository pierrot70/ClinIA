#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
MIGRATION_ENV="${MIGRATION_ENV:-STAGING}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

case "$MIGRATION_ENV" in
  DEV|STAGING) ;;
  *) fail "invalid_migration_env value=$MIGRATION_ENV expected=DEV|STAGING" ;;
esac

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

printf 'INFO reversible_numeric_migration_drill env=%s\n' "$MIGRATION_ENV"
dc exec -T backend node /app/scripts/migrations/drills/reversibleNumericMigrationDrill.js
