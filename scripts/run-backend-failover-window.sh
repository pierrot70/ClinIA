#!/usr/bin/env bash
# One backend only; all gates precede arming the restart trap.
set +x
set -Eeuo pipefail
umask 077
[[ $# == 1 && ( "$1" == --run || "$1" == --check ) ]] || { echo 'Usage: bash run-backend-failover-window.sh [--check | --run]'; exit 1; }
mode="$1"
for cmd in docker jq date sleep cat; do command -v "$cmd" >/dev/null || { echo "ERROR missing $cmd"; exit 1; }; done
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$script_dir/mongo-replica-preflight.mjs" ]] || { echo 'ERROR MongoDB preflight helper missing'; exit 1; }
: "${BACKEND_TARGET:?set exact backend to stop}"
: "${BACKEND_SURVIVOR:?set exact backend to keep running}"
: "${MONGO_STATUS_CONTAINER:?set exact MongoDB container holding admin credentials}"
: "${EXPECTED_SHA:?set expected deployed SHA}"
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'ERROR invalid expected SHA'; exit 1; }
[[ "$BACKEND_TARGET" == backend-* && "$BACKEND_TARGET" != backend-replica-* && "$BACKEND_SURVIVOR" == backend-replica-* ]] || { echo 'ERROR backend names invalid'; exit 1; }
[[ "$MONGO_STATUS_CONTAINER" == mongo-* && "$MONGO_STATUS_CONTAINER" != mongo-replica-* ]] || { echo 'ERROR MongoDB credential container name invalid'; exit 1; }
if [[ "$mode" == --run && "${CONFIRM_PRODUCTION_FAILOVER_DRILL:-}" != RUN_CLINIA_FAILOVER_DRILL ]]; then echo 'ERROR missing explicit drill confirmation'; exit 1; fi
event() { printf 'EVENT utc=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" "$*"; }
for name in "$BACKEND_TARGET" "$BACKEND_SURVIVOR"; do
  [[ "$(docker inspect --format '{{.State.Running}}|{{.State.Health.Status}}' "$name")" == 'true|healthy' ]] || { echo "ERROR backend not healthy: $name"; exit 1; }
  sha="$(docker exec "$name" cat /app/build-revision.json | jq -er '.commit')"
  [[ "$sha" == "$EXPECTED_SHA" ]] || { echo "ERROR SHA mismatch: $name observed=$sha"; exit 1; }
  echo "VERSION_OK container=$name SHA=$sha"
done
target_id="$(docker inspect --format '{{.Id}}' "$BACKEND_TARGET")"
survivor_id="$(docker inspect --format '{{.Id}}' "$BACKEND_SURVIVOR")"
[[ "$target_id" != "$survivor_id" ]] || { echo 'ERROR identical container IDs'; exit 1; }
# Application credentials cannot read replSetGetStatus. Pipe only the existing
# admin password to the one-shot driver process. Use the established admin
# account, not the initialization username, which can differ on existing volumes.
# No secret in argv,
# shell variables, output, disk files, or persistent backend environment.
preflight_source="$(cat "$script_dir/mongo-replica-preflight.mjs")"
if ! docker inspect --format '{{json .Config.Env}}' "$MONGO_STATUS_CONTAINER" \
  | jq -ce --arg admin_username "${MONGO_ADMIN_USERNAME:-root}" '{username:$admin_username, password:(map(select(startswith("MONGO_INITDB_ROOT_PASSWORD=")) | ltrimstr("MONGO_INITDB_ROOT_PASSWORD=")) | first // "")}' \
  | docker exec -i -w /app "$BACKEND_SURVIVOR" node --input-type=module --eval "$preflight_source"
then
  echo 'MONGO_PREFLIGHT_FAILED no_service_stopped'
  exit 1
fi
echo 'MONGO_PREFLIGHT_OK'
if [[ "$mode" == --check ]]; then echo 'PREFLIGHT_OK no_service_stopped'; exit 0; fi
[[ "$(docker inspect --format '{{.State.Running}}|{{.State.Health.Status}}' "$survivor_id")" == 'true|healthy' ]] || { echo 'ERROR survivor no longer healthy'; exit 1; }
restart_needed=0
restore() {
  local status=$?
  trap - EXIT INT TERM HUP
  if (( restart_needed )); then
    event 'recovery=restart_attempt'
    if docker start "$target_id" >/dev/null; then event 'recovery=restart_requested'; else event 'recovery=FAILED'; status=1; fi
  fi
  exit "$status"
}
trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
# Arm before docker stop: even a stop interrupted after reaching the daemon
# must trigger restoration of the same pinned container ID.
restart_needed=1
event "action=stop_requested container=$BACKEND_TARGET"
docker stop --time 10 "$target_id" >/dev/null
event 'action=stop_completed hold_seconds=20'
sleep 20
[[ "$(docker inspect --format '{{.State.Running}}' "$target_id")" == false ]] || { echo 'ERROR target restarted during observation; window invalid'; exit 1; }
[[ "$(docker inspect --format '{{.State.Running}}|{{.State.Health.Status}}' "$survivor_id")" == 'true|healthy' ]] || { echo 'ERROR survivor unhealthy during window'; exit 1; }
event 'action=start_requested'
docker start "$target_id" >/dev/null
event 'action=start_completed'
# Keep recovery armed until the restart command has definitely succeeded.
restart_needed=0
for attempt in {1..12}; do
  if [[ "$(docker inspect --format '{{.State.Running}}|{{.State.Health.Status}}' "$target_id")" == 'true|healthy' && "$(docker inspect --format '{{.State.Running}}|{{.State.Health.Status}}' "$survivor_id")" == 'true|healthy' ]]; then
    event 'action=both_backends_healthy'
    echo 'BACKEND_WINDOW_COMPLETED review_traffic_evidence_for_availability'
    exit 0
  fi
  sleep 5
done
echo 'ERROR backend health recovery not confirmed'
exit 1
