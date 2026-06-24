#!/usr/bin/env bash

set -euo pipefail

GITHUB_BRANCH="${GITHUB_BRANCH:-coolify}"
GITHUB_RAW_BASE="${GITHUB_RAW_BASE:-https://raw.githubusercontent.com/pierrot70/ClinIA/${GITHUB_BRANCH}}"
SCRIPT_INSTALL_DIR="${SCRIPT_INSTALL_DIR:-/opt/clinia/scripts}"
BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_KEEP_DIR="${BACKUP_KEEP_DIR:-/var/backups/clinia/mongo-keep}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_LOG_DIR="${BACKUP_LOG_DIR:-/var/log/clinia}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
MONGO_DATABASE="${MONGO_DATABASE:-clinia}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/clinia-mongo-backup}"
ALERT_ENV_FILE="${ALERT_ENV_FILE:-/root/clinia-backup-alert.env}"
S3_ENV_FILE="${S3_ENV_FILE:-/root/clinia-backup-s3.env}"
ALERT_TEST_DIR="${ALERT_TEST_DIR:-/tmp/clinia-alert-test}"
CRON_SCHEDULE="${CRON_SCHEDULE:-15 5 * * *}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'INFO %s\n' "$1"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fail 'run_as_root usage="sudo ./configure-mongo-backup-slack-alert.sh"'
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

