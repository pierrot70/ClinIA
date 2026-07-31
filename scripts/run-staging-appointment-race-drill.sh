#!/usr/bin/env bash

# Verifies that two concurrent requests cannot schedule one patient at the same
# instant with different specialists. This script is restricted to local STAGING.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
DRILL_MARKER="clinia-staging-appointment-race-drill-$(date +%s)-$RANDOM"
STAGING_EMAIL="${STAGING_EMAIL:-$DRILL_MARKER@clinia.test}"
STAGING_PASSWORD="${STAGING_PASSWORD:-local-race-drill-password}"
TOKEN=""
PATIENT_ID=""
SPECIALIST_A_ID=""
SPECIALIST_B_ID=""
APPOINTMENT_DATE=""
WORK_DIR="$(mktemp -d /tmp/clinia-appointment-race.XXXXXX)"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

info() {
  printf 'INFO %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

mongo_service() {
  local service
  for service in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if dc ps --services --status running | grep -Fxq "$service"; then
      printf '%s' "$service"
      return
    fi
  done
  return 1
}

cleanup() {
  local service
  service="$(mongo_service 2>/dev/null || true)"
  [[ -n "$service" ]] || {
    rm -rf "$WORK_DIR"
    return
  }

  dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e STAGING_EMAIL="$STAGING_EMAIL" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const dbx = db.getSiblingDB(\"clinia\");
        const marker = process.env.DRILL_MARKER;
        const patientIds = dbx.patients
          .find({ created_by_reference: marker }, { _id: 1 })
          .toArray()
          .map(({ _id }) => _id);
        if (patientIds.length > 0) {
          dbx.appointmentbookingguards.deleteMany({ patient: { \$in: patientIds } });
        }
        dbx.appointments.deleteMany({ reason: marker });
        dbx.patients.deleteMany({ created_by_reference: marker });
        dbx.specialists.deleteMany({ numero_medecin: marker });
        dbx.adminusers.deleteMany({ email: process.env.STAGING_EMAIL });
      "' >/dev/null 2>&1 || true

  rm -rf "$WORK_DIR"
}

trap cleanup EXIT

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

ensure_test_user() {
  local service password_hash
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  password_hash="$(
    dc exec -T -e STAGING_PASSWORD="$STAGING_PASSWORD" backend \
      node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.STAGING_PASSWORD, 12));'
  )"

  dc exec -T \
    -e STAGING_EMAIL="$STAGING_EMAIL" \
    -e STAGING_PASSWORD_HASH="$password_hash" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const now = new Date();
        db.getSiblingDB(\"clinia\").adminusers.insertOne({
          email: process.env.STAGING_EMAIL,
          username: process.env.STAGING_EMAIL,
          passwordHash: process.env.STAGING_PASSWORD_HASH,
          role: \"SUPERADMIN\",
          isActive: true,
          passwordResetRequired: false,
          mustChangePasswordOnNextLogin: false,
          failedLoginAttempts: 0,
          lockUntil: null,
          createdAt: now,
          updatedAt: now
        });
      "'
}

login() {
  jq -n --arg email "$STAGING_EMAIL" --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > "$WORK_DIR/login.json"
  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data-binary @"$WORK_DIR/login.json" > "$WORK_DIR/login.response"
  TOKEN="$(jq -r '.data.accessToken // empty' "$WORK_DIR/login.response")"
  [[ -n "$TOKEN" ]] || {
    jq . "$WORK_DIR/login.response" || cat "$WORK_DIR/login.response"
    fail "login_failed"
  }
}

