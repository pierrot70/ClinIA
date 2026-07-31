#!/usr/bin/env bash

# Proves through the public API that concurrent appointments cannot book the
# same patient at the same instant. It creates only synthetic fixtures and
# removes them on exit; audit receipts are intentionally retained.
set -euo pipefail

BACKEND_CONTAINER_PREFIX="${BACKEND_CONTAINER_PREFIX:-backend-}"
BACKEND_CONTAINER_EXCLUDE_PREFIX="${BACKEND_CONTAINER_EXCLUDE_PREFIX:-backend-replica-}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}"
BASE_URL="${BASE_URL:-https://clinique-ai.ca}"
BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
BACKUP_VERIFY_SCRIPT="${BACKUP_VERIFY_SCRIPT:-/opt/clinia/scripts/verify-mongo-backup.sh}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"
CONFIRM_PRODUCTION_APPOINTMENT_RACE_DRILL="${CONFIRM_PRODUCTION_APPOINTMENT_RACE_DRILL:-}"
MIGRATION_BACKUP_CONFIRMED="${MIGRATION_BACKUP_CONFIRMED:-}"

DRILL_MARKER="clinia-production-appointment-race-drill-$(date +%s)-$RANDOM"
TEST_EMAIL="${DRILL_MARKER}@clinia.invalid"
WORK_DIR="$(mktemp -d /tmp/clinia-production-appointment-race.XXXXXX)"
BACKEND_CONTAINER=""
MONGO_CONTAINER=""
MONGO_PASSWORD=""
TEST_USER_ID=""
PATIENT_ID=""
SPECIALIST_A_ID=""
SPECIALIST_B_ID=""
APPOINTMENT_DATE=""
TOKEN=""

info() {
  printf 'INFO %s\n' "$*"
}

