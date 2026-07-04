#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
HEALTH_SCRIPT="${HEALTH_SCRIPT:-$ROOT_DIR/scripts/production-health-check.sh}"
WAIT_SECONDS="${WAIT_SECONDS:-8}"
RECOVERY_ATTEMPTS="${RECOVERY_ATTEMPTS:-24}"
RECOVERY_WAIT_SECONDS="${RECOVERY_WAIT_SECONDS:-5}"
SYNC_ATTEMPTS="${SYNC_ATTEMPTS:-24}"
SYNC_WAIT_SECONDS="${SYNC_WAIT_SECONDS:-5}"
ALERT_ORIGIN="${ALERT_ORIGIN:-DEV}"
DRILL_MARKER="${DRILL_MARKER:-clinia-staging-write-safety-$(date +%s)-$RANDOM}"
DRILL_COLLECTION="${DRILL_COLLECTION:-replica_write_safety_drills}"
STATUS_COLLECTION="${STATUS_COLLECTION:-replica_write_safety_drill_status}"
WRITE_TIMEOUT_MS="${WRITE_TIMEOUT_MS:-5000}"
LOOP_CYCLES="${LOOP_CYCLES:-1}"

STOPPED_SERVICES=()
CURRENT_CYCLE=0

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

on_exit() {
  local exit_code=$?

  restore_stopped_services || true

  if [[ "$exit_code" -ne 0 ]]; then
    sleep "$WAIT_SECONDS" || true
    update_drill_status "failure" "${CURRENT_CYCLE:-0}" "failed" "Drill failed at cycle ${CURRENT_CYCLE:-0}" || true
    printf '\nSTAGING_MONGO_WRITE_SAFETY_DRILL_FAILED marker=%s cycle=%s\n' "$DRILL_MARKER" "${CURRENT_CYCLE:-0}" >&2
  fi

  exit "$exit_code"
}

trap on_exit EXIT

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
  run_health >/tmp/clinia-write-safety-health.log 2>&1
  exit_code=$?
  set -e

  if [[ "$exit_code" != "$expected_exit" ]]; then
    cat /tmp/clinia-write-safety-health.log >&2 || true
    fail "unexpected_health_exit label=$label expected=$expected_exit actual=$exit_code"
  fi

  printf '%s OK\n' "$label"
}

wait_for_health_exit() {
  local expected_exit="$1"
  local label="$2"
  local attempt
  local exit_code

  for attempt in $(seq 1 "$RECOVERY_ATTEMPTS"); do
    set +e
    run_health >/tmp/clinia-write-safety-health.log 2>&1
    exit_code=$?
    set -e

    if [[ "$exit_code" == "$expected_exit" ]]; then
      printf '%s OK attempt=%s\n' "$label" "$attempt"
      return
    fi

    sleep "$RECOVERY_WAIT_SECONDS"
  done

  cat /tmp/clinia-write-safety-health.log >&2 || true
  fail "health_exit_not_reached label=$label expected=$expected_exit actual=$exit_code"
}

mongo_eval() {
  local service="$1"
  local eval_script="$2"

  dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e DRILL_COLLECTION="$DRILL_COLLECTION" \
    -e STATUS_COLLECTION="$STATUS_COLLECTION" \
    -e WRITE_TIMEOUT_MS="$WRITE_TIMEOUT_MS" \
    -e MONGO_EVAL="$eval_script" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "$MONGO_EVAL"'
}

