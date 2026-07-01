#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
DIAGNOSE_SCRIPT="${DIAGNOSE_SCRIPT:-$ROOT_DIR/scripts/diagnose-local-incident.sh}"
SECONDARY_TO_STOP="${SECONDARY_TO_STOP:-mongo-rs-3}"
WAIT_AFTER_STOP_SECONDS="${WAIT_AFTER_STOP_SECONDS:-12}"
WAIT_AFTER_START_SECONDS="${WAIT_AFTER_START_SECONDS:-20}"
TMP_DIR="${TMP_DIR:-/tmp/clinia-local-incident-diagnosis-drill}"

mkdir -p "$TMP_DIR"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

service_container_id() {
  local service="$1"
  dc ps -a -q "$service"
}

docker_start_service_container() {
  local service="$1"
  local container_id

  container_id="$(service_container_id "$service")"
  [[ -n "$container_id" ]] || fail "container_not_found service=$service"
  docker start "$container_id" >/dev/null
}

fail() {
  printf 'FAILED %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

restore_secondary() {
  docker_start_service_container "$SECONDARY_TO_STOP" >/dev/null 2>&1 || true
}

trap restore_secondary EXIT

run_diagnose_capture() {
  local label="$1"
  local expected_exit="$2"
  local expected_text="$3"
  local output_file="$TMP_DIR/$label.txt"
  local exit_code

  set +e
  "$DIAGNOSE_SCRIPT" >"$output_file" 2>&1
  exit_code=$?
  set -e

  cat "$output_file"

  if [[ "$exit_code" -ne "$expected_exit" ]]; then
    fail "diagnose_exit_mismatch label=$label expected=$expected_exit actual=$exit_code"
  fi

  if ! grep -q "$expected_text" "$output_file"; then
    fail "diagnose_text_missing label=$label expected=$expected_text"
  fi
}

require_command docker
require_command grep
[[ -x "$DIAGNOSE_SCRIPT" ]] || fail "diagnose_script_not_executable path=$DIAGNOSE_SCRIPT"

printf 'ClinIA local incident diagnosis drill\n'

printf '\n=== baseline ===\n'
docker_start_service_container mongo-rs-1
docker_start_service_container mongo-rs-2
docker_start_service_container mongo-rs-3
sleep "$WAIT_AFTER_START_SECONDS"
run_diagnose_capture "baseline" 0 "Diagnostic"
grep -q '^OK$' "$TMP_DIR/baseline.txt" || fail "baseline_not_ok"

printf '\n=== mongo degraded simulation ===\n'
printf 'Stopping secondary: %s\n' "$SECONDARY_TO_STOP"
dc stop "$SECONDARY_TO_STOP" >/dev/null
sleep "$WAIT_AFTER_STOP_SECONDS"
run_diagnose_capture "mongo-degraded" 1 "MONGO_DEGRADED"

printf '\n=== restore ===\n'
printf 'Restarting secondary: %s\n' "$SECONDARY_TO_STOP"
docker_start_service_container "$SECONDARY_TO_STOP"
sleep "$WAIT_AFTER_START_SECONDS"
run_diagnose_capture "restored" 0 "Diagnostic"
grep -q '^OK$' "$TMP_DIR/restored.txt" || fail "restore_not_ok"

printf '\nLOCAL_INCIDENT_DIAGNOSIS_DRILL_PASSED\n'