normalize_slack_webhook_url() {
  local input="$1"

  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"

  if [[ -z "$input" ]]; then
    fail 'missing_slack_webhook'
  fi

  case "$input" in
    https://hooks.slack.com/services/*|https://hooks.slack-gov.com/services/*)
      printf '%s\n' "$input"
      ;;
    /services/*)
      printf 'https://hooks.slack.com%s\n' "$input"
      ;;
    /*/*/*)
      printf 'https://hooks.slack.com/services%s\n' "$input"
      ;;
    */*/*)
      printf 'https://hooks.slack.com/services/%s\n' "$input"
      ;;
    *)
      fail 'invalid_slack_webhook expected="/TON/URL/SLACK" or full hooks.slack.com URL'
      ;;
  esac
}

install_backup_scripts() {
  mkdir -p "$SCRIPT_INSTALL_DIR" "$BACKUP_OUTPUT_DIR" "$BACKUP_KEEP_DIR" "$BACKUP_LOG_DIR"

  for script_name in backup-mongo.sh verify-mongo-backup.sh scheduled-mongo-backup.sh; do
    curl -fsSL "${GITHUB_RAW_BASE}/scripts/${script_name}" \
      -o "${SCRIPT_INSTALL_DIR%/}/${script_name}"
  done

  chmod 755 "${SCRIPT_INSTALL_DIR%/}/"*.sh
  chmod 700 "$BACKUP_OUTPUT_DIR" "$BACKUP_KEEP_DIR"
}

write_alert_env_file() {
  local webhook_url="$1"
  local tmp_file

  tmp_file="$(mktemp)"
  {
    printf 'ALERT_WEBHOOK_URL=%s\n' "$(shell_quote "$webhook_url")"
    printf 'ALERT_WEBHOOK_FORMAT=slack\n'
    printf 'ALERT_TIMEOUT_SECONDS=10\n'
  } >"$tmp_file"

  install -m 600 "$tmp_file" "$ALERT_ENV_FILE"
  rm -f "$tmp_file"
  info "alert_env_file=$ALERT_ENV_FILE"
}

run_failure_alert_test() {
  local exit_code

  rm -rf "$ALERT_TEST_DIR"
  mkdir -p "$ALERT_TEST_DIR"

  info 'running_failure_alert_test=true'
  set +e
  bash -c "
    set -a
    . $(shell_quote "$ALERT_ENV_FILE")
    set +a

    BACKUP_OUTPUT_DIR=$(shell_quote "${ALERT_TEST_DIR%/}/backups") \
    BACKUP_KEEP_DIR=$(shell_quote "${ALERT_TEST_DIR%/}/keep") \
    BACKUP_LOG_DIR=$(shell_quote "${ALERT_TEST_DIR%/}/logs") \
    BACKUP_RETENTION_DAYS=$(shell_quote "$BACKUP_RETENTION_DAYS") \
    MONGO_CONTAINER_PREFIX=missing-mongo-prefix- \
    MONGO_DATABASE=$(shell_quote "$MONGO_DATABASE") \
    BACKUP_LABEL=$(shell_quote "$BACKUP_LABEL") \
    $(shell_quote "${SCRIPT_INSTALL_DIR%/}/scheduled-mongo-backup.sh")
  "
  exit_code=$?
  set -e

  if [[ "$exit_code" -eq 0 ]]; then
    fail 'failure_alert_test_unexpected_success'
  fi

  info "failure_alert_test=completed expected_exit_code=$exit_code"
}

confirm_slack_received() {
  local answer

  printf '\nAs-tu recu la notification Slack de test? [y/N] '
  read -r answer

  case "$answer" in
    y|Y|yes|YES|oui|OUI|o|O)
      return
      ;;
    *)
      fail "slack_test_not_confirmed cron_not_updated=$CRON_FILE"
      ;;
  esac
}

write_cron_file() {
  local alert_env_file_q
  local s3_env_file_q
  local backup_output_dir_q
  local backup_keep_dir_q
  local backup_log_dir_q
  local backup_retention_days_q
  local mongo_container_prefix_q
  local mongo_database_q
  local backup_label_q
  local scheduled_script_q

  alert_env_file_q="$(shell_quote "$ALERT_ENV_FILE")"
  s3_env_file_q="$(shell_quote "$S3_ENV_FILE")"
  backup_output_dir_q="$(shell_quote "$BACKUP_OUTPUT_DIR")"
  backup_keep_dir_q="$(shell_quote "$BACKUP_KEEP_DIR")"
  backup_log_dir_q="$(shell_quote "$BACKUP_LOG_DIR")"
  backup_retention_days_q="$(shell_quote "$BACKUP_RETENTION_DAYS")"
  mongo_container_prefix_q="$(shell_quote "$MONGO_CONTAINER_PREFIX")"
  mongo_database_q="$(shell_quote "$MONGO_DATABASE")"
  backup_label_q="$(shell_quote "$BACKUP_LABEL")"
  scheduled_script_q="$(shell_quote "${SCRIPT_INSTALL_DIR%/}/scheduled-mongo-backup.sh")"

  cat >"$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

${CRON_SCHEDULE} root set -a; . ${alert_env_file_q}; if [ -f ${s3_env_file_q} ]; then . ${s3_env_file_q}; fi; set +a; BACKUP_OUTPUT_DIR=${backup_output_dir_q} BACKUP_KEEP_DIR=${backup_keep_dir_q} BACKUP_RETENTION_DAYS=${backup_retention_days_q} BACKUP_LOG_DIR=${backup_log_dir_q} MONGO_CONTAINER_PREFIX=${mongo_container_prefix_q} MONGO_DATABASE=${mongo_database_q} BACKUP_LABEL=${backup_label_q} ${scheduled_script_q}
EOF

  chmod 644 "$CRON_FILE"
  info "cron_updated=$CRON_FILE"
}

main() {
  local slack_input
  local slack_webhook_url

  require_root
  require_command bash
  require_command curl
  require_command install
  require_command mktemp

  printf 'Colle la partie Slack "/TON/URL/SLACK" ou l URL complete hooks.slack.com: '
  read -r -s slack_input
  printf '\n'

  slack_webhook_url="$(normalize_slack_webhook_url "$slack_input")"

  install_backup_scripts
  write_alert_env_file "$slack_webhook_url"
  run_failure_alert_test
  confirm_slack_received
  write_cron_file

  info 'slack_backup_alert_configured=true'
}

main "$@"
