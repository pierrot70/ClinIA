#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
STAGING_EMAIL="${STAGING_EMAIL:-local.medecin@clinia.test}"
STAGING_USERNAME="${STAGING_USERNAME:-local-medecin}"
STAGING_PASSWORD="${STAGING_PASSWORD:-localpassword123}"
STAGING_ROLE="${STAGING_ROLE:-SUPERADMIN}"
VERBOSE="${VERBOSE:-0}"
WAIT_SECONDS="${WAIT_SECONDS:-10}"
RECOVERY_ATTEMPTS="${RECOVERY_ATTEMPTS:-12}"
RECOVERY_WAIT_SECONDS="${RECOVERY_WAIT_SECONDS:-5}"
BASELINE_ATTEMPTS="${BASELINE_ATTEMPTS:-12}"
BASELINE_WAIT_SECONDS="${BASELINE_WAIT_SECONDS:-5}"
DEGRADED_ATTEMPTS="${DEGRADED_ATTEMPTS:-12}"
DEGRADED_WAIT_SECONDS="${DEGRADED_WAIT_SECONDS:-5}"

TOKEN=""
STOPPED_SERVICE=""
LAST_STATUS_FILE="/tmp/clinia-staging-db-status-replica-drill.json"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

info() {
  if [[ "$VERBOSE" != "1" && "${VERBOSE,,}" != "true" ]]; then
    return
  fi
  printf 'INFO %s\n' "$*"
}

fail() {
  printf 'FAILED %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

mongo_exec_service() {
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if dc ps --services --status running | grep -Fxq "$service"; then
      printf '%s' "$service"
      return
    fi
  done

  return 1
}

restore_stopped_service() {
  if [[ -z "$STOPPED_SERVICE" ]]; then
    return
  fi

  info "restore_service=$STOPPED_SERVICE"
  dc start "$STOPPED_SERVICE" >/dev/null || true
}

trap restore_stopped_service EXIT

wait_for_backend() {
  local attempt

  for attempt in {1..30}; do
    if curl -fsS --max-time 5 "$BASE_URL/api/health/ready" >/dev/null 2>&1; then
      info "backend_ready attempt=$attempt"
      return
    fi
    sleep 2
  done

  fail "backend_not_ready url=$BASE_URL"
}

ensure_staging_user() {
  local password_hash
  local service

  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  password_hash="$(
    dc exec -T -e STAGING_PASSWORD="$STAGING_PASSWORD" backend \
      node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.STAGING_PASSWORD, 12));'
  )"

  dc exec -T \
    -e STAGING_EMAIL="$STAGING_EMAIL" \
    -e STAGING_USERNAME="$STAGING_USERNAME" \
    -e STAGING_PASSWORD_HASH="$password_hash" \
    -e STAGING_ROLE="$STAGING_ROLE" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const now = new Date();
        db.getSiblingDB(\"clinia\").adminusers.updateOne(
          { email: process.env.STAGING_EMAIL },
          {
            \$set: {
              email: process.env.STAGING_EMAIL,
              username: process.env.STAGING_USERNAME,
              passwordHash: process.env.STAGING_PASSWORD_HASH,
              role: process.env.STAGING_ROLE,
              isActive: true,
              passwordResetRequired: false,
              mustChangePasswordOnNextLogin: false,
              failedLoginAttempts: 0,
              lockUntil: null,
              updatedAt: now
            },
            \$setOnInsert: { createdAt: now }
          },
          { upsert: true }
        );
      "' >/dev/null
}

login() {
  local response="/tmp/clinia-staging-db-status-login.json"

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$STAGING_EMAIL\",\"password\":\"$STAGING_PASSWORD\"}" \
    >"$response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$TOKEN" ]] || {
    cat "$response" >&2
    fail "login_failed email=$STAGING_EMAIL"
  }
}

fetch_db_status() {
  curl -sS "$BASE_URL/api/db-status" \
    -H "Authorization: Bearer $TOKEN" \
    >"$LAST_STATUS_FILE"
}

summary_status() {
  jq -r '.data.replicaSet.summary.status // "UNKNOWN"' "$LAST_STATUS_FILE"
}

