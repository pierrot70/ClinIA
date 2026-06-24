#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_KEEP_DIR="${BACKUP_KEEP_DIR:-/var/backups/clinia/mongo-keep}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/clinia}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
MONGO_DATABASE="${MONGO_DATABASE:-clinia}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_WEBHOOK_BEARER_TOKEN="${ALERT_WEBHOOK_BEARER_TOKEN:-}"
ALERT_WEBHOOK_HEADER="${ALERT_WEBHOOK_HEADER:-}"
ALERT_TIMEOUT_SECONDS="${ALERT_TIMEOUT_SECONDS:-10}"
ALERT_SERVICE_NAME="${ALERT_SERVICE_NAME:-clinia-mongo-backup}"
ALERT_ON_SUCCESS="${ALERT_ON_SUCCESS:-false}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'INFO %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

send_alert() {
  local status="$1"
  local message="$2"
  local hostname_value
  local timestamp_value
  local payload
  local curl_args

  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    warn 'alert_skipped reason=curl_missing'
    return
  fi

  hostname_value="$(hostname 2>/dev/null || printf 'unknown')"
  timestamp_value="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  payload="$(printf '{"service":"%s","status":"%s","message":"%s","host":"%s","timestamp":"%s","logPath":"%s"}' \
    "$(json_escape "$ALERT_SERVICE_NAME")" \
    "$(json_escape "$status")" \
    "$(json_escape "$message")" \
    "$(json_escape "$hostname_value")" \
    "$(json_escape "$timestamp_value")" \
    "$(json_escape "${log_path:-}")")"

  curl_args=(
    -fsS
    -X POST \
    -H 'Content-Type: application/json' \
    --max-time "$ALERT_TIMEOUT_SECONDS"
  )

  if [[ -n "$ALERT_WEBHOOK_BEARER_TOKEN" ]]; then
    curl_args+=(-H "Authorization: Bearer $ALERT_WEBHOOK_BEARER_TOKEN")
  fi

  if [[ -n "$ALERT_WEBHOOK_HEADER" ]]; then
    curl_args+=(-H "$ALERT_WEBHOOK_HEADER")
  fi

  if ! curl "${curl_args[@]}" --data "$payload" "$ALERT_WEBHOOK_URL" >/dev/null; then
    warn "alert_failed status=$status webhook=$ALERT_WEBHOOK_URL"
  fi
}

cleanup_old_backups() {
  if [[ "$BACKUP_RETENTION_DAYS" -le 0 ]]; then
    info "retention=disabled days=$BACKUP_RETENTION_DAYS"
    return
  fi

  mkdir -p "$BACKUP_KEEP_DIR"

  while IFS= read -r archive_path; do
    archive_name="$(basename "$archive_path")"

    if [[ -f "${BACKUP_KEEP_DIR%/}/${archive_name}.keep" ]]; then
      info "retention=kept archive=$archive_path marker=${BACKUP_KEEP_DIR%/}/${archive_name}.keep"
      continue
    fi

    rm -f \
      "$archive_path" \
      "${archive_path}.sha256" \
      "${archive_path}.manifest.json"
    info "retention=deleted archive=$archive_path"
  done < <(find "$BACKUP_OUTPUT_DIR" \
    -type f \
    -name "${BACKUP_LABEL}-*.archive.gz" \
    -mtime +"$BACKUP_RETENTION_DAYS" \
    -print)

  find "$BACKUP_LOG_DIR" \
    -type f \
    -name 'mongo-backup-*.log' \
    -mtime +"$BACKUP_RETENTION_DAYS" \
    -print \
    -delete
}

require_command find
require_command mkdir

mkdir -p "$BACKUP_OUTPUT_DIR" "$BACKUP_KEEP_DIR" "$BACKUP_LOG_DIR"
chmod 700 "$BACKUP_OUTPUT_DIR"
chmod 700 "$BACKUP_KEEP_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
log_path="${BACKUP_LOG_DIR%/}/mongo-backup-${timestamp}.log"

run_scheduled_backup() {
  local backup_output
  local backup_status
  local backup_archive

  info "backup_started timestamp=$timestamp output_dir=$BACKUP_OUTPUT_DIR retention_days=$BACKUP_RETENTION_DAYS"

  backup_status=0
  backup_output="$(
    BACKUP_OUTPUT_DIR="$BACKUP_OUTPUT_DIR" \
    BACKUP_LABEL="$BACKUP_LABEL" \
    MONGO_DATABASE="$MONGO_DATABASE" \
    MONGO_CONTAINER_PREFIX="$MONGO_CONTAINER_PREFIX" \
    "$SCRIPT_DIR/backup-mongo.sh"
  )" || backup_status=$?

  printf '%s\n' "$backup_output"

  if [[ "$backup_status" -ne 0 ]]; then
    return "$backup_status"
  fi

  backup_archive="$(
    printf '%s\n' "$backup_output" |
      sed -n 's/^INFO archive=//p' |
      tail -n1
  )"

  if [[ -z "$backup_archive" ]]; then
    printf 'ERROR backup_archive_not_reported\n' >&2
    return 1
  fi

  "$SCRIPT_DIR/verify-mongo-backup.sh" "$backup_archive" || return "$?"
  cleanup_old_backups || return "$?"

  info "backup_completed archive=$backup_archive log=$log_path"
}

if ! run_scheduled_backup >"$log_path" 2>&1; then
  printf 'ERROR scheduled_backup_failed log=%s\n' "$log_path" >&2
  send_alert "failed" "Mongo backup failed on $(hostname); see $log_path"
  cat "$log_path" >&2
  exit 1
fi

if [[ "$ALERT_ON_SUCCESS" == "true" ]]; then
  send_alert "ok" "Mongo backup completed on $(hostname); see $log_path"
fi

cat "$log_path"
