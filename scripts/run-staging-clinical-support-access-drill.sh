#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4002}"
COMPOSE=(docker compose -p clinia_mongo_rs -f docker-compose-mongo-rs-local.yml)
SUPERADMIN_EMAIL="${SUPERADMIN_EMAIL:-local.medecin@clinia.test}"
MARKER="clinical-support-drill-$(date +%s)-$RANDOM"
DOCTOR_EMAIL="${MARKER}@clinia.test"
DOCTOR_USERNAME="$MARKER"
DOCTOR_PASSWORD="Drill-${MARKER}-passphrase"
PATIENT_ID=""
DOCTOR_ID=""
REQUEST_ID=""
LOGIN_COOKIE_JAR=""
SCRIPT_CREATED_SUPERADMIN_SESSION=false

require() { command -v "$1" >/dev/null || { echo "Missing command: $1" >&2; exit 1; }; }
require curl; require jq; require docker

cleanup() {
  if [[ "$SCRIPT_CREATED_SUPERADMIN_SESSION" == true && -n "$LOGIN_COOKIE_JAR" ]]; then
    curl -sS -o /dev/null -X POST "$BASE_URL/api/auth/logout" \
      -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
      -H 'Origin: http://localhost:5174' \
      -b "$LOGIN_COOKIE_JAR" || true
    rm -f "$LOGIN_COOKIE_JAR"
  fi
  if [[ -z "$DOCTOR_ID" ]]; then return; fi
  "${COMPOSE[@]}" exec -T -e DOCTOR_ID="$DOCTOR_ID" -e PATIENT_ID="$PATIENT_ID" mongo-rs-1 sh -c '
    mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "
      const dbx = db.getSiblingDB(\"clinia\");
      if (process.env.PATIENT_ID) dbx.patients.deleteOne({_id: new ObjectId(process.env.PATIENT_ID)});
      if (process.env.DOCTOR_ID) { dbx.clinicalsupportaccessrequests.deleteMany({physicianUserId: new ObjectId(process.env.DOCTOR_ID)}); dbx.refreshtokensessions.deleteMany({userId: new ObjectId(process.env.DOCTOR_ID)}); dbx.adminusers.deleteOne({_id: new ObjectId(process.env.DOCTOR_ID)}); }
    "' >/dev/null || true
}
trap cleanup EXIT

if [[ -z "${SUPERADMIN_TOKEN:-}" ]]; then
  read -r -s -p "Mot de passe du SUPERADMIN STAGING : " SUPERADMIN_PASSWORD
  echo
  LOGIN_COOKIE_JAR="$(mktemp)"
  LOGIN_JSON="$(curl -sS -c "$LOGIN_COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data "$(jq -n --arg email "$SUPERADMIN_EMAIL" --arg password "$SUPERADMIN_PASSWORD" '{email: $email, password: $password}')")"
  SUPERADMIN_TOKEN="$(printf '%s' "$LOGIN_JSON" | jq -r '.data.accessToken // empty')"
  unset SUPERADMIN_PASSWORD
  SCRIPT_CREATED_SUPERADMIN_SESSION=true
  if [[ -z "$SUPERADMIN_TOKEN" ]]; then
    printf '%s' "$LOGIN_JSON" | jq '{error: .error, mfaRequired: .data.mfaRequired, mfaEnrollmentRequired: .data.mfaEnrollmentRequired}' >&2
  fi
  unset LOGIN_JSON
fi
[[ -n "$SUPERADMIN_TOKEN" ]] || { echo "Impossible d'obtenir un jeton SUPERADMIN (MFA ou connexion requise)." >&2; exit 1; }
curl -fsS "$BASE_URL/api/health/ready" >/dev/null

