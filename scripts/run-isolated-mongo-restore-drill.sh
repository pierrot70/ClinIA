#!/usr/bin/env bash
# Local Docker only. Does not load .env, accept a Mongo URI or inspect production.
set +x
set -Eeuo pipefail
umask 077
[[ $# == 2 ]] || { echo 'Usage: bash run-isolated-mongo-restore-drill.sh ARCHIVE.gz.age AGE_IDENTITY_FILE'; exit 1; }
archive="$1"
identity="$2"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for cmd in docker age python3 stat mktemp cat sleep date; do
    command -v "$cmd" >/dev/null || { echo "ERROR missing $cmd"; exit 1; }
done
[[ "$archive" == *.archive.gz.age && -f "$archive" && -f "$archive.sha256" ]] || { echo 'ERROR encrypted archive or checksum missing'; exit 1; }
[[ -f "$identity" && "$(stat -c '%a' "$identity")" == 600 ]] || { echo 'ERROR identity missing or permissions not 600'; exit 1; }
[[ -f "$script_dir/validate-isolated-mongo-restore.js" ]] || { echo 'ERROR validation helper missing'; exit 1; }
endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$endpoint" == unix://* && -z "${DOCKER_CONTEXT:-}" ]] || { echo 'ERROR local Docker Unix socket required; unset DOCKER_CONTEXT'; exit 1; }
python3 - "$archive" <<'PY'
import hashlib, pathlib, re, sys
p = pathlib.Path(sys.argv[1])
expected = pathlib.Path(str(p) + '.sha256').read_text().split()[0]
if not re.fullmatch('[a-fA-F0-9]{64}', expected):
    raise SystemExit('ERROR invalid_checksum')
with p.open('rb') as f:
    actual = hashlib.file_digest(f, 'sha256').hexdigest()
if actual != expected.lower():
    raise SystemExit('ERROR checksum_mismatch')
print('SHA256_OK')
PY
run_id="$(cat /proc/sys/kernel/random/uuid)"
container_name="clinia-restore-$run_id"
evidence_dir="$(mktemp -d "$(dirname -- "$archive")/restore-evidence.XXXXXXXX")"
echo "EVIDENCE_DIR=$evidence_dir"
container_id=''
passed=0
cleanup() {
    local result=$?
    trap - EXIT INT TERM HUP
    if [[ -n "$container_id" && "$passed" == 0 ]]; then
        if [[ "$(docker inspect --format '{{index .Config.Labels "clinia.restore.run"}}' "$container_id" 2>/dev/null)" == "$run_id" ]]; then
            if docker rm --force --volumes "$container_id" >/dev/null; then
                echo 'FAILED_DRILL_CLEANUP_OK'
            else
                echo 'FAILED_DRILL_CLEANUP_FAILED'
                result=1
            fi
        else
            echo 'ERROR cleanup_ownership_unconfirmed'
            result=1
        fi
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
docker image inspect mongo:7 >/dev/null 2>&1 || docker pull mongo:7
container_id="$(docker run --detach --pull=never --name "$container_name" \
    --label "clinia.restore.run=$run_id" --network none \
    --memory 1g --tmpfs /data/db:rw,size=768m --tmpfs /data/configdb:rw,size=32m \
    mongo:7 mongod --replSet restore_test --bind_ip 127.0.0.1 \
    --setParameter ttlMonitorEnabled=false)"
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container_id")" == none ]] || exit 1
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id")" == '{}' || \
   "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id")" == null ]] || exit 1
