#!/usr/bin/env bash

set -euo pipefail

MONGO_REPLICA_1_PREFIX="${MONGO_REPLICA_1_PREFIX:-mongo-replica-1-}"
MONGO_REPLICA_2_PREFIX="${MONGO_REPLICA_2_PREFIX:-mongo-replica-2-}"
MONGO_REPLICA_CONTAINER_PREFIX="${MONGO_REPLICA_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}"
HEALTH_SCRIPT="${HEALTH_SCRIPT:-/opt/clinia/scripts/production-health-check.sh}"
ALERT_ORIGIN="${ALERT_ORIGIN:-PROD}"
ALERT_WEBHOOK_FORMAT="${ALERT_WEBHOOK_FORMAT:-slack}"
WAIT_SECONDS="${WAIT_SECONDS:-10}"
RESTORE_WAIT_ATTEMPTS="${RESTORE_WAIT_ATTEMPTS:-24}"
RESTORE_WAIT_SECONDS="${RESTORE_WAIT_SECONDS:-5}"
CONFIRM_PRODUCTION_MONGO_INCIDENT_DRILL="${CONFIRM_PRODUCTION_MONGO_INCIDENT_DRILL:-}"
UI_CONFIRM="${UI_CONFIRM:-auto}"

STOPPED_CONTAINERS=()

info() {
  printf 'INFO %s\n' "$*"
}

warn() {
  printf 'WARN %s\n' "$*" >&2
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

source_env_if_present() {
  local path="$1"

  if [[ -f "$path" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$path"
    set +a
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

docker_names() {
  docker ps --format '{{.Names}}'
}

find_running_container_by_prefix() {
  local prefix="$1"

  docker_names |
    awk -v prefix="$prefix" '
      index($1, prefix) == 1 {
        print $1
        exit
      }
    '
}

remember_stopped_container() {
  local container="$1"
  STOPPED_CONTAINERS+=("$container")
}

forget_stopped_container() {
  local target="$1"
  local next=()
  local container

  for container in "${STOPPED_CONTAINERS[@]}"; do
    if [[ "$container" != "$target" ]]; then
      next+=("$container")
    fi
  done

  STOPPED_CONTAINERS=("${next[@]}")
}

start_container() {
  local container="$1"

  info "starting container=$container"
  docker start "$container" >/dev/null
  forget_stopped_container "$container"
}

restore_containers() {
  local container

  if [[ "${#STOPPED_CONTAINERS[@]}" -eq 0 ]]; then
    return
  fi

  warn "restore=starting containers=${STOPPED_CONTAINERS[*]}"

  for container in "${STOPPED_CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
      docker start "$container" >/dev/null 2>&1 || warn "restore_start_failed container=$container"
    fi
  done
}

on_exit() {
  restore_containers
}

trap on_exit EXIT

run_health() {
  CHECK_CONTAINERS=false \
  CHECK_MONGO_REPLICA=true \
  ALERT_ORIGIN="$ALERT_ORIGIN" \
  ALERT_WEBHOOK_FORMAT="$ALERT_WEBHOOK_FORMAT" \
  ALERT_WEBHOOK_URL= \
  MONGO_DEGRADED_WEBHOOK_URL="${MONGO_DEGRADED_WEBHOOK_URL:-}" \
  MONGO_INCIDENT_WEBHOOK_URL="${MONGO_INCIDENT_WEBHOOK_URL:-}" \
  MONGO_REPLICA_CONTAINER_PREFIX="$MONGO_REPLICA_CONTAINER_PREFIX" \
  MONGO_REPLICA_CONTAINER_EXCLUDE_PREFIX= \
  MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
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

stop_container_for_drill() {
  local container="$1"

  info "stopping container=$container"
  docker stop "$container" >/dev/null
  remember_stopped_container "$container"
}

wait_for_normal_after_restore() {
  local attempt
  local exit_code

  for attempt in $(seq 1 "$RESTORE_WAIT_ATTEMPTS"); do
    set +e
    run_health
    exit_code=$?
    set -e

    if [[ "$exit_code" == "0" ]]; then
      info "health_check=normal_after_restore exit=0 attempt=$attempt"
      return
    fi

    info "normal_after_restore=waiting attempt=$attempt exit=$exit_code sleep_seconds=$RESTORE_WAIT_SECONDS"
    sleep "$RESTORE_WAIT_SECONDS"
  done

  fail "mongo_not_normal_after_restore"
}

should_prompt_ui() {
  case "${UI_CONFIRM,,}" in
    1|true|yes|y|oui|o)
      return 0
      ;;
    0|false|no|n|non)
      return 1
      ;;
    auto)
      [[ -t 0 ]]
      return
      ;;
    *)
      fail "invalid_ui_confirm value=$UI_CONFIRM expected=auto|1|0"
      ;;
  esac
}

confirm_step() {
  local label="$1"
  local expected="$2"
  local answer

  should_prompt_ui || return 0

  printf '\nUI check - %s\n' "$label"
  printf '%s\n' "$expected"
  printf 'Continuer? [oui/non] '

  read -r answer

  case "${answer,,}" in
    oui|o|yes|y)
      info "ui_observation_confirmed=$label"
      ;;
    *)
      fail "ui_observation_not_confirmed stage=$label"
      ;;
  esac
}

