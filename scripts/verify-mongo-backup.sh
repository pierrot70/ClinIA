#!/usr/bin/env bash

set -euo pipefail

BACKUP_ARCHIVE="${1:-${BACKUP_ARCHIVE:-}}"
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

if [[ -z "$BACKUP_ARCHIVE" ]]; then
  fail 'missing_backup_archive usage="./scripts/verify-mongo-backup.sh /path/to/archive.gz"'
fi

require_command gzip
require_command sha256sum
require_command stat

if [[ ! -f "$BACKUP_ARCHIVE" ]]; then
  fail "archive_not_found path=$BACKUP_ARCHIVE"
fi

SHA256_FILE="${SHA256_FILE:-${BACKUP_ARCHIVE}.sha256}"

if [[ ! -f "$SHA256_FILE" ]]; then
  fail "sha256_file_not_found path=$SHA256_FILE"
fi

size_bytes="$(stat -c '%s' "$BACKUP_ARCHIVE")"
permissions="$(stat -c '%a' "$BACKUP_ARCHIVE")"

if [[ "$size_bytes" -le 0 ]]; then
  fail "archive_empty path=$BACKUP_ARCHIVE size_bytes=$size_bytes"
fi

if [[ "$permissions" != "$EXPECTED_PERMISSIONS" ]]; then
  fail "unexpected_permissions path=$BACKUP_ARCHIVE permissions=$permissions expected=$EXPECTED_PERMISSIONS"
fi

expected_hash="$(awk 'NR == 1 { print $1 }' "$SHA256_FILE")"
actual_hash="$(sha256sum "$BACKUP_ARCHIVE" | awk '{ print $1 }')"

if [[ -z "$expected_hash" || "$actual_hash" != "$expected_hash" ]]; then
  fail "sha256_mismatch archive=$BACKUP_ARCHIVE sha256_file=$SHA256_FILE"
fi

gzip -t "$BACKUP_ARCHIVE"

info "archive=$BACKUP_ARCHIVE"
info "sha256_file=$SHA256_FILE"
info "size_bytes=$size_bytes permissions=$permissions"
info 'sha256=ok'
info 'gzip=ok'
info 'backup_verification=ok'