print_summary() {
  local label="$1"

  jq -r --arg label "$label" '
    .data.replicaSet.summary |
    "\($label): \(.status) (" +
    "\(.healthyCount)/\(.memberCount) healthy, " +
    "primary=\(.primaryCount), secondaries=\(.secondaryCount), " +
    "lag=\((.maxLagSeconds // "N/D")|tostring)s, " +
    "majority=\(.majorityAvailable))"
  ' "$LAST_STATUS_FILE"
}

expect_status() {
  local expected="$1"
  local label="$2"
  local actual

  actual="$(summary_status)"
  print_summary "$label"
  [[ "$actual" == "$expected" ]] || fail "expected_status=$expected actual_status=$actual"
}

wait_for_status() {
  local expected="$1"
  local label="$2"
  local attempts="$3"
  local wait_seconds="$4"
  local failure_code="$5"
  local attempt
  local actual

  for attempt in $(seq 1 "$attempts"); do
    fetch_db_status
    actual="$(summary_status)"

    if [[ "$actual" == "$expected" ]]; then
      print_summary "$label"
      return
    fi

    if [[ "$attempt" -eq 1 || "$VERBOSE" == "1" || "${VERBOSE,,}" == "true" ]]; then
      print_summary "Waiting for $label"
    fi

    sleep "$wait_seconds"
  done

  actual="$(summary_status)"
  fail "$failure_code expected_status=$expected actual_status=$actual"
}

choose_secondary_service() {
  jq -r '
    .data.replicaSet.members[]
    | select(.role == "secondary" and .onlineStatus == "online")
    | .name
    | split(":")[0]
  ' "$LAST_STATUS_FILE" | head -n1
}

wait_for_ok_after_restore() {
    local attempt
    local actual

  for attempt in $(seq 1 "$RECOVERY_ATTEMPTS"); do
    fetch_db_status
    actual="$(summary_status)"

    if [[ "$actual" == "OK" ]]; then
      print_summary "Restored"
      return
    fi

    if [[ "$attempt" -eq 1 || "$VERBOSE" == "1" || "${VERBOSE,,}" == "true" ]]; then
      print_summary "Recovering"
    fi

    sleep "$RECOVERY_WAIT_SECONDS"
  done

    actual="$(summary_status)"
    fail "restore_did_not_return_to_ok actual_status=$actual"
}

wait_for_ok() {
  local label="$1"
  local attempts="$2"
  local wait_seconds="$3"
  local failure_code="$4"
  local attempt
  local actual

  for attempt in $(seq 1 "$attempts"); do
    fetch_db_status
    actual="$(summary_status)"

    if [[ "$actual" == "OK" ]]; then
      print_summary "$label"
      return
    fi

    if [[ "$attempt" -eq 1 || "$VERBOSE" == "1" || "${VERBOSE,,}" == "true" ]]; then
      print_summary "Waiting for $label"
    fi

    sleep "$wait_seconds"
  done

  actual="$(summary_status)"
  fail "$failure_code actual_status=$actual"
}

require_command curl
require_command docker
require_command jq
require_command grep

printf '\nTesting Mongo replica status API\n'

wait_for_backend
ensure_staging_user
login

wait_for_ok "Baseline" "$BASELINE_ATTEMPTS" "$BASELINE_WAIT_SECONDS" "baseline_did_not_return_to_ok"

secondary="$(choose_secondary_service)"
[[ -n "$secondary" ]] || fail "secondary_not_found"

printf 'Stopping secondary: %s\n' "$secondary"
dc stop "$secondary" >/dev/null 2>&1
STOPPED_SERVICE="$secondary"
sleep "$WAIT_SECONDS"

wait_for_status "DEGRADED" "After secondary stop" "$DEGRADED_ATTEMPTS" "$DEGRADED_WAIT_SECONDS" "degraded_status_not_detected"

printf 'Restarting secondary: %s\n' "$secondary"
dc start "$secondary" >/dev/null 2>&1
STOPPED_SERVICE=""
sleep "$WAIT_SECONDS"

wait_for_ok_after_restore

printf 'Replica status API drill PASSED\n'
