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
BACKUP_ENCRYPTION_ENV_FILE="${BACKUP_ENCRYPTION_ENV_FILE:-/root/clinia-backup-encryption.env}"
S3_TEST_FILE="${S3_TEST_FILE:-/tmp/clinia-s3-backup-test.txt}"
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
    fail 'run_as_root usage="sudo ./configure-mongo-backup-s3.sh"'
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

prompt_required() {
  local prompt="$1"
  local value

  printf '%s' "$prompt" >&2
  read -r value

  if [[ -z "$value" ]]; then
    fail 'missing_required_value'
  fi

  printf '%s\n' "$value"
}

prompt_secret_required() {
  local prompt="$1"
  local value

  printf '%s' "$prompt" >&2
  read -r -s value
  printf '\n' >&2

  if [[ -z "$value" ]]; then
    fail 'missing_required_secret'
  fi

  printf '%s\n' "$value"
}

prompt_optional() {
  local prompt="$1"
  local default_value="${2:-}"
  local value

  if [[ -n "$default_value" ]]; then
    printf '%s [%s]: ' "$prompt" "$default_value" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi

  read -r value
  printf '%s\n' "${value:-$default_value}"
}

normalize_s3_uri() {
  local value="$1"

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%/}"

  case "$value" in
    s3://*/*)
      printf '%s\n' "$value"
      ;;
    *)
      fail 'invalid_s3_uri expected="s3://bucket/prefix"'
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

install_aws_cli_hint() {
  if command -v aws >/dev/null 2>&1; then
    return
  fi

  fail 'aws_cli_missing install="sudo apt-get update && sudo apt-get install -y unzip && cd /tmp && curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip && unzip -q -o awscliv2.zip && sudo ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update"'
}

write_s3_env_file() {
  local s3_uri="$1"
  local endpoint_url="$2"
  local region="$3"
  local access_key_id="$4"
  local secret_access_key="$5"
  local tmp_file

  tmp_file="$(mktemp)"
  {
    printf 'S3_BACKUP_URI=%s\n' "$(shell_quote "$s3_uri")"
    if [[ -n "$endpoint_url" ]]; then
      printf 'S3_ENDPOINT_URL=%s\n' "$(shell_quote "$endpoint_url")"
    fi
    printf 'AWS_DEFAULT_REGION=%s\n' "$(shell_quote "$region")"
    printf 'AWS_ACCESS_KEY_ID=%s\n' "$(shell_quote "$access_key_id")"
    printf 'AWS_SECRET_ACCESS_KEY=%s\n' "$(shell_quote "$secret_access_key")"
    printf 'AWS_EC2_METADATA_DISABLED=true\n'
  } >"$tmp_file"

  install -m 600 "$tmp_file" "$S3_ENV_FILE"
  rm -f "$tmp_file"
  info "s3_env_file=$S3_ENV_FILE"
}

write_backup_encryption_env_file() {
  local age_recipient="$1"
  local tmp_file

  case "$age_recipient" in
    age1*) ;;
    *) fail 'invalid_age_recipient expected=age1 public recipient' ;;
  esac

  tmp_file="$(mktemp)"
  {
    printf 'BACKUP_ENCRYPTION_REQUIRED=true\n'
    printf 'BACKUP_AGE_RECIPIENT=%s\n' "$(shell_quote "$age_recipient")"
  } >"$tmp_file"

  install -m 600 "$tmp_file" "$BACKUP_ENCRYPTION_ENV_FILE"
  rm -f "$tmp_file"
  info "backup_encryption_env_file=$BACKUP_ENCRYPTION_ENV_FILE"
}

test_s3_upload() {
  local destination
  local aws_args
  local s3_uri
  local encrypted_test_file

  set -a
  # shellcheck disable=SC1090
  . "$S3_ENV_FILE"
  # shellcheck disable=SC1090
  . "$BACKUP_ENCRYPTION_ENV_FILE"
  set +a

  s3_uri="${S3_BACKUP_URI%/}"
  destination="${s3_uri}/clinia-s3-backup-test-$(date -u +%Y%m%d-%H%M%S).txt.age"
  encrypted_test_file="${S3_TEST_FILE}.age"

  printf 'clinia backup s3 test %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$S3_TEST_FILE"
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted_test_file" "$S3_TEST_FILE"
  rm -f "$S3_TEST_FILE"

  aws_args=()
  if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then
    aws_args+=(--endpoint-url "$S3_ENDPOINT_URL")
  fi

  aws "${aws_args[@]}" s3 cp "$encrypted_test_file" "$destination" --only-show-errors
  aws "${aws_args[@]}" s3 ls "$destination" >/dev/null
  rm -f "$encrypted_test_file"

  info "s3_test_upload=ok destination=$destination"
}

write_cron_file() {
  local alert_env_file_q
  local s3_env_file_q
  local backup_encryption_env_file_q
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
  backup_encryption_env_file_q="$(shell_quote "$BACKUP_ENCRYPTION_ENV_FILE")"
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

${CRON_SCHEDULE} root set -a; if [ -f ${alert_env_file_q} ]; then . ${alert_env_file_q}; fi; . ${s3_env_file_q}; . ${backup_encryption_env_file_q}; set +a; BACKUP_OUTPUT_DIR=${backup_output_dir_q} BACKUP_KEEP_DIR=${backup_keep_dir_q} BACKUP_RETENTION_DAYS=${backup_retention_days_q} BACKUP_LOG_DIR=${backup_log_dir_q} MONGO_CONTAINER_PREFIX=${mongo_container_prefix_q} MONGO_DATABASE=${mongo_database_q} BACKUP_LABEL=${backup_label_q} ${scheduled_script_q}
EOF

  chmod 644 "$CRON_FILE"
  info "cron_updated=$CRON_FILE"
}

main() {
  local s3_uri
  local endpoint_url
  local region
  local access_key_id
  local secret_access_key
  local age_recipient

  require_root
  require_command bash
  require_command curl
  require_command install
  require_command mktemp
  require_command age
  install_aws_cli_hint

  s3_uri="$(normalize_s3_uri "$(prompt_required 'S3 destination, example s3://clinia-backups/mongo/prod: ')")"
  endpoint_url="$(prompt_optional 'S3 endpoint URL, blank for AWS S3' '')"
  region="$(prompt_optional 'S3 region' 'ca-central-1')"
  access_key_id="$(prompt_required 'S3 access key id: ')"
  secret_access_key="$(prompt_secret_required 'S3 secret access key: ')"
  age_recipient="$(prompt_required 'Public age recipient, example age1...: ')"

  install_backup_scripts
  write_s3_env_file "$s3_uri" "$endpoint_url" "$region" "$access_key_id" "$secret_access_key"
  write_backup_encryption_env_file "$age_recipient"
  test_s3_upload
  write_cron_file

  info 's3_backup_upload_configured=true'
}

main "$@"