confirm_incident_step() {
  local answer

  should_prompt_ui || return 0

  printf '\nCONFIRMATION INCIDENT\n'
  printf 'La prochaine etape arrete le deuxieme secondaire. Mongo devrait passer a 1/3 et perdre la majorite.\n'
  printf 'Les ecritures critiques avec w=majority ne doivent pas etre considerees disponibles pendant cette fenetre.\n'
  printf 'Tape exactement INCIDENT pour continuer: '

  read -r answer

  [[ "$answer" == "INCIDENT" ]] || fail "incident_step_not_confirmed"
}

source_env_if_present /root/clinia-backup-alert.env
source_env_if_present /root/clinia-backup-s3.env
source_env_if_present /root/clinia-mongo-alerts.env

if [[ "$CONFIRM_PRODUCTION_MONGO_INCIDENT_DRILL" != "RUN_CLINIA_MONGO_1_OF_3_DRILL" ]]; then
  fail "missing_confirmation set CONFIRM_PRODUCTION_MONGO_INCIDENT_DRILL=RUN_CLINIA_MONGO_1_OF_3_DRILL"
fi

require_command awk
require_command docker
require_command grep

[[ -x "$HEALTH_SCRIPT" ]] || fail "health_script_not_executable path=$HEALTH_SCRIPT"

if ! docker info >/dev/null 2>&1; then
  fail "docker_unavailable"
fi

secondary_1="$(find_running_container_by_prefix "$MONGO_REPLICA_1_PREFIX")"
secondary_2="$(find_running_container_by_prefix "$MONGO_REPLICA_2_PREFIX")"

[[ -n "$secondary_1" ]] || fail "mongo_secondary_not_found prefix=$MONGO_REPLICA_1_PREFIX"
[[ -n "$secondary_2" ]] || fail "mongo_secondary_not_found prefix=$MONGO_REPLICA_2_PREFIX"

info "production_mongo_incident_drill=started origin=$ALERT_ORIGIN"
run_health_expect_exit 0 "normal_before_drill"
confirm_step \
  "etat initial" \
  "Status BD devrait afficher OK, Sante 3/3, Primary 1, Secondaries 2, Majorite disponible. Clique Effacer transitions avant de continuer si tu veux une lecture propre."

stop_container_for_drill "$secondary_1"
sleep "$WAIT_SECONDS"
run_health_expect_exit 1 "degraded_two_of_three"
confirm_step \
  "degrade_two_of_three" \
  "Status BD devrait afficher Degrade, Sante 2/3, Primary 1, Secondaries 1, Majorite disponible. Le service est degrade mais les ecritures majority devraient encore etre possibles."

confirm_incident_step

stop_container_for_drill "$secondary_2"
sleep "$WAIT_SECONDS"
run_health_expect_exit 2 "incident_one_of_three"
confirm_step \
  "incident_one_of_three" \
  "Status BD devrait afficher Incident ou une erreur de disponibilite Mongo. Le point important est 1/3 ou majority indisponible; les ecritures majority ne doivent pas etre considerees disponibles."

start_container "$secondary_1"
start_container "$secondary_2"
sleep "$WAIT_SECONDS"
wait_for_normal_after_restore
confirm_step \
  "retour_normal" \
  "Status BD devrait revenir a OK, Sante 3/3, Primary 1, Secondaries 2, Majorite disponible. Les transitions devraient montrer Degrade, Incident, puis OK."

info "PRODUCTION_MONGO_INCIDENT_DRILL_PASSED origin=$ALERT_ORIGIN"
