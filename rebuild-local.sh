#!/usr/bin/env bash

headline() {
  echo
  echo "=================================================="
  echo "$1"
  echo "=================================================="
}

TEST_SUMMARY_FRONTEND_TOTAL=0
TEST_SUMMARY_FRONTEND_FAILED=0
TEST_SUMMARY_FRONTEND_FAILED_NAMES=""
TEST_SUMMARY_FRONTEND_TESTS_TOTAL=0
TEST_SUMMARY_FRONTEND_TESTS_FAILED=0
TEST_SUMMARY_BACKEND_TOTAL=0
TEST_SUMMARY_BACKEND_FAILED=0
TEST_SUMMARY_BACKEND_FAILED_NAMES=""
TEST_SUMMARY_BACKEND_TESTS_TOTAL=0
TEST_SUMMARY_BACKEND_TESTS_FAILED=0
TEST_SUMMARY_BACKEND_WATCH=0
declare -a TEST_SUMMARY_FRONTEND_FILES=()
declare -a TEST_SUMMARY_BACKEND_FILES=()

print_test_summary() {
  headline "Resume des tests"

  if [[ "$TEST_SUMMARY_FRONTEND_TOTAL" -gt 0 ]]; then
    local frontend_passed=$((TEST_SUMMARY_FRONTEND_TOTAL - TEST_SUMMARY_FRONTEND_FAILED))
    local frontend_tests_passed=$((TEST_SUMMARY_FRONTEND_TESTS_TOTAL - TEST_SUMMARY_FRONTEND_TESTS_FAILED))
    echo "Frontend Test Files: ${frontend_passed} passed (${TEST_SUMMARY_FRONTEND_TOTAL})"
    echo "Frontend Tests: ${frontend_tests_passed} passed (${TEST_SUMMARY_FRONTEND_TESTS_TOTAL})"
    if [[ "$TEST_SUMMARY_FRONTEND_FAILED" -gt 0 ]]; then
      echo "Fichiers frontend en echec:"
      printf '%s\n' "$TEST_SUMMARY_FRONTEND_FAILED_NAMES"
    fi
  else
    echo "Frontend Test Files: non executes"
  fi

  if [[ "$TEST_SUMMARY_BACKEND_WATCH" == "1" ]]; then
    echo "Backend Test Files: mode watch actif, resume final non calcule"
  elif [[ "$TEST_SUMMARY_BACKEND_TOTAL" -gt 0 ]]; then
    local backend_passed=$((TEST_SUMMARY_BACKEND_TOTAL - TEST_SUMMARY_BACKEND_FAILED))
    local backend_tests_passed=$((TEST_SUMMARY_BACKEND_TESTS_TOTAL - TEST_SUMMARY_BACKEND_TESTS_FAILED))
    echo "Backend Test Files: ${backend_passed} passed (${TEST_SUMMARY_BACKEND_TOTAL})"
    echo "Backend Tests: ${backend_tests_passed} passed (${TEST_SUMMARY_BACKEND_TESTS_TOTAL})"
    if [[ "$TEST_SUMMARY_BACKEND_FAILED" -gt 0 ]]; then
      echo "Fichiers backend en echec:"
      printf '%s\n' "$TEST_SUMMARY_BACKEND_FAILED_NAMES"
    fi
  else
    echo "Backend Test Files: non executes"
  fi
}

trap print_test_summary EXIT