# Confirm completion through a status file, independently of exec output.
# No step may pass because Docker returned an empty or early stdout stream.
wait_for_status() {
    local remote="$1" observed="$evidence_dir/step-status" code
    for attempt in {1..180}; do
        if docker cp "$container_id:$remote" "$observed" >/dev/null 2>&1 && [[ -s "$observed" ]]; then
            code="$(cat "$observed")"
            [[ "$code" =~ ^[0-9]{1,3}$ ]] || return 1
            return "$code"
        fi
        sleep 1
    done
    echo 'ERROR isolated command completion not confirmed'
    return 1
}
docker exec -i "$container_id" sh -c '
  (
    ready=0
    for attempt in $(seq 1 60); do
      if mongosh --quiet --eval "quit(db.adminCommand({ping:1}).ok ? 0 : 1)" >/dev/null 2>&1; then ready=1; break; fi
      sleep 1
    done
    [ "$ready" = 1 ] || exit 1
    mongosh --quiet --eval "rs.initiate({_id:\"restore_test\",members:[{_id:0,host:\"localhost:27017\"}]})" >/tmp/replica-init.log 2>&1 || exit 1
    ready=0
    for attempt in $(seq 1 60); do
      if mongosh --quiet --eval "quit(db.hello().isWritablePrimary ? 0 : 1)" >/dev/null 2>&1; then ready=1; break; fi
      sleep 1
    done
    [ "$ready" = 1 ]
  )
  status=$?
  printf "%s\n" "$status" >/tmp/clinia-init.status
  exit "$status"
' >"$evidence_dir/init-exec.log" 2>&1 || true
wait_for_status /tmp/clinia-init.status || { echo 'ERROR isolated replica initialization failed'; exit 1; }
docker cp "$container_id:/tmp/replica-init.log" "$evidence_dir/replica-init.log" >/dev/null
echo 'ISOLATION_OK network=none published_ports=0 fresh_tmpfs=1 ttl_monitor=disabled'
echo 'RESTORE_STARTED encrypted_stream_to_isolated_mongo'
if ! age --decrypt --identity "$identity" "$archive" \
    2>"$evidence_dir/decryption.log" \
    | docker exec -i "$container_id" sh -c '
        mongorestore --host 127.0.0.1 --archive --gzip --stopOnError \
          --nsInclude="clinia.*" --nsFrom="clinia.*" --nsTo="clinia_restore_test.*" \
          >/tmp/clinia-restore.log 2>&1
        status=$?
        printf "%s\n" "$status" >/tmp/clinia-restore.status
        exit "$status"
      ' >"$evidence_dir/restore-exec.log" 2>&1; then
    echo 'ERROR restore stream failed; private logs retained in evidence directory'
    exit 1
fi
wait_for_status /tmp/clinia-restore.status || { echo 'ERROR restore command failed'; exit 1; }
docker cp "$container_id:/tmp/clinia-restore.log" "$evidence_dir/restore.log" >/dev/null
echo 'RESTORE_COMMAND_OK'
# Materialize the report before copying it and keep stdin attached on exec.
# Empty output must never pass validation.
docker cp "$script_dir/validate-isolated-mongo-restore.js" "$container_id:/tmp/clinia-restore-validation.js" >/dev/null
docker exec -i "$container_id" sh -c '
    mongosh --quiet --file /tmp/clinia-restore-validation.js \
      >/tmp/clinia-restore-metadata.json 2>/tmp/clinia-restore-validation.log
    status=$?
    printf "%s\n" "$status" >/tmp/clinia-validation.status
    exit "$status"
' >"$evidence_dir/validation-exec.log" 2>&1 || true
if ! wait_for_status /tmp/clinia-validation.status; then
    echo 'ERROR restored collections or critical indexes invalid'
    exit 1
fi
docker cp "$container_id:/tmp/clinia-restore-metadata.json" "$evidence_dir/restored-metadata.json" >/dev/null
docker cp "$container_id:/tmp/clinia-restore-validation.log" "$evidence_dir/validation.log" >/dev/null
python3 - "$evidence_dir/restored-metadata.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if d['status'] != 'OK' or len(d['criticalIndexes']) != 3:
    raise SystemExit('ERROR validation_incomplete')
print('COLLECTIONS_VALID_OK count=' + str(d['collectionCount']))
print('CRITICAL_INDEXES_OK count=3')
print('MONGO_VERSION=' + d['mongoVersion'])
PY
docker inspect --format '{{.Image}}' "$container_id" >"$evidence_dir/mongo-image-id"
printf '%s\n' "$container_id" >"$evidence_dir/container-id"
passed=1
echo "RESTORE_CONTAINER=$container_name"
echo 'ISOLATED_RESTORE_PASSED application_not_started container_retained_for_rebuild'