PASSWORD_HASH="$("${COMPOSE[@]}" exec -T -e DRILL_PASSWORD="$DOCTOR_PASSWORD" backend node --input-type=module -e 'import bcrypt from "bcryptjs"; console.log(await bcrypt.hash(process.env.DRILL_PASSWORD, 12));')"
FIXTURE="$("${COMPOSE[@]}" exec -T -e DOCTOR_EMAIL="$DOCTOR_EMAIL" -e DOCTOR_USERNAME="$DOCTOR_USERNAME" -e PASSWORD_HASH="$PASSWORD_HASH" -e MARKER="$MARKER" mongo-rs-1 sh -c '
  mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "
    const dbx=db.getSiblingDB(\"clinia\"), now=new Date();
    const doctor={email:process.env.DOCTOR_EMAIL,username:process.env.DOCTOR_USERNAME,passwordHash:process.env.PASSWORD_HASH,role:\"MEDECIN\",isActive:true,mfaRequired:false,mfaEnabled:false,activeSessionIds:[],createdAt:now,updatedAt:now};
    const doctorId=dbx.adminusers.insertOne(doctor).insertedId;
    const patientId=dbx.patients.insertOne({nom:\"DRILL\",prenom:process.env.MARKER,ownerUserId:doctorId,archivedAt:null,createdAt:now,updatedAt:now}).insertedId;
    print(JSON.stringify({doctorId:String(doctorId),patientId:String(patientId)}));
  "' )"
DOCTOR_ID="$(printf '%s' "$FIXTURE" | jq -r .doctorId)"
PATIENT_ID="$(printf '%s' "$FIXTURE" | jq -r .patientId)"

DOCTOR_TOKEN="$(curl -fsS -X POST "$BASE_URL/api/auth/login" -H 'Content-Type: application/json' --data "$(jq -n --arg email "$DOCTOR_EMAIL" --arg password "$DOCTOR_PASSWORD" '{email:$email,password:$password}')" | jq -r '.data.accessToken // empty')"
[[ -n "$DOCTOR_TOKEN" ]] || { echo "Doctor login did not return a token" >&2; exit 1; }
REQUEST_ID="$(curl -fsS -X POST "$BASE_URL/api/clinical-support-access/physician-requests" -H "Authorization: Bearer $DOCTOR_TOKEN" -H 'Content-Type: application/json' --data '{"patientId":"'"$PATIENT_ID"'","reasonCode":"TECHNICAL_SUPPORT"}' | jq -r .data.id)"
curl -fsS -X POST "$BASE_URL/api/clinical-support-access/requests/$REQUEST_ID/claim" -H "Authorization: Bearer $SUPERADMIN_TOKEN" -H 'Content-Type: application/json' --data '{"justificationCode":"TECHNICAL_SUPPORT"}' >/dev/null
curl -fsS -X POST "$BASE_URL/api/clinical-support-access/requests/$REQUEST_ID/decision" -H "Authorization: Bearer $DOCTOR_TOKEN" -H 'Content-Type: application/json' --data '{"decision":"APPROVE","durationMinutes":5}' >/dev/null
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SUPERADMIN_TOKEN" "$BASE_URL/api/patients/$PATIENT_ID")"
[[ "$STATUS" == "200" ]] || { echo "Expected 200 after approval, received $STATUS" >&2; exit 1; }
"${COMPOSE[@]}" exec -T -e REQUEST_ID="$REQUEST_ID" mongo-rs-1 sh -c '
  mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "
    const result=db.getSiblingDB(\"clinia\").clinicalsupportaccessrequests.updateOne({_id:new ObjectId(process.env.REQUEST_ID),status:\"APPROVED\"},{\$set:{expiresAt:new Date(Date.now()-1000)}});
    if(result.modifiedCount!==1) quit(2);
  "' >/dev/null
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SUPERADMIN_TOKEN" "$BASE_URL/api/patients/$PATIENT_ID")"
[[ "$STATUS" == "403" ]] || { echo "Expected 403 after expiration, received $STATUS" >&2; exit 1; }
EXPIRED_STATUS="$("${COMPOSE[@]}" exec -T -e REQUEST_ID="$REQUEST_ID" mongo-rs-1 sh -c 'mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.getSiblingDB(\"clinia\").clinicalsupportaccessrequests.findOne({_id:new ObjectId(process.env.REQUEST_ID)},{status:1}).status"')"
[[ "$EXPIRED_STATUS" == "EXPIRED" ]] || { echo "Expected EXPIRED status, received $EXPIRED_STATUS" >&2; exit 1; }
echo "PASS: delegated read allowed after approval and refused after automatic expiration; temporary doctor, patient, and request will now be removed."