update_drill_status() {
  local status="$1"
  local cycle="$2"
  local phase="$3"
  local message="$4"
  local service

  set +e
  service="$(primary_service 2>/dev/null)"
  set -e
  [[ -n "$service" ]] || return 0

  dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e STATUS_COLLECTION="$STATUS_COLLECTION" \
    -e LOOP_CYCLES="$LOOP_CYCLES" \
    -e DRILL_STATUS="$status" \
    -e DRILL_CYCLE="$cycle" \
    -e DRILL_PHASE="$phase" \
    -e DRILL_MESSAGE="$message" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const dbx = db.getSiblingDB(\"clinia\");
        const collection = dbx.getCollection(process.env.STATUS_COLLECTION);
        const status = process.env.DRILL_STATUS;
        const now = new Date();
        const update = {
          $set: {
            marker: process.env.DRILL_MARKER,
            status,
            currentCycle: Number(process.env.DRILL_CYCLE || 0),
            totalCycles: Number(process.env.LOOP_CYCLES || 1),
            phase: process.env.DRILL_PHASE || null,
            message: process.env.DRILL_MESSAGE || null,
            updatedAt: now
          },
          $setOnInsert: {
            _id: \"latest\",
            startedAt: now
          }
        };
        if (status === \"success\" || status === \"failure\") {
          update.$set.completedAt = now;
        }
        collection.updateOne(
          { _id: \"latest\" },
          update,
          {
            upsert: true,
            writeConcern: { w: 1, wtimeout: Number(process.env.WRITE_TIMEOUT_MS || 5000) }
          }
        );
        print(\"ok\");
      "' >/dev/null 2>&1 || true
}

primary_service() {
  local primary

  primary="$(
    mongo_eval mongo-rs-1 'db.hello().primary' 2>/dev/null ||
    mongo_eval mongo-rs-2 'db.hello().primary' 2>/dev/null ||
    mongo_eval mongo-rs-3 'db.hello().primary' 2>/dev/null
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

insert_marker_doc() {
  local service="$1"
  local phase="$2"

  mongo_eval "$service" "
    const dbx = db.getSiblingDB('clinia');
    const collection = dbx.getCollection(process.env.DRILL_COLLECTION);
    collection.insertOne(
      {
        marker: process.env.DRILL_MARKER,
        phase: '$phase',
        createdAt: new Date(),
        payload: 'majority-write-safety'
      },
      {
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: Number(process.env.WRITE_TIMEOUT_MS || 5000)
        }
      }
    );
    print('ok');
  " >/tmp/clinia-write-safety-write.out

  grep -q '^ok$' /tmp/clinia-write-safety-write.out ||
    fail "write_did_not_confirm phase=$phase service=$service output=$(cat /tmp/clinia-write-safety-write.out)"
}

assert_write_fails() {
  local service="$1"
  local phase="$2"

  set +e
  mongo_eval "$service" "
    const dbx = db.getSiblingDB('clinia');
    const collection = dbx.getCollection(process.env.DRILL_COLLECTION);
    collection.insertOne(
      {
        marker: process.env.DRILL_MARKER,
        phase: '$phase',
        createdAt: new Date(),
        payload: 'this-write-must-not-succeed'
      },
      {
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: Number(process.env.WRITE_TIMEOUT_MS || 5000)
        }
      }
    );
    print('unexpected-success');
  " >/tmp/clinia-write-safety-fail.out 2>&1
  local exit_code=$?
  set -e

  if [[ "$exit_code" -eq 0 ]] && grep -q 'unexpected-success' /tmp/clinia-write-safety-fail.out; then
    fail "write_unexpectedly_succeeded phase=$phase service=$service"
  fi
}

marker_count_on_member() {
  local service="$1"

  mongo_eval "$service" "
    rs.secondaryOk();
    const dbx = db.getSiblingDB('clinia');
    const collection = dbx.getCollection(process.env.DRILL_COLLECTION);
    print(collection.countDocuments({ marker: process.env.DRILL_MARKER }));
  " 2>/dev/null | tail -n1
}

assert_marker_count() {
  local service="$1"
  local expected="$2"
  local count

  count="$(marker_count_on_member "$service")"
  [[ "$count" == "$expected" ]] ||
    fail "marker_count_mismatch service=$service expected=$expected actual=$count marker=$DRILL_MARKER"
}

wait_for_marker_on_all_members() {
  local expected="$1"
  local attempt
  local service
  local count
  local ok

  for attempt in $(seq 1 "$SYNC_ATTEMPTS"); do
    ok=1

    for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
      count="$(marker_count_on_member "$service" || printf 'down')"

      if [[ "$count" != "$expected" ]]; then
        ok=0
      fi
    done

    if [[ "$ok" -eq 1 ]]; then
      printf 'All members have %s marker document(s) attempt=%s\n' "$expected" "$attempt"
      return
    fi

    sleep "$SYNC_WAIT_SECONDS"
  done

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    printf '%s marker_count=%s\n' "$service" "$(marker_count_on_member "$service" || printf 'down')" >&2
  done

  fail "marker_not_replicated_to_all_members expected=$expected marker=$DRILL_MARKER"
}

replica_lag_seconds() {
  local service="$1"

  mongo_eval "$service" "
    const status = rs.status();
    const primary = status.members.find((member) => member.stateStr === 'PRIMARY');
    const primaryTime = primary?.optimeDate ? new Date(primary.optimeDate).getTime() : null;
    const lags = status.members
      .filter((member) => member.health === 1 && member.optimeDate && primaryTime !== null)
      .map((member) => Math.max(0, Math.round((primaryTime - new Date(member.optimeDate).getTime()) / 1000)));
    print(lags.length ? Math.max(...lags) : 0);
  " 2>/dev/null | tail -n1
}

wait_for_cluster_synchronized() {
  local attempt
  local service
  local primary
  local lag

  for attempt in $(seq 1 "$SYNC_ATTEMPTS"); do
    primary="$(primary_service 2>/dev/null || true)"

    if [[ -n "$primary" ]]; then
      lag="$(replica_lag_seconds "$primary" || printf 'unknown')"

      if [[ "$lag" =~ ^[0-9]+$ ]] && [[ "$lag" -le 1 ]]; then
        for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
          dc ps "$service" --status running >/dev/null || break
        done

        printf 'Cluster synchronized lag_seconds=%s attempt=%s\n' "$lag" "$attempt"
        return
      fi
    fi

    sleep "$SYNC_WAIT_SECONDS"
  done

  fail "cluster_not_synchronized marker=$DRILL_MARKER"
}

require_command docker
require_command grep

[[ -x "$HEALTH_SCRIPT" ]] || fail "health_script_not_executable path=$HEALTH_SCRIPT"

run_cycle() {
  local cycle="$1"
  local expected_before_final
  local expected_after_final
  local primary
  local secondary_one
  local secondary_two

  CURRENT_CYCLE="$cycle"
  expected_before_final=$(( (cycle - 1) * 3 + 2 ))
  expected_after_final=$(( cycle * 3 ))

  printf 'Cycle %s/%s\n' "$cycle" "$LOOP_CYCLES"
  update_drill_status "running" "$cycle" "baseline" "Cycle $cycle/$LOOP_CYCLES: baseline 3/3"

  start_all_mongo_members
  sleep "$WAIT_SECONDS"
  wait_for_health_exit 0 "Baseline 3/3" >/dev/null

  primary="$(primary_service)"
  secondary_one="$(choose_secondary "$primary")"
  secondary_two="$(choose_other_secondary "$primary" "$secondary_one")"

  update_drill_status "running" "$cycle" "degraded" "Cycle $cycle/$LOOP_CYCLES: transition degradee 2/3"
  dc stop "$secondary_one" >/dev/null 2>&1
  STOPPED_SERVICES+=("$secondary_one")
  sleep "$WAIT_SECONDS"
  wait_for_health_exit 1 "Degraded 2/3" >/dev/null

  update_drill_status "running" "$cycle" "degraded-writes" "Cycle $cycle/$LOOP_CYCLES: ecritures majority en 2/3"
  insert_marker_doc "$primary" "cycle-$cycle-degraded-majority-write-1"
  insert_marker_doc "$primary" "cycle-$cycle-degraded-majority-write-2"
  assert_marker_count "$primary" "$expected_before_final"
  assert_marker_count "$secondary_two" "$expected_before_final"

  update_drill_status "running" "$cycle" "incident" "Cycle $cycle/$LOOP_CYCLES: verification refus ecriture en 1/3"
  dc stop "$secondary_two" >/dev/null 2>&1
  STOPPED_SERVICES+=("$secondary_two")
  sleep "$WAIT_SECONDS"
  wait_for_health_exit 2 "Incident 1/3" >/dev/null
  assert_write_fails "$primary" "cycle-$cycle-incident-write-must-fail"

  restore_stopped_services >/dev/null
  STOPPED_SERVICES=()
  update_drill_status "running" "$cycle" "restore" "Cycle $cycle/$LOOP_CYCLES: restauration 3/3"
  sleep "$WAIT_SECONDS"
  wait_for_health_exit 0 "Restored 3/3" >/dev/null
  wait_for_cluster_synchronized >/dev/null
  wait_for_marker_on_all_members "$expected_before_final" >/dev/null

  update_drill_status "running" "$cycle" "final-write" "Cycle $cycle/$LOOP_CYCLES: ecriture finale apres restauration"
  primary="$(primary_service)"
  insert_marker_doc "$primary" "cycle-$cycle-restored-final-sentinel"
  wait_for_marker_on_all_members "$expected_after_final" >/dev/null

  update_drill_status "running" "$cycle" "cycle-complete" "Cycle $cycle/$LOOP_CYCLES complete"
}

printf '\nTesting Mongo write safety through 2/3 -> 1/3 -> 3/3\n'
printf 'Collection: %s\n' "$DRILL_COLLECTION"
printf 'Status collection: %s\n' "$STATUS_COLLECTION"
printf 'Marker: %s\n' "$DRILL_MARKER"
printf 'Cycles: %s\n\n' "$LOOP_CYCLES"

update_drill_status "running" 0 "starting" "Starting write safety drill"

for cycle in $(seq 1 "$LOOP_CYCLES"); do
  run_cycle "$cycle"
done

update_drill_status "success" "$LOOP_CYCLES" "complete" "Write safety drill completed successfully"

printf '\nSTAGING_MONGO_WRITE_SAFETY_DRILL_PASSED marker=%s cycles=%s\n' "$DRILL_MARKER" "$LOOP_CYCLES"
