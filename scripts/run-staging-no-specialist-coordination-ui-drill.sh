#!/usr/bin/env bash

# Creates isolated UI data to verify the coordination-request flow when the
# selected specialty has no specialist configured anywhere in the application.
# STAGING / local Docker stack only. All synthetic data is removed on exit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
UI_URL="${UI_URL:-http://localhost:5174}"
# Leave empty to choose the first specialty from the UI menu that has no
# specialist in the current database. It can be explicitly set if needed.
UNASSIGNED_SPECIALTY="${UNASSIGNED_SPECIALTY:-}"
DRILL_MARKER="clinia-staging-no-specialist-coordination-$(date +%s)-$RANDOM"
STAGING_PASSWORD="${STAGING_PASSWORD:-CoordinationDrill2026!}"
STAGING_UI_EMAIL="${STAGING_UI_EMAIL:-$DRILL_MARKER@clinia.test}"
STAGING_PROBE_EMAIL="${STAGING_PROBE_EMAIL:-$DRILL_MARKER-probe@clinia.test}"
PATIENT_ID=""
UI_USER_ID=""
PROBE_TOKEN=""
WORK_DIR="$(mktemp -d /tmp/clinia-no-specialist-coordination.XXXXXX)"

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

mongo_eval() {
  local expression="$1"
  local service
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
    -e UNASSIGNED_SPECIALTY="$UNASSIGNED_SPECIALTY" \
    -e PATIENT_ID="$PATIENT_ID" \
    -e UI_USER_ID="$UI_USER_ID" \
    -e MONGO_EXPRESSION="$expression" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "$MONGO_EXPRESSION"'
}

