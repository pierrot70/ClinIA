#!/usr/bin/env bash

set -euo pipefail

WARN_COUNT=0
CRITICAL_COUNT=0

DISK_PATH="${DISK_PATH:-/}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
DISK_CRITICAL_PERCENT="${DISK_CRITICAL_PERCENT:-90}"
MEMORY_WARN_PERCENT="${MEMORY_WARN_PERCENT:-80}"
MEMORY_CRITICAL_PERCENT="${MEMORY_CRITICAL_PERCENT:-90}"
CHECK_CONTAINERS="${CHECK_CONTAINERS:-true}"
FRONTEND_PREFIX="${FRONTEND_PREFIX:-frontend-}"
BACKEND_PREFIX="${BACKEND_PREFIX:-backend-}"
BACKEND_REPLICA_PREFIX="${BACKEND_REPLICA_PREFIX:-backend-replica-}"
MONGO_PREFIX="${MONGO_PREFIX:-mongo-}"
MONGO_REPLICA_PREFIX="${MONGO_REPLICA_PREFIX:-mongo-replica-}"
MONGO_REPLICA_1_PREFIX="${MONGO_REPLICA_1_PREFIX:-mongo-replica-1-}"
MONGO_REPLICA_2_PREFIX="${MONGO_REPLICA_2_PREFIX:-mongo-replica-2-}"
CHECK_MONGO_REPLICA="${CHECK_MONGO_REPLICA:-false}"
MONGO_REPLICA_CONTAINER_PREFIX="${MONGO_REPLICA_CONTAINER_PREFIX:-mongo-}"
MONGO_REPLICA_CONTAINER_EXCLUDE_PREFIX="${MONGO_REPLICA_CONTAINER_EXCLUDE_PREFIX:-mongo-replica-}"
MONGO_REPLICA_SET_NAME="${MONGO_REPLICA_SET_NAME:-rs0}"
MONGO_REPLICA_EXPECTED_MEMBERS="${MONGO_REPLICA_EXPECTED_MEMBERS:-3}"
MONGO_REPLICA_EXPECTED_SECONDARIES="${MONGO_REPLICA_EXPECTED_SECONDARIES:-2}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}"
CHECK_HTTP_READY="${CHECK_HTTP_READY:-false}"
HTTP_READY_URL="${HTTP_READY_URL:-https://clinique-ai.ca/api/health/ready}"
HTTP_READY_TIMEOUT_SECONDS="${HTTP_READY_TIMEOUT_SECONDS:-10}"

emit() {
  local status="$1"
  local message="$2"

  printf '%s %s\n' "$status" "$message"

  case "$status" in
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    CRITICAL) CRITICAL_COUNT=$((CRITICAL_COUNT + 1)) ;;
  esac
}

check_disk() {
  local path="$1"
  local warn_percent="$2"
  local critical_percent="$3"
  local used_percent available filesystem

  if ! df_output="$(df -P "$path" 2>/dev/null | awk 'NR == 2 {print $1, $4, $5}')"; then
    emit "CRITICAL" "disk path=$path message=\"df failed\""
    return
  fi

  if [[ -z "$df_output" ]]; then
    emit "CRITICAL" "disk path=$path message=\"df returned no data\""
    return
  fi

  read -r filesystem available used_percent <<<"$df_output"
  used_percent="${used_percent%%%}"

  if ((used_percent >= critical_percent)); then
    emit "CRITICAL" "disk path=$path filesystem=$filesystem used=${used_percent}% available_kb=$available threshold=${critical_percent}%"
  elif ((used_percent >= warn_percent)); then
    emit "WARN" "disk path=$path filesystem=$filesystem used=${used_percent}% available_kb=$available threshold=${warn_percent}%"
  else
    emit "OK" "disk path=$path filesystem=$filesystem used=${used_percent}% available_kb=$available"
  fi
}

check_memory() {
  local warn_percent="$1"
  local critical_percent="$2"
  local total_kb available_kb used_kb used_percent

  memory_values="$(awk '
    /^MemTotal:/ { total = $2 }
    /^MemAvailable:/ { available = $2 }
    END {
      if (total > 0 && available >= 0) {
        print total, available
      }
    }
  ' /proc/meminfo 2>/dev/null || true)"

  if [[ -z "$memory_values" ]]; then
    emit "CRITICAL" "memory message=\"/proc/meminfo returned no usable data\""
    return
  fi

  read -r total_kb available_kb <<<"$memory_values"
  used_kb=$((total_kb - available_kb))
  used_percent=$(((used_kb * 100) / total_kb))

  if ((used_percent >= critical_percent)); then
    emit "CRITICAL" "memory used=${used_percent}% available_kb=$available_kb total_kb=$total_kb threshold=${critical_percent}%"
  elif ((used_percent >= warn_percent)); then
    emit "WARN" "memory used=${used_percent}% available_kb=$available_kb total_kb=$total_kb threshold=${warn_percent}%"
  else
    emit "OK" "memory used=${used_percent}% available_kb=$available_kb total_kb=$total_kb"
  fi
}


