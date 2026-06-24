#!/usr/bin/env bash

set -euo pipefail

BACKEND_PREFIX="${BACKEND_PREFIX:-backend-}"
BACKEND_REPLICA_PREFIX="${BACKEND_REPLICA_PREFIX:-backend-replica-}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
MONGO_REPLICA_1_PREFIX="${MONGO_REPLICA_1_PREFIX:-mongo-replica-1-}"
MONGO_REPLICA_2_PREFIX="${MONGO_REPLICA_2_PREFIX:-mongo-replica-2-}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}"
HEALTH_READY_URL="${HEALTH_READY_URL:-https://clinique-ai.ca/api/health/ready}"
HTTP_WAIT_ATTEMPTS="${HTTP_WAIT_ATTEMPTS:-12}"
HTTP_WAIT_SECONDS="${HTTP_WAIT_SECONDS:-5}"
REPLICA_WAIT_ATTEMPTS="${REPLICA_WAIT_ATTEMPTS:-24}"
REPLICA_WAIT_SECONDS="${REPLICA_WAIT_SECONDS:-5}"
MAX_REPLICA_LAG_SECONDS="${MAX_REPLICA_LAG_SECONDS:-10}"
CONFIRM_PRODUCTION_FAILOVER_DRILL="${CONFIRM_PRODUCTION_FAILOVER_DRILL:-}"

STOPPED_CONTAINERS=()
DRILL_FAILED=0
MONGO_PASSWORD=""

info() {
  printf 'INFO %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1" >&2
}

