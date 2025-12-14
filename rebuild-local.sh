#!/usr/bin/env bash
set -euo pipefail

# --------------------------------------------
# ClinIA - Rebuild complet (local)
# --------------------------------------------
COMPOSE_FILE="docker-compose-local.yml"
PROJECT_NAME="${PROJECT_NAME:-clinia_local}"

# Options (via env vars):
#   WIPE_VOLUMES=1        -> supprime aussi les volumes (mongo_data, node_modules)
#   PRUNE=1               -> docker system prune (dangereux si tu partages le host)
#   NO_CACHE=1            -> build --no-cache
#   PULL=1                -> build --pull
#   DETACH=1              -> up -d (par défaut: 1)

WIPE_VOLUMES="${WIPE_VOLUMES:-0}"
PRUNE="${PRUNE:-0}"
NO_CACHE="${NO_CACHE:-0}"
PULL="${PULL:-0}"
DETACH="${DETACH:-1}"

dc() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

echo "==> ClinIA local rebuild"
echo "    compose file : $COMPOSE_FILE"
echo "    project name : $PROJECT_NAME"
echo "    WIPE_VOLUMES=$WIPE_VOLUMES  PRUNE=$PRUNE  NO_CACHE=$NO_CACHE  PULL=$PULL  DETACH=$DETACH"
echo

# 1) Stop + remove containers/networks (sans volumes par défaut)
echo "==> Down (containers/networks)..."
if [[ "$WIPE_VOLUMES" == "1" ]]; then
  dc down -v --remove-orphans
else
  dc down --remove-orphans
fi

# 2) Optionnel: prune (à utiliser avec prudence)
if [[ "$PRUNE" == "1" ]]; then
  echo "==> Docker system prune (images/containers/networks non utilisés)..."
  docker system prune -f
fi

# 3) Build options
BUILD_ARGS=()
if [[ "$NO_CACHE" == "1" ]]; then BUILD_ARGS+=(--no-cache); fi
if [[ "$PULL" == "1" ]]; then BUILD_ARGS+=(--pull); fi

echo "==> Build..."
dc build "${BUILD_ARGS[@]}"

# 4) Up
echo "==> Up..."
if [[ "$DETACH" == "1" ]]; then
  dc up -d
else
  dc up
fi

# 5) Status + health-ish info
echo
echo "==> Status:"
dc ps

echo
echo "==> Logs (hint):"
echo "    docker compose -p \"$PROJECT_NAME\" -f \"$COMPOSE_FILE\" logs -f --tail=200"
