#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose-ha-local.yml"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_ha}"
BASE_URL="${BASE_URL:-http://localhost:4001}"
CF_TEST_IP="${CF_TEST_IP:-203.0.113.$((RANDOM % 200 + 20))}"

echo "Instances jointes par le repartiteur:"
instances=""
for _ in {1..6}; do
  instance="$(
    curl -fsS -D - -o /dev/null "$BASE_URL/api/health/ready" |
      awk 'BEGIN { IGNORECASE=1 } /^x-clinia-instance:/ { gsub("\r", ""); print $2 }'
  )"
  echo "  $instance"
  instances+="$instance "
done

grep -q "local-ha-a" <<<"$instances"
grep -q "local-ha-b" <<<"$instances"

echo
echo "Limiteur de rafraichissement partage entre les instances:"
for i in {1..31}; do
  status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -X POST "$BASE_URL/api/auth/refresh" \
      -H "CF-Connecting-IP: $CF_TEST_IP" \
      -H "X-Forwarded-For: 172.16.1.$i" \
      -H "Content-Type: application/json" \
      -d '{"refreshToken":"invalid-test-token"}'
  )"
  echo "  Refresh HA$i=$status"

  if ((i <= 30)); then
    test "$status" = "400"
  else
    test "$status" = "429"
  fi
done

echo
echo "Basculement apres l'arret de local-ha-a:"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" stop backend-a >/dev/null
trap 'docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" start backend-a >/dev/null' EXIT
sleep 2

for _ in {1..4}; do
  instance="$(
    curl -fsS -D - -o /dev/null "$BASE_URL/api/health/ready" |
      awk 'BEGIN { IGNORECASE=1 } /^x-clinia-instance:/ { gsub("\r", ""); print $2 }'
  )"
  echo "  $instance"
  test "$instance" = "local-ha-b"
done

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" start backend-a >/dev/null
trap - EXIT

echo
echo "Test HA local reussi."