container_status_for_prefix() {
  local prefix="$1"
  local exclude_prefix="${2:-}"

  docker ps -a --format '{{.Names}}|{{.Status}}' |
    awk -F'|' -v prefix="$prefix" -v exclude_prefix="$exclude_prefix" '
      index($1, prefix) == 1 && (exclude_prefix == "" || index($1, exclude_prefix) != 1) {
        print $2
        found = 1
        exit
      }
      END { if (!found) exit 1 }
    '
}

check_container_up() {
  local label="$1"
  local prefix="$2"
  local exclude_prefix="${3:-}"
  local status

  if ! status="$(container_status_for_prefix "$prefix" "$exclude_prefix")"; then
    emit "CRITICAL" "container label=$label prefix=$prefix message=\"container not found\""
    return
  fi

  if [[ "$status" == Up* ]]; then
    emit "OK" "container label=$label prefix=$prefix status=\"$status\""
  else
    emit "CRITICAL" "container label=$label prefix=$prefix status=\"$status\""
  fi
}

check_container_healthy() {
  local label="$1"
  local prefix="$2"
  local exclude_prefix="${3:-}"
  local status

  if ! status="$(container_status_for_prefix "$prefix" "$exclude_prefix")"; then
    emit "CRITICAL" "container label=$label prefix=$prefix message=\"container not found\""
    return
  fi

  if [[ "$status" == Up*healthy* ]]; then
    emit "OK" "container label=$label prefix=$prefix status=\"$status\""
  elif [[ "$status" == Up* ]]; then
    emit "WARN" "container label=$label prefix=$prefix status=\"$status\" message=\"container is up but not healthy\""
  else
    emit "CRITICAL" "container label=$label prefix=$prefix status=\"$status\""
  fi
}

check_containers() {
  if ! command -v docker >/dev/null 2>&1; then
    emit "CRITICAL" "docker message=\"docker command not found\""
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    emit "CRITICAL" "docker message=\"docker daemon unavailable\""
    return
  fi

  check_container_up "frontend" "$FRONTEND_PREFIX"
  check_container_healthy "backend" "$BACKEND_PREFIX" "$BACKEND_REPLICA_PREFIX"
  check_container_healthy "backend-replica" "$BACKEND_REPLICA_PREFIX"
  check_container_up "mongo" "$MONGO_PREFIX" "$MONGO_REPLICA_PREFIX"
  check_container_up "mongo-replica-1" "$MONGO_REPLICA_1_PREFIX"
  check_container_up "mongo-replica-2" "$MONGO_REPLICA_2_PREFIX"
}

mongo_container_for_replica_check() {
  docker ps --format '{{.Names}}' |
    awk -v prefix="$MONGO_REPLICA_CONTAINER_PREFIX" -v exclude_prefix="$MONGO_REPLICA_CONTAINER_EXCLUDE_PREFIX" '
      index($1, prefix) == 1 && (exclude_prefix == "" || index($1, exclude_prefix) != 1) {
        print $1
        found = 1
        exit
      }
      END { if (!found) exit 1 }
    '
}

check_http_ready() {
  local response
  local http_code
  local body

  if ! command -v curl >/dev/null 2>&1; then
    emit "CRITICAL" "http_ready url=$HTTP_READY_URL message=\"curl command not found\""
    return
  fi

  if ! response="$(
    curl -sS \
      --max-time "$HTTP_READY_TIMEOUT_SECONDS" \
      -w '\n%{http_code}' \
      "$HTTP_READY_URL" 2>/dev/null
  )"; then
    emit "CRITICAL" "http_ready url=$HTTP_READY_URL message=\"request failed\""
    return
  fi

  http_code="$(printf '%s\n' "$response" | tail -n1)"
  body="$(printf '%s\n' "$response" | sed '$d')"

  if [[ "$http_code" != "200" ]]; then
    emit "CRITICAL" "http_ready url=$HTTP_READY_URL http_code=$http_code message=\"unexpected HTTP status\""
    return
  fi

  if [[ "$body" != *'"status":"ok"'* || "$body" != *'"mongo":"connected"'* ]]; then
    emit "CRITICAL" "http_ready url=$HTTP_READY_URL http_code=$http_code message=\"unexpected response body\""
    return
  fi

  emit "OK" "http_ready url=$HTTP_READY_URL http_code=$http_code"
}


