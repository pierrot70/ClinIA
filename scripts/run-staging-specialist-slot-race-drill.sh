#!/usr/bin/env bash

# Verifies through the public API that two physicians receiving the same
# recommendation cannot book one specialist at the same time. The losing
# request must receive the next available recommendation. STAGING only.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
UI_URL="${UI_URL:-http://localhost:5174}"
DRILL_MARKER="clinia-staging-specialist-slot-race-$(date +%s)-$RANDOM"
STAGING_PASSWORD="${STAGING_PASSWORD:-RaceDrill2026!}"
STAGING_EMAIL_A="${STAGING_EMAIL_A:-$DRILL_MARKER-a@clinia.test}"
STAGING_EMAIL_B="${STAGING_EMAIL_B:-$DRILL_MARKER-b@clinia.test}"
# This account is deliberately never used by curl. Logging in through the UI
# with a race account would replace its active API session and correctly
# trigger the concurrent-session MFA safeguard.
STAGING_UI_EMAIL="${STAGING_UI_EMAIL:-$DRILL_MARKER-ui@clinia.test}"
PAUSE_FOR_UI="${PAUSE_FOR_UI:-0}"
TOKEN_A=""
TOKEN_B=""
PATIENT_A_ID=""
PATIENT_B_ID=""
MANUAL_PATIENT_ID=""
CLINIQUE_ID=""
SPECIALIST_ID=""
APPOINTMENT_DATE=""
WORK_DIR="$(mktemp -d /tmp/clinia-specialist-slot-race.XXXXXX)"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

info() {
  printf 'INFO %s\n' "$*"
}

fail() {
  printf 'ERROR %s\n' "$*" >&2
  exit 1
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
  if [[ -n "$service" ]]; then
    dc exec -T \
      -e DRILL_MARKER="$DRILL_MARKER" \
      -e STAGING_EMAIL_A="$STAGING_EMAIL_A" \
      -e STAGING_EMAIL_B="$STAGING_EMAIL_B" \
      -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
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
          dbx.cliniques.deleteMany({ nom: marker });
          dbx.adminusers.deleteMany({ email: { \$in: [process.env.STAGING_EMAIL_A, process.env.STAGING_EMAIL_B, process.env.STAGING_UI_EMAIL] } });
        "' >/dev/null 2>&1 || true
  fi

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

create_test_users() {
  local service password_hash
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  password_hash="$(
    dc exec -T -e STAGING_PASSWORD="$STAGING_PASSWORD" backend \
      node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.STAGING_PASSWORD, 12));'
  )"

  dc exec -T \
    -e STAGING_EMAIL_A="$STAGING_EMAIL_A" \
    -e STAGING_EMAIL_B="$STAGING_EMAIL_B" \
    -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
    -e STAGING_PASSWORD_HASH="$password_hash" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const dbx = db.getSiblingDB(\"clinia\");
        const now = new Date();
        for (const email of [process.env.STAGING_EMAIL_A, process.env.STAGING_EMAIL_B, process.env.STAGING_UI_EMAIL]) {
          dbx.adminusers.insertOne({
            email, username: email, passwordHash: process.env.STAGING_PASSWORD_HASH,
            role: \"MEDECIN\", isActive: true, passwordResetRequired: false,
            mustChangePasswordOnNextLogin: false, failedLoginAttempts: 0,
            mfaRequired: false, mfaEnabled: false, mfaSecretEncrypted: null,
            mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null,
            mfaRecoveryCodeHashes: [], mfaChallengeId: null,
            mfaChallengePurpose: null, mfaChallengeExpiresAt: null,
            mfaChallengeAttempts: 0, mfaLockedUntil: null,
            lockUntil: null, createdAt: now, updatedAt: now,
          });
        }
      "'
}

login() {
  local email="$1" response="$2"
  jq -n --arg email "$email" --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > "$WORK_DIR/login.json"
  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data-binary @"$WORK_DIR/login.json" > "$response"
  if jq -e '.data.mfaRequired == true' "$response" >/dev/null; then
    fail "unexpected_mfa_challenge email=$email"
  fi
  jq -r '.data.accessToken // empty' "$response"
}