run_vitest_with_summary() {
  local suite_name="$1"
  shift

  local log_file
  log_file="$(mktemp)"

  set +e
  npx vitest run "$@" >"$log_file" 2>&1
  local status=$?
  set -e

  cat "$log_file"

  local summary_line
  summary_line="$(node - "$log_file" <<'NODE'
const fs = require("fs");
const filePath = process.argv[2];
const text = fs
  .readFileSync(filePath, "utf8")
  .replace(/\u001b\[[0-9;]*m/g, "");
const lines = text.split(/\r?\n/);

const testFilesLine = [...lines].reverse().find((line) => line.includes("Test Files")) || "";
const testsLine = [...lines].reverse().find((line) => /^\s*Tests\s+/.test(line)) || "";

const testFilesMatch = testFilesLine.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
const testFilesFailedMatch = testFilesLine.match(/Test Files\s+(\d+)\s+failed\s+\((\d+)\)/);
const testsMatch = testsLine.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
const testsFailedMatch = testsLine.match(/Tests\s+(\d+)\s+failed\s+\((\d+)\)/);

const totalFiles = testFilesMatch
  ? Number(testFilesMatch[2])
  : testFilesFailedMatch
    ? Number(testFilesFailedMatch[2])
    : 0;
const failedFiles = testFilesMatch
  ? totalFiles - Number(testFilesMatch[1])
  : testFilesFailedMatch
    ? Number(testFilesFailedMatch[1])
    : 0;
const totalTests = testsMatch
  ? Number(testsMatch[2])
  : testsFailedMatch
    ? Number(testsFailedMatch[2])
    : 0;
const failedTests = testsMatch
  ? totalTests - Number(testsMatch[1])
  : testsFailedMatch
    ? Number(testsFailedMatch[1])
    : 0;

const failedNames = lines
  .filter((line) => /^\s*[×x]\s+/.test(line) || /^\s*FAIL\s+/.test(line))
  .map((line) => line.replace(/^\s*[×x]\s+/, "").replace(/^\s*FAIL\s+/, "").trim())
  .filter(Boolean)
  .join("||");

process.stdout.write(`${failedFiles}\n${failedNames}\n${totalTests}\n${failedTests}\n${totalFiles}`);
NODE
)"

  rm -f "$log_file"

  local failed failed_names total_tests failed_tests total_files
  failed="$(printf '%s\n' "$summary_line" | sed -n '1p')"
  failed_names="$(printf '%s\n' "$summary_line" | sed -n '2p')"
  total_tests="$(printf '%s\n' "$summary_line" | sed -n '3p')"
  failed_tests="$(printf '%s\n' "$summary_line" | sed -n '4p')"
  total_files="$(printf '%s\n' "$summary_line" | sed -n '5p')"

  if [[ "$suite_name" == "frontend" ]]; then
    if [[ -z "$total_files" || "$total_files" -le 0 ]]; then
      total_files="${#TEST_SUMMARY_FRONTEND_FILES[@]}"
    fi
    TEST_SUMMARY_FRONTEND_TOTAL="$total_files"
    TEST_SUMMARY_FRONTEND_FAILED="${failed:-0}"
    TEST_SUMMARY_FRONTEND_FAILED_NAMES="${failed_names//||/$'\n'}"
    TEST_SUMMARY_FRONTEND_TESTS_TOTAL="${total_tests:-0}"
    TEST_SUMMARY_FRONTEND_TESTS_FAILED="${failed_tests:-0}"
  else
    if [[ -z "$total_files" || "$total_files" -le 0 ]]; then
      total_files="${#TEST_SUMMARY_BACKEND_FILES[@]}"
    fi
    TEST_SUMMARY_BACKEND_TOTAL="$total_files"
    TEST_SUMMARY_BACKEND_FAILED="${failed:-0}"
    TEST_SUMMARY_BACKEND_FAILED_NAMES="${failed_names//||/$'\n'}"
    TEST_SUMMARY_BACKEND_TESTS_TOTAL="${total_tests:-0}"
    TEST_SUMMARY_BACKEND_TESTS_FAILED="${failed_tests:-0}"
  fi

  return "$status"
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
BACKEND_TEST_WATCH="${BACKEND_TEST_WATCH:-0}"
TEST_FAILED="${TEST_FAILED:-0}"

# -----------------------------
# Helpers
# -----------------------------
dc() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

fail_if_test_failure_simulated() {
  if [[ "$TEST_FAILED" == "1" ]]; then
    echo "❌ TEST_FAILED=1 : echec simule apres les tests. Build Docker annule."
    exit 1
  fi
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

echo "> npx vitest run src/i18n/uiLabels.test.ts src/hooks/useTranslation.test.tsx src/services/securityIncidentApi.test.ts src/components/admin/AuthLogsModal.test.tsx src/components/admin/AuthGraphsModal.test.tsx src/components/admin/SecurityIncidentsModal.test.tsx src/components/admin/ClinicianInboxModal.test.tsx"
TEST_SUMMARY_FRONTEND_FILES=(
  "src/i18n/uiLabels.test.ts"
  "src/hooks/useTranslation.test.tsx"
  "src/services/securityIncidentApi.test.ts"
  "src/components/admin/AuthLogsModal.test.tsx"
  "src/components/admin/AuthGraphsModal.test.tsx"
  "src/components/admin/SecurityIncidentsModal.test.tsx"
  "src/components/admin/ClinicianInboxModal.test.tsx"
)
run_vitest_with_summary frontend src/i18n/uiLabels.test.ts src/hooks/useTranslation.test.tsx src/services/securityIncidentApi.test.ts src/components/admin/AuthLogsModal.test.tsx src/components/admin/AuthGraphsModal.test.tsx src/components/admin/SecurityIncidentsModal.test.tsx src/components/admin/ClinicianInboxModal.test.tsx || exit 1
fail_if_test_failure_simulated

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
# 0b) Tests backend DEV complets : tous les *.test.js
# -----------------------------
if [[ "${MODE^^}" == "DEV" ]]; then
  headline "Tests backend DEV complets (*.test.js)"
  pushd backend > /dev/null

  echo "> Fichiers backend *.test.js detectes :"
  mapfile -t BACKEND_TEST_FILES < <(find . -path './node_modules' -prune -o -path './backend/node_modules' -prune -o -path '*/__tests__/*.test.js' -print | sort)
  TEST_SUMMARY_BACKEND_FILES=("${BACKEND_TEST_FILES[@]}")
  printf '  - %s\n' "${BACKEND_TEST_FILES[@]}"
  echo "> Total: ${#BACKEND_TEST_FILES[@]} fichiers"

  if [[ "$BACKEND_TEST_WATCH" == "1" ]]; then
    TEST_SUMMARY_BACKEND_WATCH=1
    echo "> npx vitest"
    echo "> Mode watch actif. Tu pourras taper q pour quitter apres inspection."
    npx vitest
  else
    echo "> npx vitest run"
    run_vitest_with_summary backend || exit 1
    fail_if_test_failure_simulated
  fi

  popd > /dev/null
else
  headline "Tests backend DEV complets (*.test.js)"
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
