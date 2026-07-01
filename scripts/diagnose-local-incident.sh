#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
MONGO_LAG_WARN_SECONDS="${MONGO_LAG_WARN_SECONDS:-10}"
LOG_TAIL_LINES="${LOG_TAIL_LINES:-40}"
VERBOSE="${VERBOSE:-0}"

TMP_DIR="${TMP_DIR:-/tmp/clinia-local-incident-diagnose}"
MONGO_STATUS_FILE="$TMP_DIR/mongo-status.json"
CONTAINER_STATUS_FILE="$TMP_DIR/containers.txt"
READY_FILE="$TMP_DIR/ready.json"

mkdir -p "$TMP_DIR"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

section() {
  printf '\n%s\n' "$1"
}

info() {
  if [[ "$VERBOSE" == "1" || "${VERBOSE,,}" == "true" ]]; then
    printf 'INFO %s\n' "$*"
  fi
}

warn() {
  printf 'WARN %s\n' "$*" >&2
}

fail() {
  printf 'FAILED %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

service_running() {
  local service="$1"
  dc ps --services --status running | grep -Fxq "$service"
}

service_status_line() {
  local service="$1"
  dc ps -a --format json "$service" 2>/dev/null |
    jq -r --arg service "$service" '
      if .Name then
        "\($service): \(.State) \(.Status)"
      else
        "\($service): missing"
      end
    ' 2>/dev/null || printf '%s: missing\n' "$service"
}

write_container_snapshot() {
  : >"$CONTAINER_STATUS_FILE"
  for service in backend backend-replica mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    service_status_line "$service" >>"$CONTAINER_STATUS_FILE"
  done
}

first_running_mongo_service() {
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if service_running "$service"; then
      printf '%s' "$service"
      return 0
    fi
  done

  return 1
}

read_api_ready() {
  if curl -fsS --max-time 5 "$BASE_URL/api/health/ready" >"$READY_FILE" 2>/dev/null; then
    printf 'ok'
    return
  fi

  printf 'failed'
}

read_mongo_status() {
  local service

  service="$(first_running_mongo_service)" || return 1

  dc exec -T "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "
      const status = rs.status();
      const members = status.members || [];
      const primary = members.find((m) => m.stateStr === \"PRIMARY\" && m.health === 1);
      const primaryOptime = primary?.optimeDate ? new Date(primary.optimeDate).getTime() : null;
      const normalized = members.map((m) => {
        const isReplicating = m.health === 1 && [\"PRIMARY\", \"SECONDARY\"].includes(m.stateStr);
        const optimeMs = isReplicating && m.optimeDate ? new Date(m.optimeDate).getTime() : null;
        const lagSeconds = primaryOptime !== null && optimeMs !== null
          ? Math.max(0, Math.round((primaryOptime - optimeMs) / 1000))
          : null;
        return {
          name: m.name,
          state: m.stateStr,
          health: m.health,
          lagSeconds,
          syncSourceHost: m.syncSourceHost || null,
          lastHeartbeatMessage: m.lastHeartbeatMessage || null
        };
      });
      print(JSON.stringify({
        ok: status.ok,
        set: status.set,
        members: normalized
      }));
    "' >"$MONGO_STATUS_FILE"
}

mongo_summary_line() {
  jq -r --argjson threshold "$MONGO_LAG_WARN_SECONDS" '
    .members as $members |
    ($members | length) as $total |
    ($members | map(select(.health == 1)) | length) as $healthy |
    ($members | map(select(.health == 1 and .state == "PRIMARY")) | length) as $primary |
    ($members | map(select(.health == 1 and .state == "SECONDARY")) | length) as $secondaries |
    ([ $members[].lagSeconds // empty ] | max // 0) as $lag |
    "Mongo: \($healthy)/\($total) healthy, primary=\($primary), secondaries=\($secondaries), lag=\($lag)s / \($threshold)s"
  ' "$MONGO_STATUS_FILE"
}

mongo_diagnosis() {
  jq -r --argjson threshold "$MONGO_LAG_WARN_SECONDS" '
    .members as $members |
    ($members | length) as $total |
    ($members | map(select(.health == 1)) | length) as $healthy |
    ($members | map(select(.health == 1 and .state == "PRIMARY")) | length) as $primary |
    ($members | map(select(.health == 1 and .state == "SECONDARY")) | length) as $secondaries |
    ([ $members[].lagSeconds // empty ] | max // 0) as $lag |
    if ($primary != 1 or $healthy < (($total / 2 | floor) + 1)) then
      "MONGO_INCIDENT"
    elif ($healthy < $total) then
      "MONGO_DEGRADED"
    elif ($lag > $threshold) then
      "REPLICA_LAGGING"
    else
      "OK"
    end
  ' "$MONGO_STATUS_FILE"
}

print_mongo_members() {
  jq -r '
    .members[]
    | " - \(.name): state=\(.state) health=\(.health) lag=\(.lagSeconds // "N/D")s syncSource=\(.syncSourceHost // "-") message=\(.lastHeartbeatMessage // "-")"
  ' "$MONGO_STATUS_FILE"
}

print_recommendations() {
  local diagnosis="$1"
  local api_status="$2"

  section "Diagnostic"

  if [[ "$api_status" != "ok" ]]; then
    printf 'BACKEND_READY_FAILED\n'
    printf 'Impact: l API locale ne repond pas a /api/health/ready.\n'
    printf 'Action proposee: redemarrer backend/backend-replica, puis verifier les logs backend.\n'
    printf 'Commande: docker compose -p %s -f %s restart backend backend-replica\n' "$COMPOSE_PROJECT" "$COMPOSE_FILE"
    printf 'Commande logs: docker compose -p %s -f %s logs --tail=%s backend backend-replica\n' "$COMPOSE_PROJECT" "$COMPOSE_FILE" "$LOG_TAIL_LINES"
    return
  fi

  case "$diagnosis" in
    OK)
      printf 'OK\n'
      printf 'Impact: aucun probleme local detecte dans les controles principaux.\n'
      printf 'Action proposee: aucune correction immediate.\n'
      ;;
    MONGO_DEGRADED)
      printf 'MONGO_DEGRADED\n'
      printf 'Impact: Mongo a encore une majorite; les ecritures avec w=majority peuvent continuer, mais la marge de securite est reduite.\n'
      printf 'Action proposee: redemarrer le membre Mongo arrete, verifier les logs Mongo, puis confirmer le retour 3/3.\n'
      printf 'Commande: docker compose -p %s -f %s start mongo-rs-1 mongo-rs-2 mongo-rs-3\n' "$COMPOSE_PROJECT" "$COMPOSE_FILE"
      ;;
    MONGO_INCIDENT)
      printf 'MONGO_INCIDENT\n'
      printf 'Impact: Mongo n a pas une majorite saine avec un primary; les ecritures critiques peuvent echouer ou etre bloquees.\n'
      printf 'Action proposee: ne pas restaurer automatiquement. Redemarrer les membres Mongo manquants, verifier election primary, puis tester /api/health/ready.\n'
      printf 'Commande: docker compose -p %s -f %s start mongo-rs-1 mongo-rs-2 mongo-rs-3\n' "$COMPOSE_PROJECT" "$COMPOSE_FILE"
      ;;
    REPLICA_LAGGING)
      printf 'REPLICA_LAGGING\n'
      printf 'Impact: les membres sont en ligne, mais un secondaire ne suit pas la cadence du primary.\n'
      printf 'Action proposee: inspecter charge disque/CPU, volume ecritures, logs Mongo et attendre un rattrapage avant de faire un restore ou un failover volontaire.\n'
      printf 'Commande logs: docker compose -p %s -f %s logs --tail=%s mongo-rs-1 mongo-rs-2 mongo-rs-3\n' "$COMPOSE_PROJECT" "$COMPOSE_FILE" "$LOG_TAIL_LINES"
      ;;
    *)
      printf 'UNKNOWN\n'
      printf 'Impact: diagnostic non reconnu; examiner les details ci-dessus.\n'
      ;;
  esac
}

print_recent_logs_hint() {
  section "Logs utiles"
  printf 'Backend:\n'
  dc logs --tail="$LOG_TAIL_LINES" backend backend-replica 2>/dev/null |
    tail -n "$LOG_TAIL_LINES" |
    sed 's/^/  /' || printf '  logs backend indisponibles\n'

  printf 'Mongo:\n'
  dc logs --tail="$LOG_TAIL_LINES" mongo-rs-1 mongo-rs-2 mongo-rs-3 2>/dev/null |
    tail -n "$LOG_TAIL_LINES" |
    sed 's/^/  /' || printf '  logs mongo indisponibles\n'
}

require_command curl
require_command docker
require_command jq

write_container_snapshot
api_ready_status="$(read_api_ready)"

mongo_status="unavailable"
if read_mongo_status >/dev/null 2>&1; then
  mongo_status="$(mongo_diagnosis)"
fi

printf 'ClinIA local incident diagnosis\n'
printf 'Base URL: %s\n' "$BASE_URL"
printf 'Compose project: %s\n' "$COMPOSE_PROJECT"

section "Containers"
cat "$CONTAINER_STATUS_FILE"

section "Health"
printf 'API ready: %s\n' "$api_ready_status"
if [[ "$api_ready_status" == "ok" ]]; then
  jq -r '" - status=\(.data.status // "-") mongo=\(.data.dependencies.mongo // "-") instance=\(.meta.instanceId // "-")"' "$READY_FILE" 2>/dev/null || true
fi

section "Mongo replica"
if [[ -s "$MONGO_STATUS_FILE" ]]; then
  mongo_summary_line
  print_mongo_members
else
  printf 'Mongo: unavailable\n'
fi

print_recommendations "$mongo_status" "$api_ready_status"

if [[ "$VERBOSE" == "1" || "${VERBOSE,,}" == "true" ]]; then
  print_recent_logs_hint
fi

case "$api_ready_status:$mongo_status" in
  ok:OK) exit 0 ;;
  ok:MONGO_DEGRADED|ok:REPLICA_LAGGING) exit 1 ;;
  *) exit 2 ;;
esac
