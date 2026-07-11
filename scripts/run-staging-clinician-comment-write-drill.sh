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
DRILL_MARKER="clinia-staging-clinician-comment-write-drill-$(date +%s)-$RANDOM"
TRACKING_CODE=""
COMMENT_ID=""
TOKEN=""
COMMENT_COUNT_BEFORE=""
COMMENT_COUNT_AFTER=""

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

  dc exec -T \
    -e MONGO_EVAL="$MONGO_EVAL" \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e COMMENT_ID="$COMMENT_ID" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

comment_count() {
  MONGO_EVAL='db.getSiblingDB("clinia").cliniciancomments.countDocuments({})' \
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
    const marker = /^clinia-staging-clinician-comment-write-drill-/;
    dbx.cliniciancomments.deleteMany({
      $or: [
        { actorUsername: marker },
        { comment: marker },
        { "replies.message": marker }
      ]
    });
    dbx.ratelimitwindows.deleteMany({ limiterKey: "clinician_comments" });
  ' mongo_eval_on_service >/dev/null 2>&1 || true
}

clear_comment_rate_limit() {
  MONGO_EVAL='db.getSiblingDB("clinia").ratelimitwindows.deleteMany({ limiterKey: "clinician_comments" })' \
    mongo_eval_on_service >/dev/null 2>&1 || true
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
  local response="/tmp/clinia-staging-comment-login.json"

  jq -n \
    --arg email "$STAGING_EMAIL" \
    --arg password "$STAGING_PASSWORD" \
    '{ email: $email, password: $password }' > /tmp/clinia-staging-comment-login-payload.json

  curl -sS -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-comment-login-payload.json \
    > "$response"

  TOKEN="$(jq -r '.data.accessToken // empty' "$response")"
  [[ -n "$TOKEN" ]] || {
    jq . "$response" || cat "$response"
    fail "login_failed"
  }
}

tracking_code() {
  printf 'D%07d' "$((RANDOM * RANDOM % 10000000))"
}

create_comment() {
  local response="/tmp/clinia-staging-comment-create.json"

  TRACKING_CODE="$(tracking_code)"
  clear_comment_rate_limit

  jq -n \
    --arg marker "$DRILL_MARKER" \
    --arg trackingCode "$TRACKING_CODE" \
    '{
      guestDisplayName: $marker,
      trackingCode: $trackingCode,
      category: "BUG",
      comment: $marker
    }' > /tmp/clinia-staging-comment-create-payload.json

  curl -sS -X POST "$BASE_URL/api/clinician-comments" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-comment-create-payload.json \
    > "$response"

  COMMENT_ID="$(jq -r '.data.id // empty' "$response")"
  if [[ -z "$COMMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "creating clinician comment"
    fail "clinician_comment_create_failed"
  fi

  report_ok "creating clinician comment"
}

read_comment() {
  local response="/tmp/clinia-staging-comment-read.json"
  local found_id

  curl -sS "$BASE_URL/api/clinician-comments?scope=all&limit=20&actorUsername=$DRILL_MARKER" \
    -H "$(auth_header)" \
    > "$response"

  found_id="$(jq -r --arg id "$COMMENT_ID" '.data.items[]? | select(.id == $id) | .id' "$response" | head -n1)"
  if [[ "$found_id" != "$COMMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "reading clinician comment"
    fail "clinician_comment_read_failed"
  fi

  report_ok "reading clinician comment"
}

reply_comment() {
  local response="/tmp/clinia-staging-comment-reply.json"
  local reply_count

  jq -n \
    '{ message: "Reponse de test ClinIA" }' > /tmp/clinia-staging-comment-reply-payload.json

  curl -sS -X POST "$BASE_URL/api/clinician-comments/$COMMENT_ID/reply" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/clinia-staging-comment-reply-payload.json \
    > "$response"

  reply_count="$(jq -r '.data.replies | length' "$response")"
  if [[ "$reply_count" -lt 1 ]]; then
    jq . "$response" || cat "$response"
    report_failed "replying clinician comment"
    fail "clinician_comment_reply_failed"
  fi

  report_ok "replying clinician comment"
}

lookup_replies() {
  local response="/tmp/clinia-staging-comment-lookup.json"
  local found_id

  curl -sS "$BASE_URL/api/clinician-comments/lookup-replies?actorUsername=$DRILL_MARKER&trackingCode=$TRACKING_CODE" \
    > "$response"

  found_id="$(jq -r --arg id "$COMMENT_ID" '.data.items[]? | select(.id == $id) | .id' "$response" | head -n1)"
  if [[ "$found_id" != "$COMMENT_ID" ]]; then
    jq . "$response" || cat "$response"
    report_failed "looking up clinician comment replies"
    fail "clinician_comment_lookup_failed"
  fi

  report_ok "looking up clinician comment replies"
}

delete_comment() {
  local deleted_count
  local remaining

  deleted_count="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const result = dbx.cliniciancomments.deleteOne(
        { _id: ObjectId(process.env.COMMENT_ID) },
        { writeConcern: { w: "majority", j: true } }
      );
      print(result.deletedCount);
    ' COMMENT_ID="$COMMENT_ID" mongo_eval_on_service
  )"

  remaining="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      print(dbx.cliniciancomments.countDocuments({ _id: ObjectId(process.env.COMMENT_ID) }));
    ' COMMENT_ID="$COMMENT_ID" mongo_eval_on_service
  )"

  if [[ "$deleted_count" != "1" || "$remaining" != "0" ]]; then
    report_failed "deleting clinician comment"
    fail "clinician_comment_delete_failed deleted=$deleted_count remaining=$remaining"
  fi

  report_ok "deleting clinician comment"
}

require_command curl
require_command docker
require_command jq

info "STAGING_CLINICIAN_COMMENT_WRITE_DRILL_STARTED base_url=$BASE_URL marker=$DRILL_MARKER"
wait_for_backend
ensure_staging_user
login
cleanup_drill_data

printf '\nTesting clinician comments collection\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
COMMENT_COUNT_BEFORE="$(comment_count)"
printf 'Clinician comment documents before drill: %s\n' "$COMMENT_COUNT_BEFORE"

create_comment
read_comment
reply_comment
lookup_replies
delete_comment
cleanup_drill_data

COMMENT_COUNT_AFTER="$(comment_count)"
printf 'Clinician comment documents after drill: %s\n' "$COMMENT_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

if [[ "$COMMENT_COUNT_BEFORE" != "$COMMENT_COUNT_AFTER" ]]; then
  fail "clinician_comment_count_changed before=$COMMENT_COUNT_BEFORE after=$COMMENT_COUNT_AFTER"
fi

info "STAGING_CLINICIAN_COMMENT_WRITE_DRILL_PASSED marker=$DRILL_MARKER"
