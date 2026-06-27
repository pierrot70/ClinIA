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
DRILL_MARKER="clinia-staging-appointment-write-drill-$(date +%s)-$RANDOM"
PATIENT_ID=""
SPECIALIST_ID=""
APPOINTMENT_ID=""
TOKEN=""
APPOINTMENT_DATE=""

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

auth_header() {
  printf 'Authorization: Bearer %s' "$TOKEN"
}

mongo_eval_on_service() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T -e MONGO_EVAL="$MONGO_EVAL" "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

appointment_count() {
  MONGO_EVAL='db.getSiblingDB("clinia").appointments.countDocuments({})' \
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
  local mongo_eval
  local service

  info "cleanup_marker marker=$DRILL_MARKER"
  service="$(mongo_exec_service || true)"

  if [[ -z "$service" ]]; then
    return
  fi

  mongo_eval="
    const dbx = db.getSiblingDB('clinia');
    const marker = /^clinia-staging-appointment-write-drill-/;
    dbx.appointments.deleteMany({ reason: marker });
    dbx.patients.deleteMany({ created_by_reference: marker });
    dbx.specialists.deleteMany({ numero_medecin: marker });
    const remainingAppointments = dbx.appointments.countDocuments({ reason: marker });
    const remainingPatients = dbx.patients.countDocuments({ created_by_reference: marker });
    const remainingSpecialists = dbx.specialists.countDocuments({ numero_medecin: marker });
    printjson({ remainingAppointments, remainingPatients, remainingSpecialists });
  "

  dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e MONGO_EVAL="$mongo_eval" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"' >/dev/null 2>&1 || true
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
  local response="/tmp/clinia-staging-appointment-login.json"

  jq -n \
    --arg email "$STAGING_EMAIL" \
    --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > /tmp/clinia-staging-appointment-login-payload.json

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-appointment-login-payload.json \
    > "$response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$TOKEN" ]] || {
    jq . "$response" || cat "$response"
    fail "login_failed"
  }
}

future_date() {
  date -u -d "+30 days" +%F
}