cleanup() {
  local service
  service="$(mongo_service 2>/dev/null || true)"
  if [[ -n "$service" ]]; then
    dc exec -T \
      -e DRILL_MARKER="$DRILL_MARKER" \
      -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
      -e STAGING_PROBE_EMAIL="$STAGING_PROBE_EMAIL" \
      "$service" sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "
          const dbx = db.getSiblingDB(\"clinia\");
          const patientIds = dbx.patients
            .find({ created_by_reference: process.env.DRILL_MARKER }, { _id: 1 })
            .toArray()
            .map(({ _id }) => _id);
          if (patientIds.length > 0) {
            dbx.appointmentcoordinationrequests.deleteMany({ patient: { \$in: patientIds } });
          }
          dbx.patients.deleteMany({ created_by_reference: process.env.DRILL_MARKER });
          dbx.adminusers.deleteMany({
            email: { \$in: [process.env.STAGING_UI_EMAIL, process.env.STAGING_PROBE_EMAIL] }
          });
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

choose_unassigned_specialty() {
  local count
  if [[ -z "$UNASSIGNED_SPECIALTY" ]]; then
    UNASSIGNED_SPECIALTY="$(mongo_eval '
      const candidates = [
        "Medecin de famille", "Ophtalmologue", "Cardiologue", "Pneumologue",
        "Neurologue", "Endocrinologue", "Néphrologue", "Rhumatologue"
      ];
      print(candidates.find((specialty) =>
        db.getSiblingDB("clinia").specialists.countDocuments({ specialite: specialty }) === 0
      ) || "");
    ')"
    [[ -n "$UNASSIGNED_SPECIALTY" ]] || fail "no_unassigned_specialty_available"
  fi

  count="$(mongo_eval 'db.getSiblingDB("clinia").specialists.countDocuments({ specialite: process.env.UNASSIGNED_SPECIALTY })')"
  [[ "$count" == "0" ]] || fail "specialty_already_configured specialty=$UNASSIGNED_SPECIALTY count=$count choose_another_specialty_from_the_UI_menu"
}

create_test_users() {
  local service password_hash user_ids
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  password_hash="$(
    dc exec -T -e STAGING_PASSWORD="$STAGING_PASSWORD" backend \
      node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.STAGING_PASSWORD, 12));'
  )"

  user_ids="$(dc exec -T \
    -e STAGING_UI_EMAIL="$STAGING_UI_EMAIL" \
    -e STAGING_PROBE_EMAIL="$STAGING_PROBE_EMAIL" \
    -e STAGING_PASSWORD_HASH="$password_hash" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const now = new Date();
        const makeUser = (email, role) => ({
          email, username: email, passwordHash: process.env.STAGING_PASSWORD_HASH,
          role, isActive: true, passwordResetRequired: false,
          mustChangePasswordOnNextLogin: false, failedLoginAttempts: 0, lockUntil: null,
          mfaRequired: false, mfaEnabled: false, mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null,
          mfaRecoveryCodeHashes: [], mfaChallengeId: null,
          mfaChallengePurpose: null, mfaChallengeExpiresAt: null,
          mfaChallengeAttempts: 0, mfaLockedUntil: null, createdAt: now, updatedAt: now
        });
        const uiUserId = db.getSiblingDB(\"clinia\").adminusers
          .insertOne(makeUser(process.env.STAGING_UI_EMAIL, \"MEDECIN\")).insertedId;
        const probeUserId = db.getSiblingDB(\"clinia\").adminusers
          .insertOne(makeUser(process.env.STAGING_PROBE_EMAIL, \"ADMIN\")).insertedId;
        print(JSON.stringify({ uiUserId: uiUserId.toString(), probeUserId: probeUserId.toString() }));
      "')"
  UI_USER_ID="$(jq -r '.uiUserId // empty' <<<"$user_ids")"
  [[ "$UI_USER_ID" =~ ^[a-f0-9]{24}$ ]] || fail "ui_user_create_failed"
}

login_probe() {
  local response="$WORK_DIR/probe-login.response"
  jq -n --arg email "$STAGING_PROBE_EMAIL" --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > "$WORK_DIR/probe-login.json"
  curl -sS --max-time 20 -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data-binary @"$WORK_DIR/probe-login.json" > "$response"
  if jq -e '.data.mfaRequired == true' "$response" >/dev/null; then
    fail "unexpected_mfa_challenge probe_account"
  fi
  PROBE_TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$PROBE_TOKEN" ]] || fail "probe_login_failed"
}

create_patient() {
  local service
  service="$(mongo_service)" || fail "mongo_replica_set_not_running"
  PATIENT_ID="$(dc exec -T \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e UI_USER_ID="$UI_USER_ID" \
    "$service" sh -c 'mongosh --quiet \
      --username "$CLINIA_RS_ROOT_USERNAME" \
      --password="$CLINIA_RS_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const now = new Date();
        const result = db.getSiblingDB(\"clinia\").patients.insertOne({
          nom: \"NoSpecialist\", prenom: \"Coordination\",
          nomSearch: \"nospecialist\", prenomSearch: \"coordination\",
          num_assurance_maladie: \"TEST\" + String(Math.floor(Math.random() * 10000000000)).padStart(10, \"0\"),
          ownerUserId: ObjectId(process.env.UI_USER_ID),
          created_by_reference: process.env.DRILL_MARKER,
          texto: false, documents: [], lat: 45.5017, long: -73.5673,
          createdAt: now, updatedAt: now
        });
        print(result.insertedId.toString());
      "')"
  [[ "$PATIENT_ID" =~ ^[a-f0-9]{24}$ ]] || fail "patient_create_failed"
}

assert_one_coordination_request() {
  local count
  count="$(mongo_eval 'db.getSiblingDB("clinia").appointmentcoordinationrequests.countDocuments({ patient: ObjectId(process.env.PATIENT_ID), requestedByUserId: ObjectId(process.env.UI_USER_ID), specialty: process.env.UNASSIGNED_SPECIALTY, status: "open" })')"
  [[ "$count" == "1" ]] || fail "coordination_request_not_created expected_open_requests=1 actual=$count"
}

assert_api_no_specialist_status() {
  local response="$WORK_DIR/recommendation.response" status actual_status encoded_specialty
  encoded_specialty="$(printf '%s' "$UNASSIGNED_SPECIALTY" | jq -sRr @uri)"
  status="$(curl -sS --max-time 20 -o "$response" -w '%{http_code}' \
    "$BASE_URL/api/appointments/recommendation?patient=$PATIENT_ID&specialty=$encoded_specialty" \
    -H "Authorization: Bearer $PROBE_TOKEN")"
  [[ "$status" == "200" ]] || fail "recommendation_preflight_failed status=$status"
  actual_status="$(jq -r '.meta.recommendationStatus // "missing"' "$response")"
  jq -e '.data == null and .meta.recommendationStatus == "NO_SPECIALISTS_FOR_SPECIALTY"' \
    "$response" >/dev/null || fail "wrong_recommendation_preflight expected=NO_SPECIALISTS_FOR_SPECIALTY actual=$actual_status"
}

confirm_ui_step() {
  local step="$1"

  while true; do
    printf '\n%s\n' "$step"
    PS3="Choisissez une option : "
    select choice in "Confirmé" "À refaire" "Abandonner le drill"; do
      case "$choice" in
        "Confirmé")
          return 0
          ;;
        "À refaire")
          break
          ;;
        "Abandonner le drill")
          fail "ui_verification_abandoned"
          ;;
        *)
          printf 'Choix invalide. Entrez 1, 2 ou 3.\n' >&2
          ;;
      esac
    done
  done
}

require_command curl
require_command date
require_command docker
require_command grep
require_command jq

info "STAGING_NO_SPECIALIST_COORDINATION_UI_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
choose_unassigned_specialty
create_test_users
create_patient
login_probe
assert_api_no_specialist_status

cat <<EOF

INFO UI_NO_SPECIALIST_COORDINATION_READY
  Interface: $UI_URL
  Email:     $STAGING_UI_EMAIL
  Password:  $STAGING_PASSWORD
EOF

confirm_ui_step "ÉTAPE 1/5 — Connectez-vous avec ce compte. Aucun MFA ne doit être demandé."
confirm_ui_step "ÉTAPE 2/5 — Ouvrez « Create an appointment » et recherchez le patient : Last name « NoSpecialist », First name « Coordination »."
confirm_ui_step "ÉTAPE 3/5 — Sélectionnez ce patient, puis la spécialité « $UNASSIGNED_SPECIALTY »."
confirm_ui_step "ÉTAPE 4/5 — Vérifiez le message d'absence de spécialiste, puis cliquez « Créer une demande de coordination »."
confirm_ui_step "ÉTAPE 5/5 — Vérifiez la confirmation. Le bouton d'attribution manuelle ne doit pas être proposé."

assert_one_coordination_request
info "STAGING_NO_SPECIALIST_COORDINATION_UI_DRILL_PASSED specialty=$UNASSIGNED_SPECIALTY"
