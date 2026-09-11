#!/usr/bin/env bash
# Disposable local MongoDB only. Never loads .env or connects to an application DB.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "${NODE_ENV:-}" != production ]] || { echo 'Refusing production mode.' >&2; exit 1; }
endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$endpoint" == unix://* ]] || { echo 'A local Docker Unix socket is required.' >&2; exit 1; }
docker image inspect mongo:7 >/dev/null
run_id="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
container_name="clinia-walkin-test-$run_id"
container_id=""
cleanup() {
    result=$?
    trap - EXIT
    if [[ -n "$container_id" ]]; then
        label="$(docker inspect --format '{{index .Config.Labels "clinia.test.run"}}' "$container_id")" || exit 1
        [[ "$label" == "$run_id" ]] || { echo 'Cleanup target ownership mismatch.' >&2; exit 1; }
        docker rm --force --volumes "$container_id" >/dev/null || exit 1
        echo 'CLEANUP_OK disposable MongoDB container removed (no persistent data volume).'
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
container_id="$(docker run --detach --pull=never --name "$container_name" \
    --label "clinia.test.run=$run_id" --tmpfs /data/db --tmpfs /data/configdb \
    --publish 127.0.0.1::27017 mongo:7 mongod --replSet walkin_test --bind_ip_all)"
ready=false
for attempt in {1..60}; do
    if docker exec "$container_id" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
done
[[ "$ready" == true ]] || { echo 'Temporary MongoDB did not start.' >&2; exit 1; }
docker exec "$container_id" mongosh --quiet --eval 'rs.initiate({_id:"walkin_test",members:[{_id:0,host:"localhost:27017"}]})' >/dev/null
ready=false
for attempt in {1..60}; do
    if docker exec "$container_id" mongosh --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
done
[[ "$ready" == true ]] || { echo 'Temporary replica set is not writable.' >&2; exit 1; }
binding="$(docker port "$container_id" 27017/tcp)"
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Unexpected MongoDB port binding.' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
cd "$ROOT_DIR/backend"
TZ=America/Toronto NODE_ENV=test \
    CLINIA_WALKIN_TEST_URI="mongodb://127.0.0.1:$port/clinia_walkin_integration?directConnection=true&replicaSet=walkin_test" \
    ./node_modules/.bin/vitest run --config vitest.walkin.config.js "$@"