ensure_drill_fixtures() {
  local service
  local fixture_json

  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  fixture_json="$(
    dc exec -T \
      -e DRILL_MARKER="$DRILL_MARKER" \
      -e DRILL_DATE="$(future_date)" \
      "$service" sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "
          const dbx = db.getSiblingDB(\"clinia\");
          const user = dbx.adminusers.findOne({ email: \"'"$STAGING_EMAIL"'\" });
          if (!user) throw new Error(\"staging user missing\");
          const patient = {
            nom: \"AppointmentDrill\",
            prenom: \"Patient\",
            num_assurance_maladie: \"RAMQ\" + String(Math.floor(Math.random() * 10000000000)).padStart(10, \"0\"),
            courriel: \"appointment-drill-\" + process.env.DRILL_MARKER + \"@clinia.local\",
            created_by_reference: process.env.DRILL_MARKER,
            ownerUserId: user._id,
            texto: false,
            documents: [],
            createdAt: new Date(),
            updatedAt: new Date()
          };
          const patientResult = dbx.patients.insertOne(patient, { writeConcern: { w: \"majority\", j: true } });
          const date = process.env.DRILL_DATE;
          const specialist = {
            nom: \"AppointmentDrill\",
            prenom: \"Specialist\",
            numero_medecin: process.env.DRILL_MARKER,
            specialite: \"Medecine de test\",
            email: \"appointment-drill-specialist@clinia.local\",
            texto: false,
            disponibilites: [
              new Date(date + \"T09:00:00.000Z\"),
              new Date(date + \"T09:15:00.000Z\")
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          };
          const specialistResult = dbx.specialists.insertOne(specialist, { writeConcern: { w: \"majority\", j: true } });
          print(JSON.stringify({
            patientId: patientResult.insertedId.toString(),
            specialistId: specialistResult.insertedId.toString(),
            date
          }));
        "'
  )"

  PATIENT_ID="$(printf '%s\n' "$fixture_json" | jq -r '.patientId')"
  SPECIALIST_ID="$(printf '%s\n' "$fixture_json" | jq -r '.specialistId')"
  APPOINTMENT_DATE="$(printf '%s\n' "$fixture_json" | jq -r '.date')"

  [[ -n "$PATIENT_ID" && "$PATIENT_ID" != "null" ]] || fail "fixture_patient_create_failed"
  [[ -n "$SPECIALIST_ID" && "$SPECIALIST_ID" != "null" ]] || fail "fixture_specialist_create_failed"
}

create_appointment() {
  local response="/tmp/clinia-staging-appointment-create.json"

  jq -n \
    --arg patient "$PATIENT_ID" \
    --arg specialist "$SPECIALIST_ID" \
    --arg date "$APPOINTMENT_DATE" \
    --arg marker "$DRILL_MARKER" \
    '{
      patient: $patient,
      specialist: $specialist,
      date: $date,
      time: "09:00",
      reason: $marker,
      priority: "normal"
    }' > /tmp/clinia-staging-appointment-create-payload.json

  curl -sS -X POST "$BASE_URL/api/appointments" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-appointment-create-payload.json \
    > "$response"

  APPOINTMENT_ID="$(jq -r '.data._id // empty' "$response")"
  if [[ -z "$APPOINTMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "creating appointment"
    fail "appointment_create_failed"
  fi

  report_ok "creating appointment"
}

read_appointment() {
  local response="/tmp/clinia-staging-appointment-read.json"

  curl -sS "$BASE_URL/api/appointments/$APPOINTMENT_ID" \
    -H "$(auth_header)" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$APPOINTMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "reading appointment"
    fail "appointment_read_failed"
  fi

  report_ok "reading appointment"
}

update_appointment() {
  local response="/tmp/clinia-staging-appointment-update.json"

  jq -n \
    --arg date "$APPOINTMENT_DATE" \
    '{ date: $date, time: "09:15" }' > /tmp/clinia-staging-appointment-update-payload.json

  curl -sS -X PATCH "$BASE_URL/api/appointments/$APPOINTMENT_ID/schedule" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-appointment-update-payload.json \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$APPOINTMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating appointment"
    fail "appointment_update_failed"
  fi

  if [[ "$(jq -r '.data.time // empty' "$response")" != "09:15" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating appointment"
    fail "appointment_update_time_not_persisted"
  fi

  report_ok "updating appointment"
}

delete_appointment() {
  local response="/tmp/clinia-staging-appointment-delete.json"

  curl -sS -X DELETE "$BASE_URL/api/appointments/$APPOINTMENT_ID" \
    -H "$(auth_header)" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$APPOINTMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "deleting appointment"
    fail "appointment_delete_failed"
  fi

  if [[ "$(jq -r '.data.status // empty' "$response")" != "cancelled" ]]; then
    jq . "$response" || cat "$response"
    report_failed "deleting appointment"
    fail "appointment_delete_status_not_cancelled"
  fi

  report_ok "deleting appointment"
}

require_command curl
require_command date
require_command docker
require_command jq

info "STAGING_APPOINTMENT_WRITE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
ensure_staging_user
login
cleanup_drill_data

printf '\nTesting appointments collection\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
APPOINTMENT_COUNT_BEFORE="$(appointment_count)"
printf 'Appointment documents before drill: %s\n' "$APPOINTMENT_COUNT_BEFORE"

ensure_drill_fixtures
create_appointment
read_appointment
update_appointment
delete_appointment
cleanup_drill_data

APPOINTMENT_COUNT_AFTER="$(appointment_count)"
printf 'Appointment documents after drill: %s\n' "$APPOINTMENT_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

if [[ "$APPOINTMENT_COUNT_BEFORE" != "$APPOINTMENT_COUNT_AFTER" ]]; then
  fail "appointment_count_changed before=$APPOINTMENT_COUNT_BEFORE after=$APPOINTMENT_COUNT_AFTER"
fi

info "STAGING_APPOINTMENT_WRITE_DRILL_PASSED marker=$DRILL_MARKER"
