#!/usr/bin/env bash
set -euo pipefail

# Creates only fictitious STAGING data so the physician inbox can be tested.
BASE_URL="${BASE_URL:-http://localhost:4002}"
COMPOSE=(docker compose -p clinia_mongo_rs -f docker-compose-mongo-rs-local.yml)
SUPERADMIN_EMAIL="${SUPERADMIN_EMAIL:-local.medecin@clinia.test}"
MARKER="clinical-support-ui-$(date +%s)-$RANDOM"
DOCTOR_EMAIL="${MARKER}@clinia.test"
DOCTOR_PASSWORD=""

require() { command -v "$1" >/dev/null || { echo "Commande manquante : $1" >&2; exit 1; }; }
require curl; require docker; require jq

read -r -s -p "Mot de passe du SUPERADMIN STAGING : " SUPERADMIN_PASSWORD
echo
read -r -s -p "Mot de passe temporaire du médecin fictif (12 caractères ou plus) : " DOCTOR_PASSWORD
echo

[[ ${#DOCTOR_PASSWORD} -ge 12 ]] || { echo "Le mot de passe temporaire doit comporter au moins 12 caractères." >&2; exit 1; }

LOGIN_COOKIE_JAR="$(mktemp)"
cleanup_login() {
  if [[ -n "${SUPERADMIN_TOKEN:-}" ]]; then
    curl -sS -o /dev/null -X POST "$BASE_URL/api/auth/logout" \
      -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
      -H 'Origin: http://localhost:5174' -b "$LOGIN_COOKIE_JAR" || true
  fi
  rm -f "$LOGIN_COOKIE_JAR"
}
trap cleanup_login EXIT

LOGIN_JSON="$(curl -sS -c "$LOGIN_COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg email "$SUPERADMIN_EMAIL" --arg password "$SUPERADMIN_PASSWORD" '{email: $email, password: $password}')")"
unset SUPERADMIN_PASSWORD
SUPERADMIN_TOKEN="$(printf '%s' "$LOGIN_JSON" | jq -r '.data.accessToken // empty')"
if [[ -z "$SUPERADMIN_TOKEN" ]]; then
  printf '%s' "$LOGIN_JSON" | jq '{error: .error, mfaRequired: .data.mfaRequired}' >&2
  exit 1
fi
unset LOGIN_JSON

PASSWORD_HASH="$("${COMPOSE[@]}" exec -T -e DRILL_PASSWORD="$DOCTOR_PASSWORD" backend node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.DRILL_PASSWORD, 12));')"

FIXTURE="$("${COMPOSE[@]}" exec -T \
  -e DOCTOR_EMAIL="$DOCTOR_EMAIL" -e MARKER="$MARKER" -e PASSWORD_HASH="$PASSWORD_HASH" \
  mongo-rs-1 sh -c '
    mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "
      const dbx=db.getSiblingDB(\"clinia\"), now=new Date();
      const doctorId=dbx.adminusers.insertOne({email:process.env.DOCTOR_EMAIL,username:process.env.MARKER,passwordHash:process.env.PASSWORD_HASH,role:\"MEDECIN\",isActive:true,mfaRequired:false,mfaEnabled:false,activeSessionIds:[],createdAt:now,updatedAt:now}).insertedId;
      const patientId=dbx.patients.insertOne({nom:\"DRILL\",prenom:process.env.MARKER,ownerUserId:doctorId,archivedAt:null,createdAt:now,updatedAt:now}).insertedId;
      print(JSON.stringify({doctorId:String(doctorId),patientId:String(patientId)}));
    "
  ')"
DOCTOR_ID="$(printf '%s' "$FIXTURE" | jq -r '.doctorId')"
PATIENT_ID="$(printf '%s' "$FIXTURE" | jq -r '.patientId')"

DOCTOR_TOKEN="$(curl -sS -X POST "$BASE_URL/api/auth/login" -H 'Content-Type: application/json' --data "$(jq -n --arg email "$DOCTOR_EMAIL" --arg password "$DOCTOR_PASSWORD" '{email:$email,password:$password}')" | jq -r '.data.accessToken // empty')"
unset DOCTOR_PASSWORD
[[ -n "$DOCTOR_TOKEN" ]] || { echo "Connexion du médecin fictif impossible." >&2; exit 1; }
REQUEST_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/clinical-support-access/physician-requests" \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg patientId "$PATIENT_ID" '{patientId:$patientId,reasonCode:"TECHNICAL_SUPPORT"}')")"
[[ "$REQUEST_STATUS" == "201" ]] || { echo "La demande n'a pas été créée (HTTP $REQUEST_STATUS)." >&2; exit 1; }

echo "Demande STAGING fictive créée et disponible pour prise en charge."
echo "Médecin temporaire : $DOCTOR_EMAIL"
echo "Identifiant de nettoyage : $MARKER"
echo "Connectez-vous comme SUPERADMIN à http://localhost:5174/login, ouvrez Demandes de soutien et prenez la demande en charge."
echo "Ensuite, connectez-vous avec ce courriel et le mot de passe temporaire choisi, puis ouvrez Accès de soutien pour l'approuver."
echo "Après le test : ./scripts/remove-staging-clinical-support-ui-fixture.sh $MARKER"
