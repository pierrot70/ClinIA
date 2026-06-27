#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
APPOINTMENT_DRILL_SCRIPT="${APPOINTMENT_DRILL_SCRIPT:-$ROOT_DIR/scripts/run-staging-appointment-write-drill.sh}"
VERBOSE="${VERBOSE:-0}"
WAIT_SECONDS="${WAIT_SECONDS:-10}"
ELECTION_ATTEMPTS="${ELECTION_ATTEMPTS:-20}"
ELECTION_WAIT_SECONDS="${ELECTION_WAIT_SECONDS:-3}"

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

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

remember_stopped_service() {
  local service="$1"
  STOPPED_SERVICES+=("$service")
}

forget_stopped_service() {
  local target="$1"
  local next=()
  local service

  for service in "${STOPPED_SERVICES[@]}"; do
    if [[ "$service" != "$target" ]]; then
      next+=("$service")
    fi
  done

  STOPPED_SERVICES=("${next[@]}")
}

restore_stopped_services() {
  local service

  if [[ "${#STOPPED_SERVICES[@]}" -eq 0 ]]; then
    return
  fi

  info "restore_services=${STOPPED_SERVICES[*]}"

  for service in "${STOPPED_SERVICES[@]}"; do
    dc start "$service" >/dev/null || true
  done
}

trap restore_stopped_services EXIT

running_mongo_service() {
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if dc ps --services --status running | grep -Fxq "$service"; then
      printf '%s' "$service"
      return
    fi
  done

  return 1
}

primary_service() {
  local service
  local primary

  service="$(running_mongo_service)" || return 1

  primary="$(
    dc exec -T "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.hello().primary"'
  )"

  primary="${primary%%:*}"
  [[ -n "$primary" ]] || return 1
  printf '%s' "$primary"
}

choose_secondary() {
  local primary="$1"
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if [[ "$service" != "$primary" ]] && dc ps --services --status running | grep -Fxq "$service"; then
      printf '%s' "$service"
      return
    fi
  done

  return 1
}

wait_for_new_primary() {
  local old_primary="$1"
  local attempt
  local current_primary

  for attempt in $(seq 1 "$ELECTION_ATTEMPTS"); do
    current_primary="$(primary_service 2>/dev/null || true)"

    if [[ -n "$current_primary" && "$current_primary" != "$old_primary" ]]; then
      info "new_primary=$current_primary attempt=$attempt"
      return
    fi

    sleep "$ELECTION_WAIT_SECONDS"
  done

  fail "new_primary_not_detected old_primary=$old_primary"
}

run_appointment_drill() {
  local label="$1"

  printf '\n=== %s ===\n' "$label"
  VERBOSE="$VERBOSE" "$APPOINTMENT_DRILL_SCRIPT"
}

stop_service() {
  local service="$1"

  info "stopping_service=$service"
  dc stop "$service" >/dev/null
  remember_stopped_service "$service"
  sleep "$WAIT_SECONDS"
}

start_service() {
  local service="$1"

  info "starting_service=$service"
  dc start "$service" >/dev/null
  forget_stopped_service "$service"
  sleep "$WAIT_SECONDS"
}

require_command docker
require_command grep
[[ -x "$APPOINTMENT_DRILL_SCRIPT" ]] || fail "appointment_drill_script_not_executable path=$APPOINTMENT_DRILL_SCRIPT"

info "STAGING_APPOINTMENT_RESILIENCE_DRILL_STARTED"

run_appointment_drill "appointments CRUD at 3/3"

primary="$(primary_service)" || fail "primary_not_found_before_secondary_drill"
secondary="$(choose_secondary "$primary")" || fail "secondary_not_found primary=$primary"

stop_service "$secondary"
run_appointment_drill "appointments CRUD at 2/3 after secondary stop"
start_service "$secondary"
run_appointment_drill "appointments CRUD after secondary restore"

primary="$(primary_service)" || fail "primary_not_found_before_failover"
stop_service "$primary"
wait_for_new_primary "$primary"
run_appointment_drill "appointments CRUD after primary failover"
start_service "$primary"
run_appointment_drill "appointments CRUD after primary restore"

info "STAGING_APPOINTMENT_RESILIENCE_DRILL_PASSED"
