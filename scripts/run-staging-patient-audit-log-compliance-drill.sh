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
DRILL_MARKER="clinia-staging-patient-audit-log-drill-$(date +%s)-$RANDOM"
PATIENT_ID=""
TOKEN=""
AUDIT_COUNT_BEFORE=""
AUDIT_COUNT_AFTER=""
RAMQ_VALUE="RAMQ$(printf '%010d' "$((RANDOM * RANDOM % 10000000000))")"
PHONE_VALUE="514$(printf '%07d' "$((RANDOM * RANDOM % 10000000))")"
EMAIL_VALUE="audit-drill-$DRILL_MARKER@clinia.local"
PATIENT_LAST_NAME="AuditDrillNom$RANDOM"
PATIENT_FIRST_NAME="AuditDrillPrenom$RANDOM"

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
    -e PATIENT_ID="$PATIENT_ID" \
    -e RAMQ_VALUE="$RAMQ_VALUE" \
    -e PHONE_VALUE="$PHONE_VALUE" \
    -e EMAIL_VALUE="$EMAIL_VALUE" \
    -e PATIENT_LAST_NAME="$PATIENT_LAST_NAME" \
    -e PATIENT_FIRST_NAME="$PATIENT_FIRST_NAME" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

audit_count() {
  MONGO_EVAL='db.getSiblingDB("clinia").patientauditlogs.countDocuments({})' \
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
  info "cleanup_marker marker=$DRILL_MARKER patient_id=$PATIENT_ID"

  MONGO_EVAL='
    const dbx = db.getSiblingDB("clinia");
    if (process.env.PATIENT_ID) {
      dbx.patientauditlogs.deleteMany({ patientId: ObjectId(process.env.PATIENT_ID) });
      dbx.patients.deleteMany({ _id: ObjectId(process.env.PATIENT_ID) });
    }
    dbx.patients.deleteMany({ created_by_reference: process.env.DRILL_MARKER });
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
              massDownloadRestrictedUntil: null,
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
  local response="/tmp/clinia-staging-patient-audit-login.json"

  jq -n \
    --arg email "$STAGING_EMAIL" \
    --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > /tmp/clinia-staging-patient-audit-login-payload.json

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-patient-audit-login-payload.json \
    > "$response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$TOKEN" ]] || {
    jq . "$response" || cat "$response"
    fail "login_failed"
  }
}

create_audited_patient() {
  local response="/tmp/clinia-staging-patient-audit-create.json"

  jq -n \
    --arg marker "$DRILL_MARKER" \
    --arg ramq "$RAMQ_VALUE" \
    --arg phone "$PHONE_VALUE" \
    --arg email "$EMAIL_VALUE" \
    --arg nom "$PATIENT_LAST_NAME" \
    --arg prenom "$PATIENT_FIRST_NAME" \
    '{
      nom: $nom,
      prenom: $prenom,
      num_assurance_maladie: $ramq,
      telephone: $phone,
      courriel: $email,
      addresse: "123 rue Audit",
      created_by_reference: $marker,
      texto: false
    }' > /tmp/clinia-staging-patient-audit-create-payload.json

  curl -sS -X POST "$BASE_URL/api/patients" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-patient-audit-create-payload.json \
    > "$response"

  PATIENT_ID="$(jq -r '.data._id // empty' "$response")"
  if [[ -z "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "creating audited patient"
    fail "audited_patient_create_failed"
  fi

  report_ok "creating audited patient"
}

update_audited_patient() {
  local response="/tmp/clinia-staging-patient-audit-update.json"

  jq -n \
    '{
      telephone: "5145559090",
      texto: true,
      secure_request_profile: {
        objective: "Verifier le journal audit sans donnees nominatives",
        clinicalScope: "conformite",
        selected_document_ids: ["doc-audit-drill"],
        privacyAttestation: true
      }
    }' > /tmp/clinia-staging-patient-audit-update-payload.json

  curl -sS -X PATCH "$BASE_URL/api/patients/$PATIENT_ID" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-patient-audit-update-payload.json \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "updating audited patient"
    fail "audited_patient_update_failed"
  fi

  report_ok "updating audited patient"
}

