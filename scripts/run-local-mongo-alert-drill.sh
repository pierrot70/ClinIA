#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
ALERT_ORIGIN="${ALERT_ORIGIN:-DEV}"
SEND_SLACK_ALERTS="${SEND_SLACK_ALERTS:-true}"
HEALTH_SCRIPT="$ROOT_DIR/scripts/production-health-check.sh"
PRIMARY_SERVICE=""
STOPPED_SERVICES=()

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

info() {
  printf 'INFO %s\n' "$*"
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

restore_members() {
  if ((${#STOPPED_SERVICES[@]} > 0)); then
    info "restoring_members=${STOPPED_SERVICES[*]}"
    dc start "${STOPPED_SERVICES[@]}" >/dev/null || true
    sleep 10
  fi
}

trap restore_members EXIT

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "missing_env $name"
  fi
}

run_health() {
  CHECK_CONTAINERS=false \
  CHECK_MONGO_REPLICA=true \
  ALERT_ORIGIN="$ALERT_ORIGIN" \
  ALERT_WEBHOOK_FORMAT=slack \
  ALERT_WEBHOOK_URL= \
  MONGO_DEGRADED_WEBHOOK_URL="${MONGO_DEGRADED_WEBHOOK_URL:-}" \
  MONGO_INCIDENT_WEBHOOK_URL="${MONGO_INCIDENT_WEBHOOK_URL:-}" \
  MONGO_REPLICA_CONTAINER_PREFIX="${COMPOSE_PROJECT}-mongo-rs-" \
  MONGO_REPLICA_CONTAINER_EXCLUDE_PREFIX= \
  MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}" \
  "$HEALTH_SCRIPT"
}

run_health_expect_exit() {
  local expected_exit="$1"
  local label="$2"
  local exit_code

  set +e
  run_health
  exit_code=$?
  set -e

  if [[ "$exit_code" != "$expected_exit" ]]; then
    fail "unexpected_health_exit label=$label expected=$expected_exit actual=$exit_code"
  fi

  info "health_check=$label exit=$exit_code"
}

primary_service() {
  local primary

  primary="$(
    dc exec -T mongo-rs-1 sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.hello().primary"' 2>/dev/null ||
    dc exec -T mongo-rs-2 sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.hello().primary"' 2>/dev/null ||
    dc exec -T mongo-rs-3 sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.hello().primary"' 2>/dev/null
  )"

  primary="${primary%%:*}"
  [[ -n "$primary" ]] || fail "primary_not_found"
  printf '%s' "$primary"
}

choose_secondary() {
  local primary="$1"
  local candidate

  for candidate in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if [[ "$candidate" != "$primary" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done

  fail "secondary_not_found primary=$primary"
}

choose_other_secondary() {
  local primary="$1"
  local stopped_secondary="$2"
  local candidate

  for candidate in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if [[ "$candidate" != "$primary" && "$candidate" != "$stopped_secondary" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done

  fail "other_secondary_not_found primary=$primary stopped_secondary=$stopped_secondary"
}

if [[ "$SEND_SLACK_ALERTS" == "true" ]]; then
  require_env MONGO_DEGRADED_WEBHOOK_URL
  require_env MONGO_INCIDENT_WEBHOOK_URL
fi

[[ -x "$HEALTH_SCRIPT" ]] || fail "health_script_not_executable path=$HEALTH_SCRIPT"

info "starting_all_members=true"
dc start mongo-rs-1 mongo-rs-2 mongo-rs-3 >/dev/null
sleep 10

run_health_expect_exit 0 "normal_before_drill"

PRIMARY_SERVICE="$(primary_service)"
SECONDARY_TO_STOP="$(choose_secondary "$PRIMARY_SERVICE")"
OTHER_SECONDARY="$(choose_other_secondary "$PRIMARY_SERVICE" "$SECONDARY_TO_STOP")"

info "primary=$PRIMARY_SERVICE secondary_to_stop=$SECONDARY_TO_STOP other_secondary=$OTHER_SECONDARY"

info "stopping_for_degraded=$SECONDARY_TO_STOP"
dc stop "$SECONDARY_TO_STOP" >/dev/null
STOPPED_SERVICES+=("$SECONDARY_TO_STOP")
sleep 10

run_health_expect_exit 1 "degraded_two_of_three"

info "stopping_for_incident=$OTHER_SECONDARY"
dc stop "$OTHER_SECONDARY" >/dev/null
STOPPED_SERVICES+=("$OTHER_SECONDARY")
sleep 10

run_health_expect_exit 2 "incident_one_of_three"

restore_members
STOPPED_SERVICES=()

run_health_expect_exit 0 "normal_after_drill"

info "LOCAL_MONGO_ALERT_DRILL_PASSED origin=$ALERT_ORIGIN"
