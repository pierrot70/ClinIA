#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
STAGING_EMAIL="${STAGING_EMAIL:-local.medecin@clinia.test}"
STAGING_USERNAME="${STAGING_USERNAME:-local-medecin}"
STAGING_PASSWORD="${STAGING_PASSWORD:-localpassword123}"
STAGING_ROLE="${STAGING_ROLE:-SUPERADMIN}"
VERBOSE="${VERBOSE:-1}"
DRILL_MARKER="clinia-staging-clinique-write-drill-$(date +%s)-$RANDOM"
CLINIQUE_ID=""
TOKEN=""
CLINIQUE_COUNT_BEFORE=""
CLINIQUE_COUNT_AFTER=""

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

mongo_exec_service() {
  local service
  local first_running=""
  local is_primary

  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if dc ps --services --status running | grep -Fxq "$service"; then
      if [[ -z "$first_running" ]]; then
        first_running="$service"
      fi

      is_primary="$(
        dc exec -T "$service" sh -c 'mongosh --quiet \
          --username "$CLINIA_RS_ROOT_USERNAME" \
          --password="$CLINIA_RS_ROOT_PASSWORD" \
          --authenticationDatabase admin \
          --eval "db.hello().isWritablePrimary === true"' 2>/dev/null || true
      )"

      if [[ "$is_primary" == "true" ]]; then
        printf '%s' "$service"
        return
      fi
    fi
  done

  if [[ -n "$first_running" ]]; then
    printf '%s' "$first_running"
    return
  fi

  return 1
}

info() {
  if [[ "$VERBOSE" != "1" && "${VERBOSE,,}" != "true" ]]; then
    return
  fi
  printf 'INFO %s\n' "$*"
}

report_ok() {
  printf ' - %s OK\n' "$*"
}

report_failed() {
  printf ' - %s FAILED\n' "$*" >&2
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

auth_header() {
  printf 'Authorization: Bearer %s' "$TOKEN"
}

mongo_eval_on_service() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T \
    -e MONGO_EVAL="$MONGO_EVAL" \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e CLINIQUE_ID="$CLINIQUE_ID" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

clinique_count() {
  MONGO_EVAL='db.getSiblingDB("clinia").cliniques.countDocuments({})' \
    mongo_eval_on_service
}

mongo_replica_summary() {
  MONGO_EVAL='
    const status = rs.status();
    const members = status.members || [];
    const healthy = members.filter(m => m.health === 1).length;
    const primary = members.filter(m => m.health === 1 && m.stateStr === "PRIMARY").length;
    const secondaries = members.filter(m => m.health === 1 && m.stateStr === "SECONDARY").length;
    print(healthy + "/" + members.length + " healthy, primary=" + primary + ", secondaries=" + secondaries);
  ' mongo_eval_on_service
}

cleanup_drill_data() {
  info "cleanup_marker marker=$DRILL_MARKER"

  MONGO_EVAL='
    const dbx = db.getSiblingDB("clinia");
    const marker = /^clinia-staging-clinique-write-drill-/;
    dbx.cliniques.deleteMany({ nom: marker });
  ' mongo_eval_on_service >/dev/null 2>&1 || true
}

trap cleanup_drill_data EXIT

wait_for_backend() {
  local attempt

  for attempt in {1..30}; do
    if curl -fsS --max-time 5 "$BASE_URL/api/health/ready" >/dev/null 2>&1; then
      info "backend_ready url=$BASE_URL attempt=$attempt"
      return
    fi
    sleep 2
  done

  fail "backend_not_ready url=$BASE_URL"
}

ensure_staging_user() {
  local password_hash
  local service

  info "ensure_staging_user email=$STAGING_EMAIL role=$STAGING_ROLE"
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  password_hash="$(
    dc exec -T -e STAGING_PASSWORD="$STAGING_PASSWORD" backend \
      node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.STAGING_PASSWORD, 12));'
  )"

  dc exec -T \
    -e STAGING_EMAIL="$STAGING_EMAIL" \
    -e STAGING_USERNAME="$STAGING_USERNAME" \
    -e STAGING_PASSWORD_HASH="$password_hash" \
    -e STAGING_ROLE="$STAGING_ROLE" \
    -e VERBOSE="$VERBOSE" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const now = new Date();
        const result = db.getSiblingDB(\"clinia\").adminusers.updateOne(
          { email: process.env.STAGING_EMAIL },
          {
            \$set: {
              email: process.env.STAGING_EMAIL,
              username: process.env.STAGING_USERNAME,
              passwordHash: process.env.STAGING_PASSWORD_HASH,
              role: process.env.STAGING_ROLE,
              isActive: true,
              passwordResetRequired: false,
              mustChangePasswordOnNextLogin: false,
              failedLoginAttempts: 0,
              lockUntil: null,
              updatedAt: now
            },
            \$setOnInsert: { createdAt: now }
          },
          { upsert: true }
        );
        if (process.env.VERBOSE === \"1\" || process.env.VERBOSE === \"true\") {
          printjson({ stagingUserReady: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedCount: result.upsertedCount });
        }
      "'
}

