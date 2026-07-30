#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose-mongo-rs-local.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
  exec -T backend node /app/scripts/migrations/auditMongoIndexes.js
