#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
STAGING_EMAIL="${STAGING_EMAIL:-local.medecin@clinia.test}"
STAGING_PASSWORD="${STAGING_PASSWORD:-localpassword123}"
LOAD_BATCHES="${LOAD_BATCHES:-12}"
LOAD_BATCH_SIZE="${LOAD_BATCH_SIZE:-250}"
LOAD_PAYLOAD_BYTES="${LOAD_PAYLOAD_BYTES:-1024}"
LOAD_BATCH_SLEEP_SECONDS="${LOAD_BATCH_SLEEP_SECONDS:-2}"
LOAD_WRITE_CONCERN="${LOAD_WRITE_CONCERN:-1}"
KEEP_LOAD_TEST_DATA="${KEEP_LOAD_TEST_DATA:-0}"
MARKER="${MARKER:-clinia-staging-replica-load-$(date +%s)-$RANDOM}"
COLLECTION_NAME="${COLLECTION_NAME:-replica_load_test_events}"

TOKEN=""
LAST_STATUS_FILE="/tmp/clinia-staging-replica-load-status.json"
LOGIN_RESPONSE_FILE="/tmp/clinia-staging-replica-load-login.json"
TOTAL_INSERTED=0
LAST_BATCH_DURATION_MS=0
LAST_BATCH_DOCS_PER_SECOND=0

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

mongo_exec_service() {
  local service

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if dc ps --services --status running | grep -Fxq "$service"; then
      printf '%s' "$service"
      return
    fi
  done

  return 1
}

mongo_eval() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T \
    -e MONGO_EVAL="$MONGO_EVAL" \
    -e COLLECTION_NAME="${COLLECTION_NAME:-}" \
    -e MARKER="${MARKER:-}" \
    -e BATCH_NUMBER="${BATCH_NUMBER:-}" \
    -e LOAD_BATCH_SIZE="${LOAD_BATCH_SIZE:-}" \
    -e LOAD_PAYLOAD_BYTES="${LOAD_PAYLOAD_BYTES:-}" \
    -e LOAD_WRITE_CONCERN="${LOAD_WRITE_CONCERN:-}" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

cleanup_load_test_data() {
  local deleted

  if [[ "$KEEP_LOAD_TEST_DATA" == "1" || "${KEEP_LOAD_TEST_DATA,,}" == "true" ]]; then
    printf 'Cleanup skipped: collection=%s marker=%s\n' "$COLLECTION_NAME" "$MARKER"
    return
  fi

  deleted="$(
    COLLECTION_NAME="$COLLECTION_NAME" MARKER="$MARKER" MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const result = dbx.getCollection(process.env.COLLECTION_NAME).deleteMany({
        marker: process.env.MARKER
      });
      print(result.deletedCount);
    ' mongo_eval 2>/dev/null || printf 'unknown'
  )"

  printf 'Cleanup: deleted=%s marker=%s\n' "$deleted" "$MARKER"
}

trap cleanup_load_test_data EXIT

wait_for_backend() {
  local attempt

  for attempt in {1..30}; do
    if curl -fsS --max-time 5 "$BASE_URL/api/health/ready" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done

  fail "backend_not_ready url=$BASE_URL"
}

login() {
  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$STAGING_EMAIL\",\"password\":\"$STAGING_PASSWORD\"}" \
    >"$LOGIN_RESPONSE_FILE"

  TOKEN="$(jq -r '.data.accessToken // empty' "$LOGIN_RESPONSE_FILE")"
  [[ -n "$TOKEN" ]] || {
    cat "$LOGIN_RESPONSE_FILE" >&2
    fail "login_failed email=$STAGING_EMAIL"
  }
}

fetch_db_status() {
  curl -sS "$BASE_URL/api/db-status" \
    -H "Authorization: Bearer $TOKEN" \
    >"$LAST_STATUS_FILE"
}

status_line() {
  local label="$1"

  jq -r \
    --arg label "$label" \
    --arg total "$TOTAL_INSERTED" \
    --arg durationMs "$LAST_BATCH_DURATION_MS" \
    --arg docsPerSecond "$LAST_BATCH_DOCS_PER_SECOND" '
    .data.replicaSet.summary |
    "\($label): total=\($total) status=\(.status) lag=\((.maxLagSeconds // "N/D")|tostring)s " +
    "healthy=\(.healthyCount)/\(.memberCount) primary=\(.primaryCount) secondaries=\(.secondaryCount) majority=\(.majorityAvailable)" +
    (if ($durationMs | tonumber) > 0 then " duration_ms=\($durationMs) docs_sec=\($docsPerSecond)" else "" end)
  ' "$LAST_STATUS_FILE"
}

