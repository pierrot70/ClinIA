#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
S3_BACKUP_URI="${S3_BACKUP_URI:-}"
S3_ENDPOINT_URL="${S3_ENDPOINT_URL:-}"
S3_RESTORE_ARCHIVE="${S3_RESTORE_ARCHIVE:-}"
S3_RESTORE_SELECTION="${S3_RESTORE_SELECTION:-latest}"
EXPECTED_PERMISSIONS="${EXPECTED_PERMISSIONS:-600}"

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

build_aws_args() {
  if [[ -n "$S3_ENDPOINT_URL" ]]; then
    printf '%s\n' --endpoint-url "$S3_ENDPOINT_URL"
  fi
}

aws_s3_ls() {
  local uri="$1"
  local aws_args

  mapfile -t aws_args < <(build_aws_args)
  aws "${aws_args[@]}" s3 ls "$uri"
}

aws_s3_cp() {
  local source_uri="$1"
  local destination_path="$2"
  local aws_args

  mapfile -t aws_args < <(build_aws_args)
  aws "${aws_args[@]}" s3 cp "$source_uri" "$destination_path" --only-show-errors
}

latest_s3_archive_name() {
  aws_s3_ls "${S3_BACKUP_URI%/}/" |
    awk -v label="$BACKUP_LABEL" '
      $4 ~ ("^" label "-[0-9]{8}-[0-9]{6}[.]archive[.]gz([.]age)?$") {
        print $1 " " $2 " " $4
      }
    ' |
    sort |
    tail -n1 |
    awk '{ print $3 }'
}

selected_s3_archive_name() {
  local archive_name

  if [[ -n "$S3_RESTORE_ARCHIVE" ]]; then
    archive_name="$(basename "$S3_RESTORE_ARCHIVE")"
    case "$archive_name" in
      "${BACKUP_LABEL}"-*.archive.gz|"${BACKUP_LABEL}"-*.archive.gz.age)
        printf '%s\n' "$archive_name"
        return
        ;;
      *)
        fail "invalid_s3_restore_archive value=$S3_RESTORE_ARCHIVE expected=${BACKUP_LABEL}-*.archive.gz.age"
        ;;
    esac
  fi

  case "$S3_RESTORE_SELECTION" in
    latest)
      latest_s3_archive_name
      ;;
    *)
      fail 'invalid_s3_restore_selection expected=latest or set S3_RESTORE_ARCHIVE'
      ;;
  esac
}

download_if_present() {
  local remote_uri="$1"
  local local_path="$2"

  if aws_s3_ls "$remote_uri" >/dev/null 2>&1; then
    aws_s3_cp "$remote_uri" "$local_path"
    chmod "$EXPECTED_PERMISSIONS" "$local_path"
    info "downloaded source=$remote_uri destination=$local_path"
  else
    info "download_skipped missing_source=$remote_uri"
  fi
}

verify_downloaded_archive() {
  local archive_path="$1"

  [[ -f "$archive_path" ]] || fail "archive_not_found path=$archive_path"
  [[ -f "${archive_path}.sha256" ]] || fail "sha256_file_not_found path=${archive_path}.sha256"

  BACKUP_ENCRYPTION_REQUIRED="${BACKUP_ENCRYPTION_REQUIRED:-false}" \
    "$SCRIPT_DIR/verify-mongo-backup.sh" "$archive_path"

  info "backup_verification=ok archive=$archive_path"
}

require_command aws
require_command awk
require_command basename
require_command chmod
require_command sha256sum
require_command sort
require_command tail

[[ -n "$S3_BACKUP_URI" ]] || fail 'missing_s3_backup_uri set S3_BACKUP_URI or source /root/clinia-backup-s3.env'

mkdir -p "$BACKUP_OUTPUT_DIR"
chmod 700 "$BACKUP_OUTPUT_DIR"

archive_name="$(selected_s3_archive_name)"
[[ -n "$archive_name" ]] || fail "s3_backup_not_found uri=${S3_BACKUP_URI%/}/ label=$BACKUP_LABEL selection=$S3_RESTORE_SELECTION"

remote_prefix="${S3_BACKUP_URI%/}"
local_archive="${BACKUP_OUTPUT_DIR%/}/${archive_name}"

info "selected_s3_archive=${remote_prefix}/${archive_name}"
info "local_archive=$local_archive"

aws_s3_cp "${remote_prefix}/${archive_name}" "$local_archive"
chmod "$EXPECTED_PERMISSIONS" "$local_archive"
info "downloaded source=${remote_prefix}/${archive_name} destination=$local_archive"

download_if_present "${remote_prefix}/${archive_name}.sha256" "${local_archive}.sha256"
download_if_present "${remote_prefix}/${archive_name}.manifest.json" "${local_archive}.manifest.json"

verify_downloaded_archive "$local_archive"

info "s3_restore_ready archive=$local_archive"
printf '\n'
printf 'Run production restore with:\n'
printf 'sudo CONFIRM_RESTORE_PRODUCTION=RESTORE_SELECTED_CLINIA_BACKUP \\\n'
if [[ "$local_archive" == *.archive.gz.age ]]; then
  printf '  BACKUP_AGE_IDENTITY_FILE=/secure/path/to/clinia-backup.key \\\n'
fi
printf '  RESTORE_ARCHIVE=%q \\\n' "$local_archive"
printf '  BACKUP_OUTPUT_DIR=%q \\\n' "$BACKUP_OUTPUT_DIR"
printf '  BACKUP_LABEL=%q \\\n' "$BACKUP_LABEL"
printf '  /opt/clinia/scripts/restore-mongo-production.sh\n'