login() {
  local response="/tmp/clinia-staging-clinique-login.json"

  jq -n \
    --arg email "$STAGING_EMAIL" \
    --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > /tmp/clinia-staging-clinique-login-payload.json

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-clinique-login-payload.json \
    > "$response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$TOKEN" ]] || {
    jq . "$response" || cat "$response"
    fail "login_failed"
  }
}

create_clinique() {
  local response="/tmp/clinia-staging-clinique-create.json"

  jq -n \
    --arg marker "$DRILL_MARKER" \
    '{
      nom: $marker,
      num_civique: "123",
      rue: "Rue Drill",
      code_postal: "H2X 1Y4",
      lat: 45.5017,
      long: -73.5673,
      telephone: "5145554444",
      courriel: "clinique-drill@clinia.local"
    }' > /tmp/clinia-staging-clinique-create-payload.json

  curl -sS -X POST "$BASE_URL/api/cliniques" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-clinique-create-payload.json \
    > "$response"

  CLINIQUE_ID="$(jq -r '.data._id // empty' "$response")"
  if [[ -z "$CLINIQUE_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "creating clinique"
    fail "clinique_create_failed"
  fi

  report_ok "creating clinique"
}

read_clinique() {
  local response="/tmp/clinia-staging-clinique-read.json"

  curl -sS "$BASE_URL/api/cliniques/$CLINIQUE_ID" \
    -H "$(auth_header)" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$CLINIQUE_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "reading clinique"
    fail "clinique_read_failed"
  fi

  report_ok "reading clinique"
}

update_clinique() {
  local response="/tmp/clinia-staging-clinique-update.json"

  jq -n \
    '{
      rue: "Rue Drill Modifiee",
      telephone: "5145555555",
      lat: 45.502,
      long: -73.568
    }' > /tmp/clinia-staging-clinique-update-payload.json

  curl -sS -X PATCH "$BASE_URL/api/cliniques/$CLINIQUE_ID" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-clinique-update-payload.json \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$CLINIQUE_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating clinique"
    fail "clinique_update_failed"
  fi

  if [[ "$(jq -r '.data.rue // empty' "$response")" != "Rue Drill Modifiee" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating clinique"
    fail "clinique_update_not_persisted"
  fi

  report_ok "updating clinique"
}

delete_clinique() {
  local response="/tmp/clinia-staging-clinique-delete.json"
  local remaining

  curl -sS -X DELETE "$BASE_URL/api/cliniques/$CLINIQUE_ID" \
    -H "$(auth_header)" \
    > "$response"

  if [[ "$(jq -r '.meta.model // empty' "$response")" != "mongo" ]]; then
    jq . "$response" || cat "$response"
    report_failed "deleting clinique"
    fail "clinique_delete_failed"
  fi

  remaining="$(
    MONGO_EVAL='db.getSiblingDB("clinia").cliniques.countDocuments({ _id: ObjectId(process.env.CLINIQUE_ID) })' \
      mongo_eval_on_service
  )"

  if [[ "$remaining" != "0" ]]; then
    report_failed "deleting clinique"
    fail "clinique_delete_remaining=$remaining"
  fi

  report_ok "deleting clinique"
}

require_command curl
require_command docker
require_command jq

info "STAGING_CLINIQUE_WRITE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
ensure_staging_user
login
cleanup_drill_data

printf '\nTesting cliniques collection\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
CLINIQUE_COUNT_BEFORE="$(clinique_count)"
printf 'Clinique documents before drill: %s\n' "$CLINIQUE_COUNT_BEFORE"

create_clinique
read_clinique
update_clinique
delete_clinique
cleanup_drill_data

CLINIQUE_COUNT_AFTER="$(clinique_count)"
printf 'Clinique documents after drill: %s\n' "$CLINIQUE_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

if [[ "$CLINIQUE_COUNT_BEFORE" != "$CLINIQUE_COUNT_AFTER" ]]; then
  fail "clinique_count_changed before=$CLINIQUE_COUNT_BEFORE after=$CLINIQUE_COUNT_AFTER"
fi

info "STAGING_CLINIQUE_WRITE_DRILL_PASSED marker=$DRILL_MARKER"
