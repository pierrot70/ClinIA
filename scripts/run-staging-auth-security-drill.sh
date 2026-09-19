#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $# == 0 ]] || { echo 'Usage: bash scripts/run-staging-auth-security-drill.sh'; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container=clinia_mongo_rs-backend-1
endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$endpoint" == unix://* ]] || { echo 'Docker local uniquement.'; exit 1; }
[[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == clinia_mongo_rs ]] || exit 1
echo 'Drill auth isole : routes reelles, Mongo staging, collections synthetiques temporaires.'
# Feed both reviewed sources without replacing files in the running container.
# A data URL keeps the helper exports current even before a staging rebuild.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const directory = process.argv[1] + "/backend/scripts/";
const helper = "data:text/javascript;base64," + readFileSync(directory + "reception-auth-load.mjs").toString("base64");
const source = readFileSync(directory + "auth-security-drill.mjs", "utf8");
const target = "./reception-auth-load.mjs";
if (source.split(target).length !== 2) throw new Error("Expected exactly one helper import");
process.stdout.write(source.replace(target, helper));
' "$root" | docker exec -i -w /app/scripts -e CLINIA_AUTH_LOAD_TEST=0 -e CLINIA_AUTH_SECURITY_DRILL=1 "$container" node --input-type=module
