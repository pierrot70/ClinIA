#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/clinia}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
MONGO_DATABASE="${MONGO_DATABASE:-clinia}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_SERVICE_NAME="${ALERT_SERVICE_NAME:-clinia-mongo-backup}"
ALERT_ON_SUCCESS="${ALERT_ON_SUCCESS:-false}"

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

send_alert() {
  local status="$1"
  local message="$2"

  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    printf 'WARN alert_skipped reason=curl_missing\n' >&2
    return
  fi

  curl -fsS \
    -X POST \
    -H 'Content-Type: application/json' \
    --data "{\"service\":\"$ALERT_SERVICE_NAME\",\"status\":\"$status\",\"message\":\"$message\"}" \
    "$ALERT_WEBHOOK_URL" >/dev/null || true
}

cleanup_old_backups() {
  if [[ "$BACKUP_RETENTION_DAYS" -le 0 ]]; then
    info "retention=disabled days=$BACKUP_RETENTION_DAYS"
    return
  fi

  find "$BACKUP_OUTPUT_DIR" \
    -type f \
    \( -name "${BACKUP_LABEL}-*.archive.gz" -o -name "${BACKUP_LABEL}-*.archive.gz.sha256" \) \
    -mtime +"$BACKUP_RETENTION_DAYS" \
    -print \
    -delete

  find "$BACKUP_LOG_DIR" \
    -type f \
    -name 'mongo-backup-*.log' \
    -mtime +"$BACKUP_RETENTION_DAYS" \
    -print \
    -delete
}

require_command find
require_command mkdir

mkdir -p "$BACKUP_OUTPUT_DIR" "$BACKUP_LOG_DIR"
chmod 700 "$BACKUP_OUTPUT_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
log_path="${BACKUP_LOG_DIR%/}/mongo-backup-${timestamp}.log"

if ! {
  info "backup_started timestamp=$timestamp output_dir=$BACKUP_OUTPUT_DIR retention_days=$BACKUP_RETENTION_DAYS"

  backup_output="$(
    BACKUP_OUTPUT_DIR="$BACKUP_OUTPUT_DIR" \
    BACKUP_LABEL="$BACKUP_LABEL" \
    MONGO_DATABASE="$MONGO_DATABASE" \
    MONGO_CONTAINER_PREFIX="$MONGO_CONTAINER_PREFIX" \
    "$SCRIPT_DIR/backup-mongo.sh"
  )"

  printf '%s\n' "$backup_output"

  backup_archive="$(
    printf '%s\n' "$backup_output" |
      sed -n 's/^INFO archive=//p' |
      tail -n1
  )"

  if [[ -z "$backup_archive" ]]; then
    fail 'backup_archive_not_reported'
  fi

  "$SCRIPT_DIR/verify-mongo-backup.sh" "$backup_archive"
  cleanup_old_backups

  info "backup_completed archive=$backup_archive log=$log_path"
} >"$log_path" 2>&1; then
  printf 'ERROR scheduled_backup_failed log=%s\n' "$log_path" >&2
  send_alert "failed" "Mongo backup failed on $(hostname); see $log_path"
  cat "$log_path" >&2
  exit 1
fi

if [[ "$ALERT_ON_SUCCESS" == "true" ]]; then
  send_alert "ok" "Mongo backup completed on $(hostname); see $log_path"
fi

cat "$log_path"