fail() {
  DRILL_FAILED=1
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
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

cleanup() {
  local container

  if [[ "${#STOPPED_CONTAINERS[@]}" -eq 0 ]]; then
    return
  fi

  warn "cleanup=starting containers=${STOPPED_CONTAINERS[*]}"

  for container in "${STOPPED_CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
      docker start "$container" >/dev/null 2>&1 || warn "cleanup_start_failed container=$container"
    fi
  done
}

on_exit() {
  local status="$1"

  if [[ "$status" -ne 0 ]]; then
    warn 'production_failover_drill=failed verdict="DRILL FAILED: cleanup attempted; review output above"'
  fi

  cleanup
}

trap 'on_exit "$?"' EXIT

docker_names() {
  docker ps --format '{{.Names}}'
}

all_docker_status() {
  docker ps -a --format '{{.Names}}|{{.Status}}'
}

find_running_backend_primary() {
  docker_names |
    awk -v backend="$BACKEND_PREFIX" -v replica="$BACKEND_REPLICA_PREFIX" '
      index($1, backend) == 1 && index($1, replica) != 1 {
        print $1
        exit
      }
    '
}

find_stopped_backend_primary() {
  all_docker_status |
    awk -F'|' -v backend="$BACKEND_PREFIX" -v replica="$BACKEND_REPLICA_PREFIX" '
      index($1, backend) == 1 && index($1, replica) != 1 && index($2, "Exited") == 1 {
        print $1
        exit
      }
    '
}

find_running_mongo_secondary() {
  local prefix="$1"

  docker_names |
    awk -v prefix="$prefix" '
      index($1, prefix) == 1 {
        print $1
        exit
      }
    '
}

find_stopped_mongo_by_prefix() {
  local prefix="$1"

  all_docker_status |
    awk -F'|' -v prefix="$prefix" '
      index($1, prefix) == 1 && index($2, "Exited") == 1 {
        print $1
        exit
      }
    '
}

mongo_containers() {
  docker_names |
    awk -v primary="$MONGO_CONTAINER_PREFIX" -v replica1="$MONGO_REPLICA_1_PREFIX" -v replica2="$MONGO_REPLICA_2_PREFIX" '
      index($1, primary) == 1 || index($1, replica1) == 1 || index($1, replica2) == 1 {
        print $1
      }
    '
}

load_mongo_password() {
  local container="$1"

  docker inspect "$container" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
    tail -n1
}

ensure_mongo_password() {
  local container

  if [[ -n "$MONGO_PASSWORD" ]]; then
    return
  fi

  while IFS= read -r container; do
    MONGO_PASSWORD="$(load_mongo_password "$container")"
    [[ -n "$MONGO_PASSWORD" ]] && return
  done < <(mongo_containers)

  fail 'mongo_root_password_not_found'
}

find_primary_mongo_container() {
  local container

  ensure_mongo_password

  while IFS= read -r container; do
    if docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$container" \
      sh -c 'mongosh --quiet \
        --username root \
        --password="$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.hello().isWritablePrimary === true"' |
      grep -q 'true'; then
      printf '%s\n' "$container"
      return
    fi
  done < <(mongo_containers)

  return 1
}

first_running_mongo_container() {
  mongo_containers | head -n1
}

mongo_normal_summary() {
  local container="$1"

  ensure_mongo_password

  docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$container" \
    sh -c 'mongosh --quiet \
      --username root \
      --password="$MONGO_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const status = rs.status();
        const members = status.members.map(m => ({
          name: m.name,
          stateStr: m.stateStr,
          health: m.health,
          optimeDate: m.optimeDate,
          lastHeartbeatMessage: m.lastHeartbeatMessage || null
        }));
        const primaryCount = members.filter(m => m.stateStr === \"PRIMARY\" && m.health === 1).length;
        const secondaryCount = members.filter(m => m.stateStr === \"SECONDARY\" && m.health === 1).length;
        const unhealthyCount = members.filter(m => m.health !== 1 || ![\"PRIMARY\", \"SECONDARY\"].includes(m.stateStr)).length;
        const optimes = members
          .filter(m => m.optimeDate)
          .map(m => new Date(m.optimeDate).getTime());
        const lagSeconds = optimes.length
          ? Math.round((Math.max(...optimes) - Math.min(...optimes)) / 1000)
          : null;
        printjson({ set: status.set, ok: status.ok, myState: status.myState, primaryCount, secondaryCount, unhealthyCount, lagSeconds, members });
        if (status.ok !== 1) quit(2);
        if (primaryCount !== 1) quit(3);
        if (secondaryCount !== 2) quit(4);
        if (unhealthyCount !== 0) quit(5);
        if (lagSeconds !== null && lagSeconds > '"$MAX_REPLICA_LAG_SECONDS"') quit(6);
      "'
}

wait_for_mongo_normal() {
  local attempt
  local container

  for attempt in $(seq 1 "$REPLICA_WAIT_ATTEMPTS"); do
    container="$(first_running_mongo_container || true)"

    if [[ -n "$container" ]] && mongo_normal_summary "$container"; then
      info "mongo_normal=ok attempt=$attempt"
      return
    fi

    info "mongo_normal=waiting attempt=$attempt sleep_seconds=$REPLICA_WAIT_SECONDS"
    sleep "$REPLICA_WAIT_SECONDS"
  done

  fail 'mongo_not_normal_after_wait'
}

wait_for_http_ready() {
  local allow_initial_failures="${1:-false}"
  local attempt
  local ok_count=0

  for attempt in $(seq 1 "$HTTP_WAIT_ATTEMPTS"); do
    if curl -fsS "$HEALTH_READY_URL" >/dev/null; then
      ok_count=$((ok_count + 1))
      info "http_ready=ok attempt=$attempt"

      if [[ "$allow_initial_failures" == "true" || "$ok_count" -ge 2 ]]; then
        return
      fi
    else
      info "http_ready=waiting attempt=$attempt sleep_seconds=$HTTP_WAIT_SECONDS"
    fi

    sleep "$HTTP_WAIT_SECONDS"
  done

  fail "http_ready_failed url=$HEALTH_READY_URL"
}

stop_container() {
  local container="$1"

  info "stopping container=$container"
  docker stop "$container"
  remember_stopped_container "$container"
}

start_container() {
  local container="$1"

  info "starting container=$container"
  docker start "$container"
  forget_stopped_container "$container"
}

drill_backend_failover() {
  local backend_primary
  local stopped_backend

  info 'drill=backend_failover status=started'
  backend_primary="$(find_running_backend_primary)"
  [[ -n "$backend_primary" ]] || fail 'backend_primary_not_found'

  stop_container "$backend_primary"
  wait_for_http_ready false

  stopped_backend="$(find_stopped_backend_primary)"
  [[ -n "$stopped_backend" ]] || stopped_backend="$backend_primary"
  start_container "$stopped_backend"
  wait_for_http_ready false

  info 'drill=backend_failover status=passed'
}

drill_mongo_secondary_failure() {
  local secondary

  info 'drill=mongo_secondary_failure status=started'
  secondary="$(find_running_mongo_secondary "$MONGO_REPLICA_1_PREFIX")"
  [[ -n "$secondary" ]] || fail 'mongo_secondary_not_found prefix=mongo-replica-1'

  stop_container "$secondary"
  wait_for_http_ready false
  start_container "$secondary"
  wait_for_mongo_normal
  wait_for_http_ready false

  info 'drill=mongo_secondary_failure status=passed'
}

drill_mongo_primary_failover() {
  local primary

  info 'drill=mongo_primary_failover status=started'
  primary="$(find_primary_mongo_container)" || fail 'mongo_primary_not_found'

  stop_container "$primary"
  wait_for_http_ready true
  start_container "$primary"
  wait_for_mongo_normal
  wait_for_http_ready false

  info 'drill=mongo_primary_failover status=passed'
}

require_command awk
require_command curl
require_command docker
require_command grep
require_command head
require_command sed

if [[ "$CONFIRM_PRODUCTION_FAILOVER_DRILL" != "RUN_CLINIA_FAILOVER_DRILL" ]]; then
  fail 'missing_confirmation set CONFIRM_PRODUCTION_FAILOVER_DRILL=RUN_CLINIA_FAILOVER_DRILL'
fi

if ! docker info >/dev/null 2>&1; then
  fail 'docker_unavailable'
fi

info 'production_failover_drill=started'
wait_for_mongo_normal
wait_for_http_ready false

drill_backend_failover
drill_mongo_secondary_failure
drill_mongo_primary_failover

wait_for_mongo_normal
wait_for_http_ready false

if [[ "$DRILL_FAILED" -eq 0 ]]; then
  info 'production_failover_drill=passed verdict="DRILL PASSED: all tested services returned to normal"'
  exit 0
fi

fail 'production_failover_drill_failed verdict="DRILL FAILED: review output above"'
