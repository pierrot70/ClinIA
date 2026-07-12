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
  PROD)
    [ "${CONFIRM_PRODUCTION_MONGO_MIGRATIONS:-}" = "RUN_CLINIA_MONGO_MIGRATIONS" ] ||
      fail 'missing_confirmation set CONFIRM_PRODUCTION_MONGO_MIGRATIONS=RUN_CLINIA_MONGO_MIGRATIONS'
    [ "${MIGRATION_BACKUP_CONFIRMED:-}" = "YES" ] ||
      fail 'missing_backup_confirmation set MIGRATION_BACKUP_CONFIRMED=YES after verifying a recent backup'
    ;;
  *) fail "invalid_migration_env value=$MIGRATION_ENV expected=DEV|STAGING|PROD" ;;
esac

MODE="${1:---dry-run}"
shift || true
case "$MODE" in
  --dry-run|--apply) ;;
  *) fail "invalid_mode value=$MODE expected=--dry-run|--apply" ;;
esac

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

printf 'INFO mongo_migrations env=%s mode=%s\n' "$MIGRATION_ENV" "$MODE"
dc exec -T backend node /app/scripts/migrations/runMongoMigrations.js "$MODE" "$@"