delete_audited_patient() {
  local response="/tmp/clinia-staging-patient-audit-delete.json"

  curl -sS -X DELETE "$BASE_URL/api/patients/$PATIENT_ID" \
    -H "$(auth_header)" \
    > "$response"

  if [[ "$(jq -r '.data._id // empty' "$response")" != "$PATIENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "deleting audited patient"
    fail "audited_patient_delete_failed"
  fi

  report_ok "deleting audited patient"
}

verify_audit_actions() {
  local response="/tmp/clinia-staging-patient-audit-list.json"
  local actions

  curl -sS "$BASE_URL/api/patients/audit-logs?patientId=$PATIENT_ID&limit=20" \
    -H "$(auth_header)" \
    > "$response"

  actions="$(jq -r '.data.logs[]?.action' "$response" | sort | uniq | tr '\n' ' ')"

  if ! grep -q 'PATIENT_CREATE' <<<"$actions" ||
     ! grep -q 'PATIENT_UPDATE' <<<"$actions" ||
     ! grep -q 'PATIENT_DELETE' <<<"$actions"; then
    jq . "$response" || cat "$response"
    report_failed "verifying patient audit actions"
    fail "patient_audit_actions_missing actions=$actions"
  fi

  report_ok "verifying patient audit actions"
}

verify_no_sensitive_values_in_audit_logs() {
  local result

  result="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const logs = dbx.patientauditlogs.find({ patientId: ObjectId(process.env.PATIENT_ID) }).toArray();
      const haystack = JSON.stringify(logs);
      const forbidden = [
        process.env.RAMQ_VALUE,
        process.env.PHONE_VALUE,
        process.env.EMAIL_VALUE,
        process.env.PATIENT_LAST_NAME,
        process.env.PATIENT_FIRST_NAME
      ].filter(Boolean);
      const matches = forbidden.filter((value) => haystack.includes(value));
      print(JSON.stringify({
        logCount: logs.length,
        matches
      }));
    ' mongo_eval_on_service
  )"

  if [[ "$(printf '%s\n' "$result" | jq -r '.logCount')" -lt 3 ]]; then
    printf '%s\n' "$result" | jq .
    report_failed "verifying patient audit log count"
    fail "patient_audit_log_count_too_low"
  fi

  if [[ "$(printf '%s\n' "$result" | jq -r '.matches | length')" != "0" ]]; then
    printf '%s\n' "$result" | jq .
    report_failed "verifying no sensitive values in patient audit logs"
    fail "patient_audit_sensitive_value_found"
  fi

  report_ok "verifying no sensitive values in patient audit logs"
}

verify_cleanup() {
  local remaining

  cleanup_drill_data

  remaining="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const auditCount = process.env.PATIENT_ID
        ? dbx.patientauditlogs.countDocuments({ patientId: ObjectId(process.env.PATIENT_ID) })
        : 0;
      const patientCount = dbx.patients.countDocuments({ created_by_reference: process.env.DRILL_MARKER });
      print(JSON.stringify({ auditCount, patientCount }));
    ' mongo_eval_on_service
  )"

  if [[ "$(printf '%s\n' "$remaining" | jq -r '.auditCount')" != "0" ||
        "$(printf '%s\n' "$remaining" | jq -r '.patientCount')" != "0" ]]; then
    printf '%s\n' "$remaining" | jq .
    report_failed "cleaning patient audit drill data"
    fail "patient_audit_cleanup_failed"
  fi

  report_ok "cleaning patient audit drill data"
}

require_command curl
require_command docker
require_command jq

info "STAGING_PATIENT_AUDIT_LOG_COMPLIANCE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
ensure_staging_user
login
cleanup_drill_data

printf '\nTesting patient audit logs compliance\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
AUDIT_COUNT_BEFORE="$(audit_count)"
printf 'Patient audit log documents before drill: %s\n' "$AUDIT_COUNT_BEFORE"

create_audited_patient
update_audited_patient
delete_audited_patient
verify_audit_actions
verify_no_sensitive_values_in_audit_logs
verify_cleanup

AUDIT_COUNT_AFTER="$(audit_count)"
printf 'Patient audit log documents after drill: %s\n' "$AUDIT_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

if [[ "$AUDIT_COUNT_BEFORE" != "$AUDIT_COUNT_AFTER" ]]; then
  fail "patient_audit_log_count_changed before=$AUDIT_COUNT_BEFORE after=$AUDIT_COUNT_AFTER"
fi

info "STAGING_PATIENT_AUDIT_LOG_COMPLIANCE_DRILL_PASSED marker=$DRILL_MARKER"
