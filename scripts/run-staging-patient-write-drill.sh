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
DRILL_MARKER="clinia-staging-patient-write-drill-$(date +%s)-$RANDOM"
PATIENT_ID=""
TOKEN=""
PATIENT_DELETED="false"
PATIENT_COUNT_BEFORE=""
PATIENT_COUNT_AFTER=""

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
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

mongo_eval() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

patient_count() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.getSiblingDB(\"clinia\").patients.countDocuments({})"'
}

mongo_replica_summary() {
  local summary
  local service

  service="$(mongo_exec_service)" || {
    printf '0/3 healthy, primary=0, secondaries=0'
    return
  }

  summary="$(
    dc exec -T "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const status = rs.status();
        const members = status.members || [];
        const healthy = members.filter(m => m.health === 1).length;
        const primary = members.filter(m => m.health === 1 && m.stateStr === \"PRIMARY\").length;
        const secondaries = members.filter(m => m.health === 1 && m.stateStr === \"SECONDARY\").length;
        print(healthy + \"/\" + members.length + \" healthy, primary=\" + primary + \", secondaries=\" + secondaries);
      "'
  )"

  printf '%s' "$summary"
}

cleanup_drill_patients() {
  local remaining
  local service

  if [[ -n "$PATIENT_ID" && -n "$TOKEN" && "$PATIENT_DELETED" != "true" ]]; then
    info "cleanup_api_delete patient_id=$PATIENT_ID"
    curl -sS -X DELETE "$BASE_URL/api/patients/$PATIENT_ID" \
      -H "Authorization: Bearer $TOKEN" >/dev/null || true
  fi

  info "cleanup_marker marker=$DRILL_MARKER"
  service="$(mongo_exec_service || true)"

  if [[ -n "$service" ]]; then
    dc exec -T -e DRILL_MARKER="$DRILL_MARKER" "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.getSiblingDB(\"clinia\").patients.deleteMany({
        created_by_reference: process.env.DRILL_MARKER
      }).deletedCount"' >/dev/null || true
  fi

  remaining="$(
    if [[ -n "$service" ]]; then
      dc exec -T -e DRILL_MARKER="$DRILL_MARKER" "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.getSiblingDB(\"clinia\").patients.countDocuments({
        created_by_reference: process.env.DRILL_MARKER
      })"' 2>/dev/null || printf 'unknown'
    else
      printf 'unknown'
    fi
  )"

  info "cleanup_remaining marker=$DRILL_MARKER count=$remaining"
}

trap cleanup_drill_patients EXIT

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
          printjson({
            stagingUserReady: true,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount
          });
        }
      "'
}

login() {
  local login_response="/tmp/clinia-staging-login.json"

  info "login email=$STAGING_EMAIL"

  jq -n \
    --arg email "$STAGING_EMAIL" \
    --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > /tmp/clinia-staging-login-payload.json

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-login-payload.json \
    > "$login_response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$login_response")"

  if [[ -z "$TOKEN" ]]; then
    jq . "$login_response" || cat "$login_response"
    fail "login_failed"
  fi

  info "login_ok"
}

