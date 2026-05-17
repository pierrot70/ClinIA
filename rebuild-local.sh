#!/usr/bin/env bash

headline() {
  echo
  echo "=================================================="
  echo "$1"
  echo "=================================================="
}

# -----------------------------
# Scan sécurité Loi 25/PIPEDA : fuite de données identifiables
# -----------------------------
headline "Scan sécurité Loi 25/PIPEDA : fuite de données identifiables (nom, prénom, RAMQ, téléphone, email, adresse, date de naissance)"
PATTERNS='nom|prénom|ramq|téléphone|email|adresse|date de naissance'
# Scan sécurité Loi 25/PIPEDA : fuite de données identifiables dans les logs/réponses API
# -----------------------------
headline "Scan sécurité Loi 25/PIPEDA : logs/réponses API (nom, prénom, RAMQ, téléphone, email, adresse, date de naissance)"
PATTERNS='nom|prénom|ramq|téléphone|email|adresse|date de naissance'
LOG_API_PATTERNS='console\.log|logger|res\.json|res\.send|res\.status|throw|Error'
if grep -iErn "$LOG_API_PATTERNS" backend/ frontend/ | grep -iE "$PATTERNS" | grep -vE 'Patient|Clinique|Specialist|DTO|type|interface|mock|test|fixture|example|README|.md|.json|.d.ts|.test.ts|.test.js|.spec.ts|.spec.js|.snap|.yml|.yaml|.env|.gitignore|node_modules|dist|build|coverage|\.next|\.cache|\.vscode|\.idea|\.DS_Store|package-lock.json|yarn.lock|pnpm-lock.yaml|LICENSE|CHANGELOG|Dockerfile|docker-compose|vite.config|tailwind.config|postcss.config|tsconfig|\.iml|\.log|\.svg|\.png|\.jpg|\.jpeg|\.webp|\.ico|\.pdf|\.docx|\.xlsx|\.csv|\.zip|\.tar|\.gz|\.tgz|\.bak|\.old|\.orig|\.swp|\.swo|\.tmp|\.bak|\.old|\.orig|\.swp|\.swo|\.tmp' > .security_scan_tmp; then
  echo "❌ Fuite potentielle de données identifiables détectée dans les logs ou réponses API :"
  cat .security_scan_tmp
  rm -f .security_scan_tmp
  exit 1
else
  echo "✅ Aucun pattern de fuite de données identifiables détecté dans les logs ou réponses API."
  rm -f .security_scan_tmp
fi
set -euo pipefail

# --------------------------------------------------
# ClinIA — Rebuild local déterministe (anti-Docker)
# --------------------------------------------------

COMPOSE_FILE="docker-compose-local.yml"
PROJECT_NAME="${PROJECT_NAME:-clinia_local}"
MODE="${MODE:-${1:-}}"

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

# -----------------------------
# 0) Build/type-check frontend (strict)
# -----------------------------
headline "Vérification stricte du frontend (build/type-check)"
pushd frontend > /dev/null

echo "> npm ci --prefer-offline"
npm ci --prefer-offline




# Correction automatique des permissions sur dist/ avant suppression (évite les erreurs de permission)
if [ -d dist ]; then
  echo "> Correction des permissions sur dist/ (chown $USER)"
  chown -R "$USER:$USER" dist 2>/dev/null || true
  echo "> Suppression du dossier dist/ (clean build)"
  rm -rf dist || {
    echo "> Échec de rm -rf dist, tentative avec sudo..."
    sudo rm -rf dist || {
      echo "❌ Impossible de supprimer dist/ même avec sudo. Abandon."
      exit 1
    }
  }
fi

echo "> npx tsc --noEmit"
npx tsc --noEmit

echo "> node ../scripts/verify-ui-labels.mjs"
node ../scripts/verify-ui-labels.mjs

echo "> npx vitest run src/i18n/uiLabels.test.ts src/hooks/useTranslation.test.tsx src/components/admin/AuthLogsModal.test.tsx"
npx vitest run src/i18n/uiLabels.test.ts src/hooks/useTranslation.test.tsx src/components/admin/AuthLogsModal.test.tsx

