#!/usr/bin/env bash
# Run on the Coolify host. HTTP workflow uses curl; Docker seeds/removes only
# owned synthetic fixtures. Audit history is deliberately retained.
set +x
set -Eeuo pipefail
umask 077
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-https://clinique-ai.ca}"
BASE_URL="${BASE_URL%/}"
[[ "$BASE_URL" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ || "$BASE_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] || { echo 'ERROR invalid BASE_URL'; exit 1; }
for command in docker curl jq mktemp; do command -v "$command" >/dev/null || { echo "ERROR missing $command"; exit 1; }; done
[[ -f "$script_dir/reception-booking-smoke-helper.mjs" ]] || { echo 'ERROR helper missing'; exit 1; }
container="${BACKEND_CONTAINER:-}"
if [[ -z "$container" ]]; then
  mapfile -t containers < <(docker ps --format '{{.Names}}' | awk '/^backend-/ && !/^backend-replica-/')
  [[ ${#containers[@]} == 1 ]] || { echo 'ERROR set BACKEND_CONTAINER to one exact backend name'; exit 1; }
  container="${containers[0]}"
fi
helper() { docker exec -i -w /app "$container" node --input-type=module - "$1" "$run_id" < "$script_dir/reception-booking-smoke-helper.mjs"; }
if [[ "${1:-}" == --cleanup && $# == 2 ]]; then
  run_id="$2"
  helper cleanup
  exit
fi
concurrent=0
if [[ "${1:-}" == --concurrent ]]; then concurrent=1; shift; fi
[[ $# == 0 ]] || { echo 'Usage: bash run-reception-booking-smoke.sh [--concurrent | --cleanup UUID]'; exit 1; }
run_id="$(cat /proc/sys/kernel/random/uuid)"
work="$(mktemp -d /tmp/clinia-booking-smoke.XXXXXXXX)"
printf '%s\n' "$run_id" > "$work/run-id"
printf 'RUN_ID=%s\nRECOVERY_DIR=%s\n' "$run_id" "$work"
started=0
in_flight=0
uncertain=0
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if (( started )); then
    if (( in_flight || uncertain )); then
      helper disable || true
      echo "CLEANUP_UNCONFIRMED run=$run_id: operation outcome unknown; preserve recovery directory."
      echo 'After requests have finished (or the serving backends have been restarted), rerun with --cleanup RUN_ID.'
      status=1
    elif helper cleanup; then
      rm -rf -- "$work"
    else
      echo "CLEANUP_FAILED run=$run_id: preserve recovery directory and rerun --cleanup RUN_ID."
      status=1
    fi
  else
    rm -rf -- "$work"
  fi
  if (( status == 0 )); then
    if (( concurrent )); then echo 'RECEPTION_BOOKING_CONCURRENCY_PASSED'; else echo 'RECEPTION_BOOKING_SMOKE_PASSED'; fi
  else echo 'RECEPTION_BOOKING_SMOKE_FAILED'; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { echo "ERROR $*" >&2; exit 1; }
request() {
  local expected="$1" path="$2"; shift 2
  local status
  in_flight=1
  if ! status="$(curl --silent --show-error --connect-timeout 10 --max-time 90 \
    --output "$work/response.json" --write-out '%{http_code}' \
    --header "Origin: $BASE_URL" "$@" "$BASE_URL$path" 2> "$work/curl-error")"; then
    uncertain=1
    fail "HTTP transport failure; outcome unknown"
  fi
  in_flight=0
  # An upstream timeout/error can arrive while the application still works.
  if [[ "$status" != "$expected" ]]; then
    if [[ "$status" =~ ^5 || "$status" == 000 || "$status" == 408 ]]; then uncertain=1; fi
    fail "HTTP expected=$expected observed=$status"
  fi
  jq -e 'type == "object"' "$work/response.json" >/dev/null || { uncertain=1; fail 'invalid API response'; }
}
request 200 /api/health/ready
jq -e '.data.status == "ok" and .data.dependencies.mongo == "connected"' "$work/response.json" >/dev/null || fail 'readiness'
started=1
in_flight=1
helper seed > "$work/fixture.json" || { uncertain=1; fail 'provisioning outcome unknown'; }
in_flight=0
echo 'FIXTURES_OK synthetic clinic, physician, reception and patient'
jq '{username,password}' "$work/fixture.json" > "$work/login.json"
request 200 /api/auth/login --header 'Content-Type: application/json' --data-binary "@$work/login.json" --cookie-jar "$work/cookies"
jq -er '.data.accessToken | select(type == "string" and length > 20) | "Authorization: Bearer " + .' "$work/response.json" > "$work/auth-header" || fail 'login did not issue access token'
echo 'LOGIN_OK'
jq -jr '"clinic=" + (.clinic | @uri) + "&ramq=" + (.ramq | @uri)' "$work/fixture.json" > "$work/query"
request 200 /api/reception/patient-lookup --header "@$work/auth-header" --get --data-binary "@$work/query"
jq -e --slurpfile fixture "$work/fixture.json" '.data._id == $fixture[0].patientId and (.data.bookingProof | type == "string") and (.data.existingAppointments | length == 0)' "$work/response.json" >/dev/null || fail 'lookup mismatch'
jq --slurpfile lookup "$work/response.json" '{clinic,specialist,patientId,date,time,slotType} + {bookingProof:$lookup[0].data.bookingProof}' "$work/fixture.json" > "$work/booking.json"
echo 'LOOKUP_OK exact synthetic patient'
if (( concurrent )); then
  # Two independent valid lookup proofs: a replay refusal cannot masquerade
  # as the successful concurrency control we intend to exercise.
  request 200 /api/reception/patient-lookup --header "@$work/auth-header" --get --data-binary "@$work/query"
  jq -e --slurpfile fixture "$work/fixture.json" '.data._id == $fixture[0].patientId and (.data.bookingProof | type == "string") and (.data.existingAppointments | length == 0)' "$work/response.json" >/dev/null || fail 'second lookup mismatch'
  jq --slurpfile lookup "$work/response.json" '{clinic,specialist,patientId,date,time,slotType} + {bookingProof:$lookup[0].data.bookingProof}' "$work/fixture.json" > "$work/booking-b.json"
  jq -e --slurpfile other "$work/booking-b.json" '.bookingProof != $other[0].bookingProof' "$work/booking.json" >/dev/null || fail 'lookup proofs must differ'
  echo 'LOOKUP_PROOFS_OK distinct=2'
  post_booking() {
    curl --silent --show-error --connect-timeout 10 --max-time 90 \
      --output "$work/$2.response" --write-out '%{http_code}' \
      --header "Origin: $BASE_URL" --header "@$work/auth-header" \
      --header 'Content-Type: application/json' --data-binary "@$work/$1" \
      "$BASE_URL/api/reception/walk-in-bookings" > "$work/$2.status" 2> "$work/$2.error"
  }
  in_flight=1
  post_booking booking.json a &
  pid_a=$!
  post_booking booking-b.json b &
  pid_b=$!
  transport_a=0
  transport_b=0
  wait "$pid_a" || transport_a=$?
  wait "$pid_b" || transport_b=$?
  in_flight=0
  if (( transport_a || transport_b )); then uncertain=1; fail 'concurrent HTTP transport failure; outcome unknown'; fi
  status_a="$(cat "$work/a.status")"
  status_b="$(cat "$work/b.status")"
  printf 'CONCURRENT_RESPONSES A=%s B=%s\n' "$status_a" "$status_b"
  for status in "$status_a" "$status_b"; do
    if [[ "$status" =~ ^5 || "$status" == 000 || "$status" == 408 ]]; then uncertain=1; fi
  done
  for result in a b; do
    jq -e 'type == "object"' "$work/$result.response" >/dev/null || { uncertain=1; fail 'invalid concurrent API response'; }
  done
  [[ "$status_a$status_b" == 201409 || "$status_a$status_b" == 409201 ]] || fail 'expected concurrent statuses 201 and 409'
  if [[ "$status_a" == 201 ]]; then winner=a; loser=b; else winner=b; loser=a; fi
  jq -e --slurpfile fixture "$work/fixture.json" '.data.patient._id == $fixture[0].patientId and (.data.appointment._id | type == "string")' "$work/$winner.response" >/dev/null || fail 'concurrent booking mismatch'
  # Current reception service serializes on the patient, then rechecks pending
  # bookings. The second request must require an explicit replan.
  jq -e '.error.code == "RECEPTION_REPLAN_REQUIRED"' "$work/$loser.response" >/dev/null || fail 'unexpected concurrent refusal'
  echo 'CONCURRENT_REFUSAL HTTP=409 RECEPTION_REPLAN_REQUIRED'
else
  request 201 /api/reception/walk-in-bookings --header "@$work/auth-header" --header 'Content-Type: application/json' --data-binary "@$work/booking.json"
  jq -e --slurpfile fixture "$work/fixture.json" '.data.patient._id == $fixture[0].patientId and (.data.appointment._id | type == "string")' "$work/response.json" >/dev/null || fail 'booking mismatch'
  echo 'BOOKING_OK HTTP=201'
  request 403 /api/reception/walk-in-bookings --header "@$work/auth-header" --header 'Content-Type: application/json' --data-binary "@$work/booking.json"
  jq -e '.error.code == "RECEPTION_LOOKUP_REQUIRED"' "$work/response.json" >/dev/null || fail 'unexpected replay refusal'
  echo 'REPLAY_REFUSED HTTP=403 RECEPTION_LOOKUP_REQUIRED'
fi
helper verify
request 200 /api/auth/logout --request POST --header "@$work/auth-header" --cookie "$work/cookies"
echo 'LOGOUT_OK'
