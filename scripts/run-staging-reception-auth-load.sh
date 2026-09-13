#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $# == 0 || ( $# == 1 && "$1" == --five-minutes ) ]] || { echo 'Usage: bash scripts/run-staging-reception-auth-load.sh [--five-minutes]'; exit 1; }
container=clinia_mongo_rs-backend-1
endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$endpoint" == unix://* ]] || { echo 'Docker local uniquement.'; exit 1; }
[[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == clinia_mongo_rs ]] || exit 1
if [[ $# == 1 ]]; then
    echo 'Test isole : 10 RECEPTION, 300 secondes, quota 1000000 uniquement dans ce processus.'
else
    echo 'Test staging : 10 RECEPTION, 120 secondes, vraies routes auth et limites conservees.'
fi
echo 'Collections temporaires isolees dans staging ; aucune donnee des comptes existants ne sera effacee.'
exec docker exec -i -e CLINIA_AUTH_LOAD_TEST=1 "$container" node /app/scripts/reception-auth-load.mjs --run "$@"