warn() {
  printf 'WARN %s\n' "$*" >&2
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

find_backend_container() {
  docker ps --format '{{.Names}}' |
    awk -v prefix="$BACKEND_CONTAINER_PREFIX" -v exclude="$BACKEND_CONTAINER_EXCLUDE_PREFIX" '
      index($1, prefix) == 1 && (exclude == "" || index($1, exclude) != 1) {
        print $1
        exit
      }
    '
}

mongo_containers() {
  docker ps --format '{{.Names}}' |
    awk -v prefix="$MONGO_CONTAINER_PREFIX" '
      index($1, prefix) == 1 {
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

find_primary_mongo_container() {
  local container
  while IFS= read -r container; do
    if docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$container" \
      sh -c 'mongosh --quiet \
        --username "$MONGO_ROOT_USERNAME" \
        --password="$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.hello().isWritablePrimary === true"' |
      grep -q 'true'; then
      printf '%s' "$container"
      return
    fi
  done < <(mongo_containers)
  return 1
}

mongo_eval() {
  local expression="$1"
  docker exec \
    -e MONGO_PASSWORD="$MONGO_PASSWORD" \
    -e MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e TEST_EMAIL="$TEST_EMAIL" \
    -e TEST_USER_ID="$TEST_USER_ID" \
    -e MONGO_EVAL="$expression" \
    "$MONGO_CONTAINER" sh -c 'mongosh --quiet \
      --username "$MONGO_ROOT_USERNAME" \
      --password="$MONGO_PASSWORD" \
      --authenticationDatabase admin \
      --eval "$MONGO_EVAL"'
}

find_latest_backup() {
  find "$BACKUP_OUTPUT_DIR" -maxdepth 1 -type f \
    \( -name "${BACKUP_LABEL}-*.archive.gz" -o -name "${BACKUP_LABEL}-*.archive.gz.age" \) \
    -printf '%T@ %p\n' |
    sort -nr |
    awk 'NR == 1 { $1=""; sub(/^ /, ""); print }'
}

verify_backup_preflight() {
  local archive="$1" now_epoch archive_epoch age_seconds max_age_seconds
  [[ -x "$BACKUP_VERIFY_SCRIPT" ]] || fail "backup_verify_script_not_executable path=$BACKUP_VERIFY_SCRIPT"
  [[ -n "$archive" && -f "$archive" ]] || fail "backup_archive_not_found dir=$BACKUP_OUTPUT_DIR"
  [[ "$MAX_BACKUP_AGE_HOURS" =~ ^[0-9]+$ ]] || fail "invalid_max_backup_age_hours value=$MAX_BACKUP_AGE_HOURS"

  now_epoch="$(date +%s)"
  archive_epoch="$(stat -c '%Y' "$archive")"
  age_seconds=$((now_epoch - archive_epoch))
  max_age_seconds=$((MAX_BACKUP_AGE_HOURS * 3600))
  (( age_seconds >= 0 && age_seconds <= max_age_seconds )) ||
    fail "backup_too_old archive=$archive age_seconds=$age_seconds max_age_seconds=$max_age_seconds"

  "$BACKUP_VERIFY_SCRIPT" "$archive" >/dev/null
  info "backup_preflight=ok archive=$archive age_seconds=$age_seconds"
}

cleanup() {
  local status="$?"
  if [[ -n "$MONGO_CONTAINER" && -n "$MONGO_PASSWORD" ]]; then
    mongo_eval '
      const dbx = db.getSiblingDB("clinia");
      const marker = process.env.DRILL_MARKER;
      const patients = dbx.patients.find({ created_by_reference: marker }, { _id: 1 }).toArray();
      const patientIds = patients.map(({ _id }) => _id);
      if (patientIds.length > 0) {
        dbx.appointmentbookingguards.deleteMany({ patient: { $in: patientIds } });
      }
      dbx.appointments.deleteMany({ reason: marker });
      dbx.patients.deleteMany({ created_by_reference: marker });
      dbx.specialists.deleteMany({ numero_medecin: { $regex: "^" + marker } });
      dbx.adminusers.deleteMany({ email: process.env.TEST_EMAIL });
    ' >/dev/null 2>&1 || warn "cleanup_failed marker=$DRILL_MARKER"
  fi
  rm -rf "$WORK_DIR"
  if [[ "$status" -ne 0 ]]; then
    warn "production_appointment_race_drill=failed marker=$DRILL_MARKER cleanup=attempted"
  fi
}

trap cleanup EXIT

wait_for_ready() {
  local attempt
  for attempt in {1..12}; do
    if curl -fsS --max-time 10 "$BASE_URL/api/health/ready" >/dev/null; then
      return
    fi
    sleep 5
  done
  fail "public_backend_not_ready url=$BASE_URL/api/health/ready"
}

assert_race_index() {
  mongo_eval '
    const dbx = db.getSiblingDB("clinia");
    const index = dbx.appointments.getIndexes().find(({ name }) => name === "patient_date_time_scheduled_unique");
    if (!index || index.unique !== true || index.partialFilterExpression?.status !== "scheduled") {
      throw new Error("patient_date_time_scheduled_unique_missing");
    }
    print("index=patient_date_time_scheduled_unique status=OK");
  '
}

create_fixtures() {
  local fixture_json
  fixture_json="$(mongo_eval '
    const dbx = db.getSiblingDB("clinia");
    const now = new Date();
    const marker = process.env.DRILL_MARKER;
    const user = {
      username: marker,
      email: process.env.TEST_EMAIL,
      passwordHash: "production-race-drill-no-login",
      role: "SUPERADMIN",
      isActive: true,
      activeSessionIds: [],
      passwordResetRequired: false,
      mustChangePasswordOnNextLogin: false,
      createdAt: now,
      updatedAt: now,
    };
    const userId = dbx.adminusers.insertOne(user, { writeConcern: { w: "majority", j: true } }).insertedId;
    const patient = {
      nom: "RaceDrill",
      prenom: "Synthetic",
      num_assurance_maladie: "TEST" + String(Math.floor(Math.random() * 10000000000)).padStart(10, "0"),
      courriel: marker + "@clinia.invalid",
      created_by_reference: marker,
      ownerUserId: userId,
      texto: false,
      documents: [],
      createdAt: now,
      updatedAt: now,
    };
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 30);
    const dateKey = date.toISOString().slice(0, 10);
    const availability = [new Date(dateKey + "T09:00:00.000Z")];
    const specialist = (suffix) => ({
      nom: "RaceDrill",
      prenom: suffix,
      numero_medecin: marker + "-" + suffix,
      specialite: "Medecine de test",
      email: marker + "-" + suffix + "@clinia.invalid",
      texto: false,
      disponibilites: availability,
      createdAt: now,
      updatedAt: now,
    });
    const patientId = dbx.patients.insertOne(patient, { writeConcern: { w: "majority", j: true } }).insertedId;
    const specialistAId = dbx.specialists.insertOne(specialist("A"), { writeConcern: { w: "majority", j: true } }).insertedId;
    const specialistBId = dbx.specialists.insertOne(specialist("B"), { writeConcern: { w: "majority", j: true } }).insertedId;
    print(JSON.stringify({ userId: userId.toString(), patientId: patientId.toString(), specialistAId: specialistAId.toString(), specialistBId: specialistBId.toString(), date: dateKey }));
  ')"

  TEST_USER_ID="$(jq -r '.userId // empty' <<<"$fixture_json")"
  PATIENT_ID="$(jq -r '.patientId // empty' <<<"$fixture_json")"
  SPECIALIST_A_ID="$(jq -r '.specialistAId // empty' <<<"$fixture_json")"
  SPECIALIST_B_ID="$(jq -r '.specialistBId // empty' <<<"$fixture_json")"
  APPOINTMENT_DATE="$(jq -r '.date // empty' <<<"$fixture_json")"
  [[ -n "$TEST_USER_ID" && -n "$PATIENT_ID" && -n "$SPECIALIST_A_ID" && -n "$SPECIALIST_B_ID" && -n "$APPOINTMENT_DATE" ]] || fail "fixture_create_failed"
}

create_short_lived_token() {
  TOKEN="$(
    docker exec \
      -e DRILL_USER_ID="$TEST_USER_ID" \
      -e DRILL_USERNAME="$DRILL_MARKER" \
      "$BACKEND_CONTAINER" \
      node --input-type=module -e '
      import jwt from "jsonwebtoken";
      const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
      if (!secret || !process.env.DRILL_USER_ID) process.exit(2);
      process.stdout.write(jwt.sign(
        { role: "SUPERADMIN", username: process.env.DRILL_USERNAME, sid: null },
        secret,
        { subject: process.env.DRILL_USER_ID, algorithm: "HS256", expiresIn: "5m", issuer: "clinia-backend", audience: "clinia-app" }
      ));
    '
  )"
  [[ -n "$TOKEN" ]] || fail "test_token_create_failed"
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
  curl -sS --max-time 20 -o "$response" -w '%{http_code}' \
    -X POST "$BASE_URL/api/appointments" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary @"$payload" > "$status"
}

assert_one_appointment() {
  local count
  count="$(mongo_eval 'db.getSiblingDB("clinia").appointments.countDocuments({ reason: process.env.DRILL_MARKER, status: "scheduled" })')"
  [[ "$count" == "1" ]] || fail "race_protection_failed expected_scheduled_appointments=1 actual=$count"
}

require_command awk
require_command curl
require_command date
require_command docker
require_command find
require_command grep
require_command jq
require_command stat

[[ "$CONFIRM_PRODUCTION_APPOINTMENT_RACE_DRILL" == "RUN_CLINIA_PRODUCTION_APPOINTMENT_RACE_DRILL" ]] ||
  fail "missing_confirmation set CONFIRM_PRODUCTION_APPOINTMENT_RACE_DRILL=RUN_CLINIA_PRODUCTION_APPOINTMENT_RACE_DRILL"
[[ "$MIGRATION_BACKUP_CONFIRMED" == "YES" ]] ||
  fail "missing_backup_confirmation set MIGRATION_BACKUP_CONFIRMED=YES after reviewing a verified backup"
docker info >/dev/null 2>&1 || fail "docker_unavailable"

BACKEND_CONTAINER="$(find_backend_container)"
[[ -n "$BACKEND_CONTAINER" ]] || fail "backend_container_not_found"
MONGO_PASSWORD="$(mongo_containers | while IFS= read -r container; do load_mongo_password "$container"; done | awk 'NF { print; exit }')"
[[ -n "$MONGO_PASSWORD" ]] || fail "mongo_root_password_not_found"
MONGO_CONTAINER="$(find_primary_mongo_container)" || fail "mongo_primary_not_found"

info "PRODUCTION_APPOINTMENT_RACE_DRILL_STARTED backend_container=$BACKEND_CONTAINER marker=$DRILL_MARKER"
verify_backup_preflight "$(find_latest_backup)"
wait_for_ready
assert_race_index
create_fixtures
create_short_lived_token
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

assert_one_appointment
info "PRODUCTION_APPOINTMENT_RACE_DRILL_PASSED statuses=$status_a,$status_b scheduled_appointments=1"