create_fixtures() {
  local service fixture_json
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  fixture_json="$(
    dc exec -T \
      -e DRILL_MARKER="$DRILL_MARKER" \
      -e STAGING_EMAIL="$STAGING_EMAIL" \
      -e DRILL_DATE="$(date -u -d '+30 days' +%F)" \
      "$service" sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "
          const dbx = db.getSiblingDB(\"clinia\");
          const now = new Date();
          const user = dbx.adminusers.findOne({ email: process.env.STAGING_EMAIL });
          if (!user) throw new Error(\"test user missing\");
          const patient = {
            nom: \"RaceDrill\", prenom: \"Patient\",
            num_assurance_maladie: \"TEST\" + String(Math.floor(Math.random() * 10000000000)).padStart(10, \"0\"),
            courriel: process.env.DRILL_MARKER + \"@clinia.local\",
            created_by_reference: process.env.DRILL_MARKER,
            ownerUserId: user._id, texto: false, documents: [],
            createdAt: now, updatedAt: now
          };
          const availability = [new Date(process.env.DRILL_DATE + \"T09:00:00.000Z\")];
          const specialist = (suffix) => ({
            nom: \"RaceDrill\", prenom: suffix,
            numero_medecin: process.env.DRILL_MARKER + \"-\" + suffix,
            specialite: \"Medecine de test\",
            email: process.env.DRILL_MARKER + \"-\" + suffix + \"@clinia.local\",
            texto: false, disponibilites: availability, createdAt: now, updatedAt: now
          });
          const patientId = dbx.patients.insertOne(patient).insertedId;
          const specialistAId = dbx.specialists.insertOne(specialist(\"A\")).insertedId;
          const specialistBId = dbx.specialists.insertOne(specialist(\"B\")).insertedId;
          print(JSON.stringify({
            patientId: patientId.toString(),
            specialistAId: specialistAId.toString(),
            specialistBId: specialistBId.toString(),
            date: process.env.DRILL_DATE
          }));
        "'
  )"

  PATIENT_ID="$(jq -r '.patientId // empty' <<<"$fixture_json")"
  SPECIALIST_A_ID="$(jq -r '.specialistAId // empty' <<<"$fixture_json")"
  SPECIALIST_B_ID="$(jq -r '.specialistBId // empty' <<<"$fixture_json")"
  APPOINTMENT_DATE="$(jq -r '.date // empty' <<<"$fixture_json")"
  [[ -n "$PATIENT_ID" && -n "$SPECIALIST_A_ID" && -n "$SPECIALIST_B_ID" && -n "$APPOINTMENT_DATE" ]] || fail "fixture_create_failed"
}

create_payload() {
  local specialist_id="$1" output_file="$2"
  jq -n \
    --arg patient "$PATIENT_ID" \
    --arg specialist "$specialist_id" \
    --arg date "$APPOINTMENT_DATE" \
    --arg marker "$DRILL_MARKER" \
    '{ patient: $patient, specialist: $specialist, date: $date, time: "09:00", reason: $marker, priority: "normal" }' \
    > "$output_file"
}

post_appointment() {
  local payload="$1" response="$2" status="$3"
  curl -sS -o "$response" -w '%{http_code}' \
    -X POST "$BASE_URL/api/appointments" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary @"$payload" > "$status"
}

require_command curl
require_command date
require_command docker
require_command grep
require_command jq

info "STAGING_APPOINTMENT_RACE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
MIGRATION_ENV=STAGING "$ROOT_DIR/scripts/run-mongo-migrations.sh" --apply --allow-irreversible
ensure_test_user
login
create_fixtures
create_payload "$SPECIALIST_A_ID" "$WORK_DIR/a.json"
create_payload "$SPECIALIST_B_ID" "$WORK_DIR/b.json"

post_appointment "$WORK_DIR/a.json" "$WORK_DIR/a.response" "$WORK_DIR/a.status" &
pid_a=$!
post_appointment "$WORK_DIR/b.json" "$WORK_DIR/b.response" "$WORK_DIR/b.status" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

status_a="$(cat "$WORK_DIR/a.status")"
status_b="$(cat "$WORK_DIR/b.status")"
printf 'Race responses: request A=%s, request B=%s\n' "$status_a" "$status_b"
jq . "$WORK_DIR/a.response"
jq . "$WORK_DIR/b.response"

if [[ "$status_a$status_b" != "201409" && "$status_a$status_b" != "409201" ]]; then
  fail "race_protection_failed expected_statuses=201,409 actual_statuses=$status_a,$status_b"
fi

if ! jq -s -e 'any(.[]; .error.code == "PATIENT_ALREADY_BOOKED")' \
  "$WORK_DIR/a.response" "$WORK_DIR/b.response" >/dev/null; then
  fail "race_protection_failed expected_error=PATIENT_ALREADY_BOOKED"
fi

info "STAGING_APPOINTMENT_RACE_DRILL_PASSED statuses=$status_a,$status_b"
