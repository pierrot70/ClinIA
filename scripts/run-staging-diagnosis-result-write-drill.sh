#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
VERBOSE="${VERBOSE:-1}"
DRILL_MARKER="clinia-staging-diagnosis-result-write-drill-$(date +%s)-$RANDOM"
DIAGNOSIS_ID=""
DIAGNOSIS_COUNT_BEFORE=""
DIAGNOSIS_COUNT_AFTER=""

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

mongo_eval_on_service() {
  local service
  service="$(mongo_exec_service)" || fail "mongo_exec_service_not_found"

  dc exec -T \
    -e MONGO_EVAL="$MONGO_EVAL" \
    -e DRILL_MARKER="$DRILL_MARKER" \
    -e DIAGNOSIS_ID="$DIAGNOSIS_ID" \
    "$service" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$MONGO_EVAL"'
}

diagnosis_count() {
  MONGO_EVAL='db.getSiblingDB("clinia").diagnosisresults.countDocuments({})' \
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
    const marker = /^clinia-staging-diagnosis-result-write-drill-/;
    dbx.diagnosisresults.deleteMany({
      $or: [
        { fingerprint: marker },
        { "input.drillMarker": marker },
        { "output.drillMarker": marker }
      ]
    });
  ' mongo_eval_on_service >/dev/null 2>&1 || true
}

trap cleanup_drill_data EXIT

create_diagnosis_result() {
  local response

  info "diagnosis_result_create marker=$DRILL_MARKER"

  response="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const marker = process.env.DRILL_MARKER;
      const now = new Date();
      const doc = {
        fingerprint: marker,
        input: {
          drillMarker: marker,
          diagnosis: "Diagnostic drill local",
          symptoms: ["test-resilience"]
        },
        output: {
          drillMarker: marker,
          hypotheseClinique: "Hypothese de test",
          optionsTherapeutiques: ["Option de test"],
          justificationScientifique: "Justification de test",
          contreIndications: [],
          resumeClinique: "Resume de test",
          drillStep: "created"
        },
        mode: "mock",
        model: "staging-drill",
        history: [],
        createdAt: now,
        updatedAt: now
      };
      const result = dbx.diagnosisresults.insertOne(doc, { writeConcern: { w: "majority", j: true } });
      print(JSON.stringify({ id: result.insertedId.toString() }));
    ' DRILL_MARKER="$DRILL_MARKER" mongo_eval_on_service
  )"

  DIAGNOSIS_ID="$(printf '%s\n' "$response" | jq -r '.id // empty')"
  if [[ -z "$DIAGNOSIS_ID" ]]; then
    printf '%s\n' "$response"
    report_failed "creating diagnosis result"
    fail "diagnosis_result_create_failed"
  fi

  report_ok "creating diagnosis result"
}

read_diagnosis_result() {
  local read_id

  read_id="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const doc = dbx.diagnosisresults.findOne({ _id: ObjectId(process.env.DIAGNOSIS_ID) });
      print(doc ? doc._id.toString() : "");
    ' DIAGNOSIS_ID="$DIAGNOSIS_ID" mongo_eval_on_service
  )"

  if [[ "$read_id" != "$DIAGNOSIS_ID" ]]; then
    report_failed "reading diagnosis result"
    fail "diagnosis_result_read_failed"
  fi

  report_ok "reading diagnosis result"
}

update_diagnosis_result() {
  local modified_count
  local drill_step

  modified_count="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const result = dbx.diagnosisresults.updateOne(
        { _id: ObjectId(process.env.DIAGNOSIS_ID) },
        {
          $set: {
            "output.drillStep": "updated",
            updatedAt: new Date()
          }
        },
        { writeConcern: { w: "majority", j: true } }
      );
      print(result.modifiedCount);
    ' DIAGNOSIS_ID="$DIAGNOSIS_ID" mongo_eval_on_service
  )"

  drill_step="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const doc = dbx.diagnosisresults.findOne({ _id: ObjectId(process.env.DIAGNOSIS_ID) });
      print(doc?.output?.drillStep || "");
    ' DIAGNOSIS_ID="$DIAGNOSIS_ID" mongo_eval_on_service
  )"

  if [[ "$modified_count" != "1" || "$drill_step" != "updated" ]]; then
    report_failed "updating diagnosis result"
    fail "diagnosis_result_update_failed modified=$modified_count drill_step=$drill_step"
  fi

  report_ok "updating diagnosis result"
}

delete_diagnosis_result() {
  local deleted_count
  local remaining

  deleted_count="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      const result = dbx.diagnosisresults.deleteOne(
        { _id: ObjectId(process.env.DIAGNOSIS_ID) },
        { writeConcern: { w: "majority", j: true } }
      );
      print(result.deletedCount);
    ' DIAGNOSIS_ID="$DIAGNOSIS_ID" mongo_eval_on_service
  )"

  remaining="$(
    MONGO_EVAL='
      const dbx = db.getSiblingDB("clinia");
      print(dbx.diagnosisresults.countDocuments({ _id: ObjectId(process.env.DIAGNOSIS_ID) }));
    ' DIAGNOSIS_ID="$DIAGNOSIS_ID" mongo_eval_on_service
  )"

  if [[ "$deleted_count" != "1" || "$remaining" != "0" ]]; then
    report_failed "deleting diagnosis result"
    fail "diagnosis_result_delete_failed deleted=$deleted_count remaining=$remaining"
  fi

  report_ok "deleting diagnosis result"
}

require_command docker
require_command jq

info "STAGING_DIAGNOSIS_RESULT_WRITE_DRILL_STARTED marker=$DRILL_MARKER"
cleanup_drill_data

printf '\nTesting diagnosis results collection\n'
printf 'Mongo replica set before drill: %s\n' "$(mongo_replica_summary)"
DIAGNOSIS_COUNT_BEFORE="$(diagnosis_count)"
printf 'Diagnosis result documents before drill: %s\n' "$DIAGNOSIS_COUNT_BEFORE"

create_diagnosis_result
read_diagnosis_result
update_diagnosis_result
delete_diagnosis_result
cleanup_drill_data

DIAGNOSIS_COUNT_AFTER="$(diagnosis_count)"
printf 'Diagnosis result documents after drill: %s\n' "$DIAGNOSIS_COUNT_AFTER"
printf 'Mongo replica set after drill: %s\n' "$(mongo_replica_summary)"

if [[ "$DIAGNOSIS_COUNT_BEFORE" != "$DIAGNOSIS_COUNT_AFTER" ]]; then
  fail "diagnosis_result_count_changed before=$DIAGNOSIS_COUNT_BEFORE after=$DIAGNOSIS_COUNT_AFTER"
fi

info "STAGING_DIAGNOSIS_RESULT_WRITE_DRILL_PASSED marker=$DRILL_MARKER"
