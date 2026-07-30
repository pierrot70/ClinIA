#!/usr/bin/env bash

set -euo pipefail

BACKEND_CONTAINER_PREFIX="${BACKEND_CONTAINER_PREFIX:-backend-}"
BACKEND_CONTAINER_EXCLUDE_PREFIX="${BACKEND_CONTAINER_EXCLUDE_PREFIX:-backend-replica-}"
BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
BACKUP_VERIFY_SCRIPT="${BACKUP_VERIFY_SCRIPT:-/opt/clinia/scripts/verify-mongo-backup.sh}"
BACKUP_ENCRYPTION_ENV_FILE="${BACKUP_ENCRYPTION_ENV_FILE:-/root/clinia-backup-encryption.env}"
MIGRATION_BACKUP_ARCHIVE="${MIGRATION_BACKUP_ARCHIVE:-}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"
CONFIRM_PRODUCTION_MONGO_MIGRATIONS="${CONFIRM_PRODUCTION_MONGO_MIGRATIONS:-}"
MIGRATION_BACKUP_CONFIRMED="${MIGRATION_BACKUP_CONFIRMED:-}"

if [[ -f "$BACKUP_ENCRYPTION_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$BACKUP_ENCRYPTION_ENV_FILE"
  set +a
fi

BACKUP_DASHBOARD_READER_GID="${BACKUP_DASHBOARD_READER_GID:-}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'INFO %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

find_backend_container() {
  docker ps --format '{{.Names}}' |
    awk -v prefix="$BACKEND_CONTAINER_PREFIX" -v exclude="$BACKEND_CONTAINER_EXCLUDE_PREFIX" '
      index($1, prefix) == 1 && (exclude == "" || index($1, exclude) != 1) {
        print $1
        exit
      }
    '
}

find_latest_backup() {
  find "$BACKUP_OUTPUT_DIR" \
    -maxdepth 1 \
    -type f \
    \( -name "${BACKUP_LABEL}-*.archive.gz" -o -name "${BACKUP_LABEL}-*.archive.gz.age" \) \
    -printf '%T@ %p\n' |
    sort -nr |
    awk 'NR == 1 { $1=""; sub(/^ /, ""); print }'
}

verify_backup_preflight() {
  local archive="$1"
  local now_epoch archive_epoch age_seconds max_age_seconds

  [[ -x "$BACKUP_VERIFY_SCRIPT" ]] || fail "backup_verify_script_not_executable path=$BACKUP_VERIFY_SCRIPT"
  [[ -n "$archive" ]] || fail "backup_archive_not_found dir=$BACKUP_OUTPUT_DIR label=$BACKUP_LABEL"
  [[ -f "$archive" ]] || fail "backup_archive_not_found path=$archive"
  [[ "$MAX_BACKUP_AGE_HOURS" =~ ^[0-9]+$ ]] || fail "invalid_max_backup_age_hours value=$MAX_BACKUP_AGE_HOURS"

  now_epoch="$(date +%s)"
  archive_epoch="$(stat -c '%Y' "$archive")"
  age_seconds=$((now_epoch - archive_epoch))
  max_age_seconds=$((MAX_BACKUP_AGE_HOURS * 3600))

  if (( age_seconds < 0 || age_seconds > max_age_seconds )); then
    fail "backup_too_old archive=$archive age_seconds=$age_seconds max_age_seconds=$max_age_seconds"
  fi

  if [[ -n "$BACKUP_DASHBOARD_READER_GID" ]]; then
    EXPECTED_PERMISSIONS=640 "$BACKUP_VERIFY_SCRIPT" "$archive"
  else
    "$BACKUP_VERIFY_SCRIPT" "$archive"
  fi
  info "backup_preflight=ok archive=$archive age_seconds=$age_seconds"
}

MODE="${1:---dry-run}"
shift || true
case "$MODE" in
  --dry-run|--apply) ;;
  *) fail "invalid_mode value=$MODE expected=--dry-run|--apply" ;;
esac

require_command awk
require_command docker
require_command find
require_command stat

if ! docker info >/dev/null 2>&1; then
  fail 'docker_unavailable'
fi

BACKEND_CONTAINER="$(find_backend_container)"
[[ -n "$BACKEND_CONTAINER" ]] || fail "backend_container_not_found prefix=$BACKEND_CONTAINER_PREFIX"

if [[ "$MODE" == "--apply" ]]; then
  [[ "$CONFIRM_PRODUCTION_MONGO_MIGRATIONS" == "RUN_CLINIA_MONGO_MIGRATIONS" ]] ||
    fail 'missing_confirmation set CONFIRM_PRODUCTION_MONGO_MIGRATIONS=RUN_CLINIA_MONGO_MIGRATIONS'
  [[ "$MIGRATION_BACKUP_CONFIRMED" == "YES" ]] ||
    fail 'missing_backup_confirmation set MIGRATION_BACKUP_CONFIRMED=YES after reviewing the verified archive'

  selected_backup="${MIGRATION_BACKUP_ARCHIVE:-$(find_latest_backup)}"
  verify_backup_preflight "$selected_backup"
fi

info "production_mongo_migrations mode=$MODE backend_container=$BACKEND_CONTAINER"
docker exec "$BACKEND_CONTAINER" node /app/scripts/migrations/runMongoMigrations.js "$MODE" "$@"
