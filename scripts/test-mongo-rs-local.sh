#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose-mongo-rs-local.yml"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"
BASE_URL="${BASE_URL:-http://localhost:4002}"
TEST_MARKER="mongo-rs-failover-$(date +%s)-$RANDOM"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

primary="$(
  dc exec -T mongo-rs-1 sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.hello().primary"'
)"

primary_service="${primary%%:*}"
echo "Primary before failure: $primary_service"

curl -fsS "$BASE_URL/api/health/ready" >/dev/null
echo "Backend ready before failure"

dc exec -T -e TEST_MARKER="$TEST_MARKER" mongo-rs-1 sh -c 'mongosh --quiet \
  --username "$CLINIA_RS_ROOT_USERNAME" \
  --password="$CLINIA_RS_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval "db.getSiblingDB(\"clinia\").hafailovertests.insertOne(
    { marker: process.env.TEST_MARKER, createdAt: new Date() },
    { writeConcern: { w: \"majority\" } }
  )"' >/dev/null
echo "Majority write confirmed before failure"

dc stop "$primary_service" >/dev/null
trap 'dc start "$primary_service" >/dev/null' EXIT

echo "Waiting for a new primary..."
new_primary=""
for _ in {1..30}; do
  for candidate in mongo-rs-1 mongo-rs-2 mongo-rs-3; do
    if [ "$candidate" = "$primary_service" ]; then
      continue
    fi

    new_primary="$(
      dc exec -T "$candidate" sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.hello().primary"' 2>/dev/null || true
    )"

    if [ -n "$new_primary" ] && [ "${new_primary%%:*}" != "$primary_service" ]; then
      break 2
    fi
  done
  sleep 2
done

test -n "$new_primary"
echo "Primary after failure: ${new_primary%%:*}"

replicated_count="$(
  dc exec -T -e TEST_MARKER="$TEST_MARKER" "${new_primary%%:*}" sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.getSiblingDB(\"clinia\").hafailovertests.countDocuments({
      marker: process.env.TEST_MARKER
    })"'
)"
test "$replicated_count" = "1"
echo "Majority write found on new primary"

for _ in {1..6}; do
  curl -fsS "$BASE_URL/api/health/ready" >/dev/null
done
echo "Backend stayed ready after Mongo failover"

dc start "$primary_service" >/dev/null
trap - EXIT

echo "Mongo replica set failover test succeeded."