create_patient() {
  local response="/tmp/clinia-staging-patient-create.json"
  local ramq_suffix

  ramq_suffix="$(printf '%010d' "$((RANDOM * RANDOM % 10000000000))")"

  info "patient_create marker=$DRILL_MARKER"

  jq -n \
    --arg marker "$DRILL_MARKER" \
    --arg ramq "RAMQ$ramq_suffix" \
    --arg email "drill-patient-$DRILL_MARKER@clinia.local" \
    '{
      prenom: "Drill",
      nom: "PatientWrite",
      num_assurance_maladie: $ramq,
      courriel: $email,
      created_by_reference: $marker,
      texto: false
    }' > /tmp/clinia-staging-patient-create-payload.json

  curl -sS -X POST "$BASE_URL/api/patients" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-patient-create-payload.json \
    > "$response"

  PATIENT_ID="$(jq -r '.data._id // empty' "$response")"
  if [[ -z "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "creating patient"
    fail "patient_create_failed"
  fi

  if [[ "$(jq -r '.meta.model // empty' "$response")" != "mongo" ]]; then
    report_failed "creating patient"
    fail "patient_create_unexpected_model"
  fi

  info "patient_create_ok patient_id=$PATIENT_ID"
  report_ok "creating patient"
}

read_patient() {
  local response="/tmp/clinia-staging-patient-read.json"

  info "patient_read patient_id=$PATIENT_ID"

  curl -sS "$BASE_URL/api/patients/$PATIENT_ID" \
    -H "Authorization: Bearer $TOKEN" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "reading patient"
    fail "patient_read_missing_id"
  fi

  if [[ "$(jq -r '.data.created_by_reference // empty' "$response")" != "$DRILL_MARKER" ]]; then
    jq . "$response" || cat "$response"
    report_failed "reading patient"
    fail "patient_read_marker_mismatch"
  fi

  info "patient_read_ok patient_id=$PATIENT_ID"
  report_ok "reading patient"
}

update_patient() {
  local response="/tmp/clinia-staging-patient-update.json"
  local phone_suffix

  info "patient_update patient_id=$PATIENT_ID"
  phone_suffix="$(printf '%04d' "$((RANDOM % 10000))")"

  jq -n \
    --arg marker "$DRILL_MARKER" \
    --arg telephone "514555$phone_suffix" \
    '{
      nom: "PatientWriteUpdated",
      telephone: $telephone,
      created_by_reference: $marker,
      texto: true
    }' > /tmp/clinia-staging-patient-update-payload.json

  curl -sS -X PATCH "$BASE_URL/api/patients/$PATIENT_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-patient-update-payload.json \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating patient"
    fail "patient_update_missing_id"
  fi
  if [[ "$(jq -r '.data.nom // empty' "$response")" != "PatientWriteUpdated" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating patient"
    fail "patient_update_name_not_persisted"
  fi
  if [[ "$(jq -r '.data.texto // empty' "$response")" != "true" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating patient"
    fail "patient_update_texto_not_persisted"
  fi

  info "patient_update_ok patient_id=$PATIENT_ID"
  report_ok "updating patient"
}

delete_patient() {
  local response="/tmp/clinia-staging-patient-delete.json"

  info "patient_delete patient_id=$PATIENT_ID"

  curl -sS -X DELETE "$BASE_URL/api/patients/$PATIENT_ID" \
    -H "Authorization: Bearer $TOKEN" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "deleting patient"
    fail "patient_delete_missing_id"
  fi

  PATIENT_DELETED="true"
  info "patient_delete_ok patient_id=$PATIENT_ID"
  report_ok "deleting patient"
}

verify_no_zombies() {
  local remaining
  local service

  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  remaining="$(
    dc exec -T -e DRILL_MARKER="$DRILL_MARKER" "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "db.getSiblingDB(\"clinia\").patients.countDocuments({
        created_by_reference: process.env.DRILL_MARKER
      })"'
  )"

  [[ "$remaining" == "0" ]] || fail "patient_zombies_remaining marker=$DRILL_MARKER count=$remaining"
  info "patient_cleanup_ok remaining=$remaining"
}

require_command curl
require_command docker
require_command jq

info "STAGING_PATIENT_WRITE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
ensure_staging_user
login
printf '\nTesting patients collection\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
PATIENT_COUNT_BEFORE="$(patient_count)"
printf 'Patient documents before drill: %s\n' "$PATIENT_COUNT_BEFORE"
create_patient
read_patient
update_patient
delete_patient
verify_no_zombies
PATIENT_COUNT_AFTER="$(patient_count)"
printf 'Patient documents after drill: %s\n' "$PATIENT_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

info "STAGING_PATIENT_WRITE_DRILL_PASSED marker=$DRILL_MARKER"