echo "> npm run build"
npm run build

# Test E2E basique : vérifier <div id=\"root\">
if ! grep -q '<div id="root">' dist/index.html; then
  echo "❌ Erreur critique : <div id=\"root\"> absent de dist/index.html (build corrompu ou crash JS)"
  exit 1
fi

popd > /dev/null

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

if [[ "${MODE^^}" == "PROD" ]]; then
  export NODE_ENV="production"
  export VITE_APP_ENV="production"
elif [[ "${MODE^^}" == "DEV" ]]; then
  export NODE_ENV="development"
  export VITE_APP_ENV="development"
fi

# -----------------------------
# 0b) Tests backend DEV ciblés : conformité privacy/auth
# -----------------------------
if [[ "${MODE^^}" == "DEV" ]]; then
  headline "Tests backend DEV ciblés (privacy/auth)"
  pushd backend > /dev/null

  echo "> npm test -- audit/__tests__/authAudit.test.js security/__tests__/originProtection.test.js services/__tests__/auth.service.test.js utils/__tests__/clinicianCommentPrivacy.test.js"
  npm test -- audit/__tests__/authAudit.test.js security/__tests__/originProtection.test.js services/__tests__/auth.service.test.js utils/__tests__/clinicianCommentPrivacy.test.js

  popd > /dev/null
else
  headline "Tests backend DEV ciblés (privacy/auth)"
  echo "Mode ${MODE^^:-<unset>} : tests DEV ignorés."
fi

echo "Compose file : $COMPOSE_FILE"
echo "Project name : $PROJECT_NAME"
echo "Mode        : ${MODE^^:-<unset>}"
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
  VITE_APP_ENV
)

for key in "${ENV_KEYS[@]}"; do
  printf "  %-18s = %s\n" "$key" "${!key:-<unset>}"
done

# checksum simple pour détecter les changements fantômes
ENV_CHECKSUM=$(printf "%s=%s\n" \
  "OPENAI_MODEL" "${OPENAI_MODEL:-}" \
  "CLINIA_MOCK_AI" "${CLINIA_MOCK_AI:-}" \
  "NODE_ENV" "${NODE_ENV:-}" \
  "VITE_APP_ENV" "${VITE_APP_ENV:-}" \
  | sha256sum | cut -d' ' -f1)

echo "  ENV_CHECKSUM        = $ENV_CHECKSUM"

# --------------------------------------------------
#  Sécurité dépendances : blocage si package-lock.json ou package.json modifiés
# --------------------------------------------------
pushd frontend > /dev/null
if ! git diff --exit-code package.json package-lock.json > /dev/null; then
  echo "❌ ATTENTION : package.json ou package-lock.json modifié(s) localement."
  echo "Le build est bloqué pour éviter toute modification non validée des librairies."
  echo "Validez ou annulez ces changements avant de relancer."
  exit 1
fi
popd > /dev/null

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

# Vérification accès frontend
headline "Vérification accès frontend (localhost:5173)"


# Retry loop (10x, 2s interval) for frontend endpoints
for url in "http://localhost:5173" "http://localhost:5173/demo"; do
  echo -n "Test $url ... "
  success=0
  for _ in {1..10}; do
    if curl -fs --max-time 5 "$url" > /dev/null; then
      success=1
      break
    fi
    sleep 2
  done
  if [[ "$success" == "1" ]]; then
    echo "OK"
  else
    echo "ERREUR"
    echo "❌ Impossible de joindre $url après 10 tentatives."
    exit 1
  fi
done

echo
echo "👉 Test API (mock):"
echo "curl -X POST http://localhost:4000/api/ai/analyze \
  -H \"Content-Type: application/json\" \
  -d '{\"symptoms\":[\"test\"]}'"

echo
echo "👉 Test API (real, si activé):"
echo "curl -X POST http://localhost:4000/api/ai/analyze \
  -H \"Content-Type: application/json\" \
  -d '{\"symptoms\":[\"test\"],\"forceReal\":true}'"

headline "Rebuild terminé"