check_mongo_replica_set() {
  local container
  local mongo_root_password
  local result
  local primary_count
  local secondary_count
  local healthy_count
  local total_count
  local set_name

  if ! command -v docker >/dev/null 2>&1; then
    emit "CRITICAL" "mongo_replica_set message=\"docker command not found\""
    return
  fi

  if ! container="$(mongo_container_for_replica_check)"; then
    emit "CRITICAL" "mongo_replica_set prefix=$MONGO_REPLICA_CONTAINER_PREFIX message=\"mongo container not found\""
    return
  fi

  mongo_root_password="${MONGO_ROOT_PASSWORD:-}"

  if [[ -z "$mongo_root_password" ]]; then
    mongo_root_password="$(
      docker inspect "$container" \
        --format '{{range .Config.Env}}{{println .}}{{end}}' |
      sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
      tail -n1
    )"
  fi

  if [[ -z "$mongo_root_password" ]]; then
    emit "CRITICAL" "mongo_replica_set container=$container message=\"missing Mongo root password\""
    return
  fi

  if ! result="$(
    docker exec \
      -e MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
      -e MONGO_ROOT_PASSWORD="$mongo_root_password" \
      "$container" \
      sh -lc 'mongosh --quiet \
        --username "$MONGO_ROOT_USERNAME" \
        --password "$MONGO_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval '"'"'
          const status = rs.status();
          const primaryCount = status.members.filter(m => m.stateStr === "PRIMARY" && m.health === 1).length;
          const secondaryCount = status.members.filter(m => m.stateStr === "SECONDARY" && m.health === 1).length;
          const healthyCount = status.members.filter(m => m.health === 1).length;
          print([status.set, status.members.length, primaryCount, secondaryCount, healthyCount].join(" "));
        '"'"''
  )"; then
    emit "CRITICAL" "mongo_replica_set container=$container message=\"rs.status failed\""
    return
  fi

  read -r set_name total_count primary_count secondary_count healthy_count <<<"$result"

  if [[ "$set_name" != "$MONGO_REPLICA_SET_NAME" ]]; then
    emit "CRITICAL" "mongo_replica_set set=$set_name expected_set=$MONGO_REPLICA_SET_NAME message=\"unexpected replica set name\""
    return
  fi

  if (( total_count < MONGO_REPLICA_EXPECTED_MEMBERS )); then
    emit "CRITICAL" "mongo_replica_set set=$set_name members=$total_count expected_members=$MONGO_REPLICA_EXPECTED_MEMBERS message=\"missing replica set members\""
    return
  fi

  if (( primary_count != 1 )); then
    emit "CRITICAL" "mongo_replica_set set=$set_name primary=$primary_count message=\"expected exactly one healthy primary\""
    return
  fi

  if (( secondary_count < MONGO_REPLICA_EXPECTED_SECONDARIES )); then
    emit "CRITICAL" "mongo_replica_set set=$set_name secondaries=$secondary_count expected_secondaries=$MONGO_REPLICA_EXPECTED_SECONDARIES message=\"not enough healthy secondaries\""
    return
  fi

  if (( healthy_count < MONGO_REPLICA_EXPECTED_MEMBERS )); then
    emit "CRITICAL" "mongo_replica_set set=$set_name healthy=$healthy_count expected_healthy=$MONGO_REPLICA_EXPECTED_MEMBERS message=\"not all members healthy\""
    return
  fi

  emit "OK" "mongo_replica_set set=$set_name members=$total_count primary=$primary_count secondaries=$secondary_count healthy=$healthy_count"
}

check_disk "$DISK_PATH" "$DISK_WARN_PERCENT" "$DISK_CRITICAL_PERCENT"
check_memory "$MEMORY_WARN_PERCENT" "$MEMORY_CRITICAL_PERCENT"

if [[ "$CHECK_CONTAINERS" == "true" ]]; then
  check_containers
fi

if [[ "$CHECK_MONGO_REPLICA" == "true" ]]; then
  check_mongo_replica_set
fi

if [[ "$CHECK_HTTP_READY" == "true" ]]; then
  check_http_ready
fi

if ((CRITICAL_COUNT > 0)); then
  exit 2
fi

if ((WARN_COUNT > 0)); then
  exit 1
fi

exit 0