require_healthy_baseline() {
  local attempt
  local status

  for attempt in {1..12}; do
    fetch_db_status
    status="$(jq -r '.data.replicaSet.summary.status // "UNKNOWN"' "$LAST_STATUS_FILE")"

    if [[ "$status" == "OK" ]]; then
      status_line "Baseline"
      return
    fi

    if [[ "$attempt" -eq 1 ]]; then
      status_line "Waiting baseline"
    fi

    sleep 5
  done

  status="$(jq -r '.data.replicaSet.summary.status // "UNKNOWN"' "$LAST_STATUS_FILE")"
  fail "baseline_not_ok status=$status"
}

insert_batch() {
  local batch_number="$1"
  local inserted

  inserted="$(
    COLLECTION_NAME="$COLLECTION_NAME" \
    MARKER="$MARKER" \
    BATCH_NUMBER="$batch_number" \
    LOAD_BATCH_SIZE="$LOAD_BATCH_SIZE" \
    LOAD_PAYLOAD_BYTES="$LOAD_PAYLOAD_BYTES" \
    LOAD_WRITE_CONCERN="$LOAD_WRITE_CONCERN" \
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const batchSize = Number(process.env.LOAD_BATCH_SIZE);
      const payloadBytes = Number(process.env.LOAD_PAYLOAD_BYTES);
      const marker = process.env.MARKER;
      const batchNumber = Number(process.env.BATCH_NUMBER);
      const payload = "x".repeat(payloadBytes);
      const writeConcernRaw = process.env.LOAD_WRITE_CONCERN || "1";
      const writeConcern = writeConcernRaw === "majority"
        ? { w: "majority" }
        : { w: Number(writeConcernRaw) || 1 };
      const docs = Array.from({ length: batchSize }, (_, index) => ({
        marker,
        batchNumber,
        sequence: ((batchNumber - 1) * batchSize) + index + 1,
        payload,
        createdAt: new Date()
      }));
      const result = dbx.getCollection(process.env.COLLECTION_NAME).insertMany(docs, {
        ordered: false,
        writeConcern
      });
      print(Object.keys(result.insertedIds || {}).length);
    ' mongo_eval
  )"

  printf '%s' "$inserted"
}

require_command curl
require_command docker
require_command jq
require_command grep

printf '\nTesting Mongo replica lag under controlled write load\n'
printf 'Collection: %s\n' "$COLLECTION_NAME"
printf 'Marker: %s\n' "$MARKER"
printf 'Plan: batches=%s batch_size=%s payload=%sB writeConcern=%s sleep=%ss\n' \
  "$LOAD_BATCHES" "$LOAD_BATCH_SIZE" "$LOAD_PAYLOAD_BYTES" "$LOAD_WRITE_CONCERN" "$LOAD_BATCH_SLEEP_SECONDS"

wait_for_backend
login
require_healthy_baseline

for batch in $(seq 1 "$LOAD_BATCHES"); do
  started_ms="$(date +%s%3N)"
  inserted="$(insert_batch "$batch")"
  finished_ms="$(date +%s%3N)"
  LAST_BATCH_DURATION_MS=$((finished_ms - started_ms))
  if [[ "$LAST_BATCH_DURATION_MS" -gt 0 ]]; then
    LAST_BATCH_DOCS_PER_SECOND=$((inserted * 1000 / LAST_BATCH_DURATION_MS))
  else
    LAST_BATCH_DOCS_PER_SECOND="$inserted"
  fi
  TOTAL_INSERTED=$((TOTAL_INSERTED + inserted))
  fetch_db_status
  status_line "Batch $batch/$LOAD_BATCHES"
  sleep "$LOAD_BATCH_SLEEP_SECONDS"
done

fetch_db_status
LAST_BATCH_DURATION_MS=0
LAST_BATCH_DOCS_PER_SECOND=0
status_line "Final"
printf 'Replica load drill completed\n'
