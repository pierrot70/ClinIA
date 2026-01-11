#!/usr/bin/env bash
set -euo pipefail

# --------------------------------------------------
# ClinIA — Rebuild local déterministe (anti-Docker)
# --------------------------------------------------

COMPOSE_FILE="docker-compose-local.yml"
PROJECT_NAME="${PROJECT_NAME:-clinia_local}"

# -----------------------------
# Options (via env vars)
# -----------------------------
# WIPE_VOLUMES=1   -> supprime aussi les volumes (mongo_data, node_modules)
# PRUNE=1          -> docker system prune (⚠️ global, dangereux)
# NO_CACHE=1       -> build --no-cache
# PULL=1           -> build --pull
# DETACH=1         -> up -d (défaut)
# NUCLEAR=1        -> équivalent WIPE_VOLUMES + NO_CACHE + PRUNE

WIPE_VOLUMES="${WIPE_VOLUMES:-0}"
PRUNE="${PRUNE:-0}"
NO_CACHE="${NO_CACHE:-0}"
PULL="${PULL:-0}"
DETACH="${DETACH:-1}"
NUCLEAR="${NUCLEAR:-0}"

# -----------------------------
# Helpers
# -----------------------------
dc() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

headline() {
  echo
  echo "=================================================="
  echo "$1"
  echo "=================================================="
}

# -----------------------------
# Mode nucléaire (optionnel)
# -----------------------------
if [[ "$NUCLEAR" == "1" ]]; then
  echo "☢️  MODE NUCLÉAIRE ACTIVÉ"
  WIPE_VOLUMES=1
  NO_CACHE=1
  PRUNE=1
fi

headline "ClinIA local rebuild"

echo "Compose file : $COMPOSE_FILE"
echo "Project name : $PROJECT_NAME"
echo "Options:"
echo "  WIPE_VOLUMES=$WIPE_VOLUMES"
echo "  PRUNE=$PRUNE"
echo "  NO_CACHE=$NO_CACHE"
echo "  PULL=$PULL"
echo "  DETACH=$DETACH"
echo "  NUCLEAR=$NUCLEAR"

# -----------------------------
# 0) Snapshot ENV (anti-illusion)
# -----------------------------
headline "ENV snapshot (ce que Docker VA vraiment voir)"

ENV_KEYS=(
  OPENAI_MODEL
  CLINIA_MOCK_AI
  NODE_ENV
)

for key in "${ENV_KEYS[@]}"; do
  printf "  %-18s = %s\n" "$key" "${!key:-<unset>}"
done

# checksum simple pour détecter les changements fantômes
ENV_CHECKSUM=$(printf "%s=%s\n" \
  "OPENAI_MODEL" "${OPENAI_MODEL:-}" \
  "CLINIA_MOCK_AI" "${CLINIA_MOCK_AI:-}" \
  | sha256sum | cut -d' ' -f1)

echo "  ENV_CHECKSUM        = $ENV_CHECKSUM"

# -----------------------------
# 1) Down
# -----------------------------
headline "Stopping containers"

if [[ "$WIPE_VOLUMES" == "1" ]]; then
  dc down -v --remove-orphans
else
  dc down --remove-orphans
fi

# -----------------------------
# 2) Prune (optionnel)
# -----------------------------
if [[ "$PRUNE" == "1" ]]; then
  headline "Docker system prune (⚠️ global)"
  docker system prune -f
fi

# -----------------------------
# 3) Build
# -----------------------------
headline "Build images"

BUILD_ARGS=()
[[ "$NO_CACHE" == "1" ]] && BUILD_ARGS+=(--no-cache)
[[ "$PULL" == "1" ]] && BUILD_ARGS+=(--pull)

dc build "${BUILD_ARGS[@]}"

# -----------------------------
# 4) Up
# -----------------------------
headline "Starting containers"

if [[ "$DETACH" == "1" ]]; then
  dc up -d
else
  dc up
fi

# -----------------------------
# 5) Status
# -----------------------------
headline "Container status"
dc ps

# -----------------------------
# 6) Post-start sanity checks
# -----------------------------
headline "Post-start sanity checks"

echo "👉 Backend logs (important):"
echo "docker compose -p \"$PROJECT_NAME\" -f \"$COMPOSE_FILE\" logs backend --tail=50"

echo
echo "👉 Test API (mock):"
echo "curl -X POST http://localhost:4000/api/ai/analyze \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"symptoms\":[\"test\"]}'"

echo
echo "👉 Test API (real, si activé):"
echo "curl -X POST http://localhost:4000/api/ai/analyze \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"symptoms\":[\"test\"],\"forceReal\":true}'"

headline "Rebuild terminé"
