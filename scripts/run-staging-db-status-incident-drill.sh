#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
HEALTH_SCRIPT="${HEALTH_SCRIPT:-$ROOT_DIR/scripts/production-health-check.sh}"
WAIT_SECONDS="${WAIT_SECONDS:-10}"
INCIDENT_UI_WAIT_SECONDS="${INCIDENT_UI_WAIT_SECONDS:-15}"
RECOVERY_ATTEMPTS="${RECOVERY_ATTEMPTS:-18}"
RECOVERY_WAIT_SECONDS="${RECOVERY_WAIT_SECONDS:-5}"
UI_CONFIRM="${UI_CONFIRM:-auto}"
ALERT_ORIGIN="${ALERT_ORIGIN:-DEV}"

STOPPED_SERVICES=()

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

fail() {
  printf 'FAILED %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

service_container_id() {
  local service="$1"

  dc ps -a -q "$service" | head -n1
}

docker_start_service_container() {
  local service="$1"
  local container_id

  container_id="$(service_container_id "$service")"
  [[ -n "$container_id" ]] || fail "container_not_found service=$service"

  docker start "$container_id" >/dev/null
}

start_all_mongo_members() {
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    docker_start_service_container "$service" || true
  done
}

restore_stopped_services() {
  local service

  if [[ "${#STOPPED_SERVICES[@]}" -eq 0 ]]; then
    return
  fi

  printf 'Restoring stopped members: %s\n' "${STOPPED_SERVICES[*]}"

  for service in "${STOPPED_SERVICES[@]}"; do
    docker_start_service_container "$service" || true
  done
}

trap restore_stopped_services EXIT

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

  printf '%s: health_exit=%s\n' "$label" "$exit_code"
}

wait_for_health_exit() {
  local expected_exit="$1"
  local label="$2"
  local attempt
  local exit_code

  for attempt in $(seq 1 "$RECOVERY_ATTEMPTS"); do
    set +e
    run_health
    exit_code=$?
    set -e

    if [[ "$exit_code" == "$expected_exit" ]]; then
      printf '%s: health_exit=%s attempt=%s\n' "$label" "$exit_code" "$attempt"
      return
    fi

    printf '%s waiting: health_exit=%s attempt=%s\n' "$label" "$exit_code" "$attempt"
    sleep "$RECOVERY_WAIT_SECONDS"
  done

  fail "health_exit_not_reached label=$label expected=$expected_exit actual=$exit_code"
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

confirm_ui_observation() {
  local stage="$1"
  local expected="$2"
  local answer

  should_prompt_ui || return 0

  printf '\nUI check - %s\n' "$stage"
  printf '%s\n' "$expected"
  printf 'Est-ce que tu vois ca dans Status BD? [oui/non] '

  read -r answer

  case "${answer,,}" in
    oui|o|yes|y)
      printf 'OK observation_ui=%s\n' "$stage"
      ;;
    *)
      fail "ui_observation_not_confirmed stage=$stage"
      ;;
  esac
}

confirm_incident_step() {
  local answer

  should_prompt_ui || return 0

  printf '\nCONFIRMATION INCIDENT LOCAL\n'
  printf 'Avant de continuer, clique Rafraichir dans Status BD ou clique dans la page pour garder ta session navigateur active.\n'
  printf 'Si un avertissement de session apparait, clique pour continuer la session maintenant, pendant que Mongo a encore une majorite.\n'
  printf 'La prochaine etape arrete le deuxieme secondary local. Le replica set devrait tomber a 1/3 et perdre la majorite.\n'
  printf 'Tape exactement INCIDENT pour continuer: '

  read -r answer

  [[ "$answer" == "INCIDENT" ]] || fail "incident_step_not_confirmed"
}

require_command docker
require_command grep
require_command jq

[[ -x "$HEALTH_SCRIPT" ]] || fail "health_script_not_executable path=$HEALTH_SCRIPT"

printf '\nTesting local Mongo 1/3 incident drill\n'

start_all_mongo_members
sleep "$WAIT_SECONDS"

wait_for_health_exit 0 "Baseline"
confirm_ui_observation \
  "etat initial" \
  "Avant de continuer: reconnecte-toi si necessaire, ouvre Status BD, clique Rafraichir, puis Effacer transitions. Tu ne dois PAS voir Session expiree. Tu devrais voir: OK, Sante 3/3, Primary confirme 1, Writable primary Oui, Secondaries sains 2, Majorite disponible, et aucune transition affichee."

primary="$(primary_service)"
secondary_one="$(choose_secondary "$primary")"
secondary_two="$(choose_other_secondary "$primary" "$secondary_one")"

printf 'Primary: %s\n' "$primary"
printf 'Secondary #1 to stop: %s\n' "$secondary_one"
printf 'Secondary #2 to stop: %s\n' "$secondary_two"

printf 'Stopping first secondary: %s\n' "$secondary_one"
dc stop "$secondary_one" >/dev/null
STOPPED_SERVICES+=("$secondary_one")
sleep "$WAIT_SECONDS"

run_health_expect_exit 1 "Degraded 2/3"
confirm_ui_observation \
  "degrade 2/3" \
  "Tu devrais voir: Degrade, Sante 2/3, Primary confirme 1, Writable primary Oui, Secondaries sains 1, Majorite disponible. Une carte Degrade devrait etre visible. Si tu vois Session expiree, reponds non pour restaurer le cluster."

confirm_incident_step

printf 'Stopping second secondary: %s\n' "$secondary_two"
dc stop "$secondary_two" >/dev/null
STOPPED_SERVICES+=("$secondary_two")
sleep "$WAIT_SECONDS"

run_health_expect_exit 2 "Incident 1/3"
printf 'Waiting for UI/API refresh after incident: %ss\n' "$INCIDENT_UI_WAIT_SECONDS"
sleep "$INCIDENT_UI_WAIT_SECONDS"
confirm_ui_observation \
  "incident 1/3" \
  "Ne fais PAS de refresh navigateur complet pendant l'incident 1/3. Attends le rafraichissement automatique du panneau Status BD, ou utilise seulement le bouton Rafraichir de la page si elle reste chargee. Tu devrais voir un etat severe: badge Incident et Majorite indisponible, ou des cartes Non disponible / Replica set non detecte si Mongo ne peut plus fournir ses metadonnees. A 1/3, Primary confirme 0 et Writable primary Non sont attendus: le dernier primary connu peut etre affiche comme contexte, mais Mongo ne doit plus accepter d'ecritures sans majorite. Par contre, si tu vois Session expiree, reponds non pour restaurer le cluster."

printf 'Restarting stopped secondaries...\n'
restore_stopped_services
STOPPED_SERVICES=()
sleep "$WAIT_SECONDS"

wait_for_health_exit 0 "Restored OK 3/3"
confirm_ui_observation \
  "retour OK" \
  "Le cluster est restaure. Si le UI affiche Session expiree, reconnecte-toi maintenant, retourne dans Status BD, puis clique Rafraichir. Tu devrais voir: OK, Sante 3/3, Primary confirme 1, Writable primary Oui, Secondaries sains 2, Majorite disponible. Les transitions devraient montrer Degrade, Incident, puis OK."

printf 'LOCAL_STAGING_MONGO_INCIDENT_DRILL_PASSED\n'