create_fixtures() {
  local service fixture_json
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  fixture_json="$(
    dc exec -T \
      -e DRILL_MARKER="$DRILL_MARKER" \
      -e STAGING_EMAIL_A="$STAGING_EMAIL_A" \
      -e STAGING_EMAIL_B="$STAGING_EMAIL_B" \
      -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
      -e DRILL_DATE="$(date -u -d '+30 days' +%F)" \
      "$service" sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "
          const dbx = db.getSiblingDB(\"clinia\");
          const now = new Date();
          const marker = process.env.DRILL_MARKER;
          const userA = dbx.adminusers.findOne({ email: process.env.STAGING_EMAIL_A });
          const userB = dbx.adminusers.findOne({ email: process.env.STAGING_EMAIL_B });
          const uiUser = dbx.adminusers.findOne({ email: process.env.STAGING_UI_EMAIL });
          if (!userA || !userB || !uiUser) throw new Error(\"test users missing\");
          const cliniqueId = dbx.cliniques.insertOne({
            nom: marker, num_civique: \"1\", rue: \"Rue de test\", code_postal: \"H1H1H1\",
            lat: 45.5, long: -73.5, createdAt: now, updatedAt: now,
          }).insertedId;
          const patient = (ownerUserId, suffix) => ({
            nom: \"RaceDrill\", prenom: suffix,
            nomSearch: \"racedrill\", prenomSearch: String(suffix).toLowerCase(),
            num_assurance_maladie: \"TEST\" + String(Math.floor(Math.random() * 10000000000)).padStart(10, \"0\"),
            created_by_reference: marker, ownerUserId, texto: false, documents: [],
            lat: 45.5, long: -73.5, createdAt: now, updatedAt: now,
          });
          const specialist = {
            nom: \"RaceDrill\", prenom: \"Specialist\", numero_medecin: marker,
            specialite: \"Cardiologue\", clinique_associer: cliniqueId,
            disponibilites: [
              new Date(process.env.DRILL_DATE + \"T09:00:00.000Z\"),
              new Date(process.env.DRILL_DATE + \"T09:15:00.000Z\"),
            ],
            createdAt: now, updatedAt: now,
          };
          const patientAId = dbx.patients.insertOne(patient(userA._id, \"A\")).insertedId;
          const patientBId = dbx.patients.insertOne(patient(userB._id, \"B\")).insertedId;
          const manualPatientId = dbx.patients.insertOne({
            ...patient(uiUser._id, \"Manual fallback\"),
            nom: \"ManualFallback\", prenom: \"RaceDrill\",
            nomSearch: \"manualfallback\", prenomSearch: \"racedrill\",
            lat: undefined, long: undefined,
          }).insertedId;
          const specialistId = dbx.specialists.insertOne(specialist).insertedId;
          print(JSON.stringify({
            patientAId: patientAId.toString(), patientBId: patientBId.toString(),
            manualPatientId: manualPatientId.toString(),
            cliniqueId: cliniqueId.toString(), specialistId: specialistId.toString(),
            date: process.env.DRILL_DATE,
          }));
        "'
  )"

  PATIENT_A_ID="$(jq -r '.patientAId // empty' <<<"$fixture_json")"
  PATIENT_B_ID="$(jq -r '.patientBId // empty' <<<"$fixture_json")"
  MANUAL_PATIENT_ID="$(jq -r '.manualPatientId // empty' <<<"$fixture_json")"
  CLINIQUE_ID="$(jq -r '.cliniqueId // empty' <<<"$fixture_json")"
  SPECIALIST_ID="$(jq -r '.specialistId // empty' <<<"$fixture_json")"
  APPOINTMENT_DATE="$(jq -r '.date // empty' <<<"$fixture_json")"
  [[ -n "$PATIENT_A_ID" && -n "$PATIENT_B_ID" && -n "$MANUAL_PATIENT_ID" && -n "$CLINIQUE_ID" && -n "$SPECIALIST_ID" && -n "$APPOINTMENT_DATE" ]] || fail "fixture_create_failed"
}

recommend() {
  local token="$1" patient_id="$2" response="$3"
  curl -sS --max-time 20 \
    "$BASE_URL/api/appointments/recommendation?patient=$patient_id&specialty=Cardiologue" \
    -H "Authorization: Bearer $token" > "$response"
}

assert_recommendation() {
  local response="$1" expected_time="$2"
  jq -e \
    --arg clinic "$CLINIQUE_ID" \
    --arg specialist "$SPECIALIST_ID" \
    --arg date "$APPOINTMENT_DATE" \
    --arg time "$expected_time" \
    '.data.clinique._id == $clinic and .data.specialist._id == $specialist and .data.date == $date and .data.time == $time' \
    "$response" >/dev/null || {
      jq . "$response" || cat "$response"
      fail "unexpected_recommendation expected_time=$expected_time"
    }
}

create_payload() {
  local patient_id="$1" output_file="$2"
  jq -n \
    --arg patient "$patient_id" \
    --arg specialist "$SPECIALIST_ID" \
    --arg clinic "$CLINIQUE_ID" \
    --arg date "$APPOINTMENT_DATE" \
    --arg marker "$DRILL_MARKER" \
    '{ patient: $patient, specialist: $specialist, clinique: $clinic, date: $date, time: "09:00", reason: $marker, priority: "normal" }' \
    > "$output_file"
}

post_appointment() {
  local token="$1" payload="$2" response="$3" status="$4"
  curl -sS --max-time 20 -o "$response" -w '%{http_code}' \
    -X POST "$BASE_URL/api/appointments" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    --data-binary @"$payload" > "$status"
}

assert_one_scheduled_appointment() {
  local service count
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  count="$(dc exec -T -e DRILL_MARKER="$DRILL_MARKER" "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.getSiblingDB(\"clinia\").appointments.countDocuments({ reason: process.env.DRILL_MARKER, status: \"scheduled\" })"')"
  [[ "$count" == "1" ]] || fail "race_protection_failed expected_scheduled_appointments=1 actual=$count"
}

require_command curl
require_command date
require_command docker
require_command grep
require_command jq

[[ "$PAUSE_FOR_UI" == "0" || "$PAUSE_FOR_UI" == "1" ]] ||
  fail "invalid_pause_for_ui expected=0_or_1 actual=$PAUSE_FOR_UI"

info "STAGING_SPECIALIST_SLOT_RACE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
create_test_users
TOKEN_A="$(login "$STAGING_EMAIL_A" "$WORK_DIR/login-a.response")"
TOKEN_B="$(login "$STAGING_EMAIL_B" "$WORK_DIR/login-b.response")"
[[ -n "$TOKEN_A" && -n "$TOKEN_B" ]] || fail "login_failed"
create_fixtures

recommend "$TOKEN_A" "$PATIENT_A_ID" "$WORK_DIR/recommendation-a-before.json"
recommend "$TOKEN_B" "$PATIENT_B_ID" "$WORK_DIR/recommendation-b-before.json"
assert_recommendation "$WORK_DIR/recommendation-a-before.json" "09:00"
assert_recommendation "$WORK_DIR/recommendation-b-before.json" "09:00"

create_payload "$PATIENT_A_ID" "$WORK_DIR/a.json"
create_payload "$PATIENT_B_ID" "$WORK_DIR/b.json"
post_appointment "$TOKEN_A" "$WORK_DIR/a.json" "$WORK_DIR/a.response" "$WORK_DIR/a.status" &
pid_a=$!
post_appointment "$TOKEN_B" "$WORK_DIR/b.json" "$WORK_DIR/b.response" "$WORK_DIR/b.status" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

status_a="$(cat "$WORK_DIR/a.status")"
status_b="$(cat "$WORK_DIR/b.status")"
printf 'Race responses: request A=%s, request B=%s\n' "$status_a" "$status_b"
jq . "$WORK_DIR/a.response"
jq . "$WORK_DIR/b.response"

if [[ "$status_a$status_b" != "201409" && "$status_a$status_b" != "409201" && "$status_a$status_b" != "201400" && "$status_a$status_b" != "400201" ]]; then
  fail "race_protection_failed expected_statuses=201,409_or_400 actual_statuses=$status_a,$status_b"
fi

if [[ "$status_a" == "201" ]]; then
  loser_token="$TOKEN_B"
  loser_patient="$PATIENT_B_ID"
  loser_response="$WORK_DIR/b.response"
else
  loser_token="$TOKEN_A"
  loser_patient="$PATIENT_A_ID"
  loser_response="$WORK_DIR/a.response"
fi

if ! jq -e '.error.code == "SPECIALIST_ALREADY_BOOKED" or .error.code == "APPOINTMENT_CONFLICT" or .error.code == "NO_AVAILABILITY"' "$loser_response" >/dev/null; then
  fail "race_protection_failed expected_specialist_conflict_or_no_availability"
fi

assert_one_scheduled_appointment
recommend "$loser_token" "$loser_patient" "$WORK_DIR/recommendation-after.json"
assert_recommendation "$WORK_DIR/recommendation-after.json" "09:15"
jq . "$WORK_DIR/recommendation-after.json"

if [[ "$PAUSE_FOR_UI" == "1" ]]; then
  cat <<EOF

INFO UI_MANUAL_FALLBACK_READY
  Interface: $UI_URL
  Email:    $STAGING_UI_EMAIL
  Password: $STAGING_PASSWORD
  Patient:  RaceDrill ManualFallback

Dans l'interface, connectez-vous avec ce compte (distinct des comptes curl), recherchez le patient
"ManualFallback", puis choisissez la spécialité Cardiologue. Comme ce patient
n'a pas de coordonnées, la proposition automatique échoue et le bouton
"Attribuer manuellement un rendez-vous" doit apparaître. Vous pouvez ensuite
choisir la clinique, le spécialiste, la date $APPOINTMENT_DATE et le créneau
09:15. Appuyez sur Entrée ici lorsque votre vérification est terminée; le drill
supprimera toutes ses données synthétiques.
EOF
  read -r -p "Appuyez sur Entrée pour nettoyer les données de test..." _
fi

info "STAGING_SPECIALIST_SLOT_RACE_DRILL_PASSED statuses=$status_a,$status_b next_slot=09:15"
