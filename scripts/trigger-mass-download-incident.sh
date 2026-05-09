#!/usr/bin/env bash
set -euo pipefail

# Usage examples:
#   CLINIA_EMAIL="admin@example.com" CLINIA_PASSWORD="secret" ./scripts/trigger-mass-download-incident.sh
#   CLINIA_EMAIL="admin@example.com" CLINIA_PASSWORD="secret" SCENARIO="openai-logs" ./scripts/trigger-mass-download-incident.sh
#
# Optional env vars:
#   API_URL=http://localhost:4000
#   SCENARIO=patients|openai-logs
#   PATIENT_LIMIT=50
#   PATIENT_REQUESTS=5
#   OPENAI_EXPORT_REQUESTS=3

API_URL="${API_URL:-http://localhost:4000}"
SCENARIO="${SCENARIO:-patients}"
PATIENT_LIMIT="${PATIENT_LIMIT:-50}"
PATIENT_REQUESTS="${PATIENT_REQUESTS:-5}"
OPENAI_EXPORT_REQUESTS="${OPENAI_EXPORT_REQUESTS:-3}"
CLINIA_EMAIL="${CLINIA_EMAIL:-}"
CLINIA_PASSWORD="${CLINIA_PASSWORD:-}"

SCRIPT_NAME="$(basename "$0")"
TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
LOGIN_BODY="$TMP_DIR/login.json"
LOGIN_HEADERS="$TMP_DIR/login-headers.txt"
INCIDENTS_BODY="$TMP_DIR/incidents.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '\n[%s] %s\n' "$SCRIPT_NAME" "$1" >&2
}

fail() {
  printf '\n[%s] ERREUR: %s\n' "$SCRIPT_NAME" "$1" >&2
  exit 1
}

require_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js est requis pour parser les reponses JSON."
}

require_curl() {
  command -v curl >/dev/null 2>&1 || fail "curl est requis."
}

require_credentials() {
  [[ -n "$CLINIA_EMAIL" ]] || fail "Definis CLINIA_EMAIL."
  [[ -n "$CLINIA_PASSWORD" ]] || fail "Definis CLINIA_PASSWORD."
}

extract_access_token() {
  node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const token = payload?.data?.accessToken || "";
    if (!token) process.exit(1);
    process.stdout.write(token);
  ' "$1"
}

print_incident_summary() {
  node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const incidents = payload?.data?.incidents || [];
    const pagination = payload?.data?.pagination || { total: 0 };
    console.log(`Incidents MASS_DOWNLOAD_ATTEMPT non acquittes: ${pagination.total || 0}`);
    if (incidents.length > 0) {
      const incident = incidents[0];
      const context = incident?.context || {};
      console.log("Dernier incident:");
      console.log(`- type: ${incident?.type || "-"}`);
      console.log(`- date: ${incident?.detectedAt || incident?.createdAt || "-"}`);
      console.log(`- path: ${incident?.requestPath || "-"}`);
      console.log(`- role: ${context.role || "-"}`);
      console.log(`- userId: ${context.userId || "-"}`);
      console.log(`- ip: ${context.ip || "-"}`);
      console.log(`- volume: ${context.totalCost || "-"}`);
    }
  ' "$1"
}

login_and_get_token() {
  log "Connexion a ${API_URL} avec ${CLINIA_EMAIL}"

  local status
  status="$(
    curl -sS \
      -D "$LOGIN_HEADERS" \
      -o "$LOGIN_BODY" \
      -c "$COOKIE_JAR" \
      -w "%{http_code}" \
      -X POST "$API_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      --data "{\"email\":\"$CLINIA_EMAIL\",\"password\":\"$CLINIA_PASSWORD\"}"
  )"

  if [[ "$status" != "200" ]]; then
    printf '\n--- Reponse login (%s) ---\n' "$status" >&2
    cat "$LOGIN_BODY" >&2
    printf '\n-------------------------\n' >&2
    fail "Connexion impossible."
  fi

  extract_access_token "$LOGIN_BODY"
}

fetch_incident_count() {
  local token="$1"
  local status
  local url="$API_URL/api/security/incidents?acknowledged=false&type=MASS_DOWNLOAD_ATTEMPT&page=1&limit=5"

  status="$(
    curl -sS \
      -o "$INCIDENTS_BODY" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $token" \
      "$url"
  )"

  if [[ "$status" != "200" ]]; then
    printf '\n--- Reponse incidents (%s) ---\n' "$status" >&2
    cat "$INCIDENTS_BODY" >&2
    printf '\n-----------------------------\n' >&2
    fail "Impossible de lire les incidents de securite apres le scenario."
  fi

  print_incident_summary "$INCIDENTS_BODY"
}

print_ui_expectations() {
  cat <<'EOF'

Ce que tu devrais voir dans le UI, cote SUPERADMIN:
1. Le badge "Incidents sécurité" dans le header doit augmenter.
2. Si le badge ne change pas immediatement:
   - attends jusqu'a 60 secondes, ou
   - clique sur le badge pour ouvrir la modale et forcer le rafraichissement.
3. Dans la modale "Incidents sécurité":
   - un incident de type MASS_DOWNLOAD_ATTEMPT doit apparaitre
   - le contexte doit montrer quelque chose comme role, user, ip et volume
   - tu peux ensuite l'acquitter avec le bouton "Acquitter"

EOF
}

run_patients_scenario() {
  local token="$1"
  local i
  local response_body="$TMP_DIR/patients-response.json"

  log "Scenario patients: $PATIENT_REQUESTS requetes GET /api/patients?limit=$PATIENT_LIMIT"
  print_ui_expectations
  read -r -p "Pret a declencher l'incident MASS_DOWNLOAD_ATTEMPT via /api/patients ? [Entrée] " _

  for ((i = 1; i <= PATIENT_REQUESTS; i += 1)); do
    local page="$i"
    local url="$API_URL/api/patients?page=$page&limit=$PATIENT_LIMIT"
    log "Requete $i/$PATIENT_REQUESTS -> $url"
    local status
    status="$(
      curl -sS \
      -o "$response_body" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $token" \
      "$url"
    )"
    printf '[%s] HTTP %s\n' "$SCRIPT_NAME" "$status"
    if [[ "$status" != "200" ]]; then
      printf '\n--- Reponse patients (%s) ---\n' "$status" >&2
      cat "$response_body" >&2
      printf '\n-----------------------------\n' >&2
      fail "La requete patients $i a retourne HTTP $status."
    fi
  done
}

run_openai_logs_scenario() {
  local token="$1"
  local i
  local response_body="$TMP_DIR/openai-response.csv"

  log "Scenario openai-logs: $OPENAI_EXPORT_REQUESTS exports CSV sur /api/openai-logs/export.csv"
  print_ui_expectations
  read -r -p "Pret a declencher l'incident MASS_DOWNLOAD_ATTEMPT via /api/openai-logs/export.csv ? [Entrée] " _

  for ((i = 1; i <= OPENAI_EXPORT_REQUESTS; i += 1)); do
    local url="$API_URL/api/openai-logs/export.csv?startDate=2026-05-01&endDate=2026-05-09"
    log "Export $i/$OPENAI_EXPORT_REQUESTS -> $url"
    local status
    status="$(
      curl -sS \
      -o "$response_body" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $token" \
      "$url"
    )"
    printf '[%s] HTTP %s\n' "$SCRIPT_NAME" "$status"
    if [[ "$status" != "200" ]]; then
      printf '\n--- Reponse openai logs (%s) ---\n' "$status" >&2
      cat "$response_body" >&2
      printf '\n--------------------------------\n' >&2
      fail "L'export OpenAI $i a retourne HTTP $status."
    fi
  done
}

main() {
  require_curl
  require_node
  require_credentials

  case "$SCENARIO" in
    patients|openai-logs)
      ;;
    *)
      fail "SCENARIO invalide: utilise 'patients' ou 'openai-logs'."
      ;;
  esac

  local token
  token="$(login_and_get_token)"

  case "$SCENARIO" in
    patients)
      run_patients_scenario "$token"
      ;;
    openai-logs)
      run_openai_logs_scenario "$token"
      ;;
  esac

  log "Verification directe des incidents cote backend"
  fetch_incident_count "$token"

  cat <<'EOF'

Le scenario a ete execute.

Va maintenant dans le navigateur avec un compte SUPERADMIN:
- regarde le badge "Incidents sécurité"
- ouvre la modale si necessaire
- verifie qu'un MASS_DOWNLOAD_ATTEMPT apparait

EOF

  read -r -p "Est-ce que tu vois bien l'incident dans le UI ? [y/N] " seen_it
  case "${seen_it:-n}" in
    y|Y|yes|YES)
      log "Parfait. Le signal visuel de detection fonctionne."
      ;;
    *)
      log "OK. Si tu ne le vois pas, clique sur le badge pour forcer le rafraichissement, ou attends 60 secondes."
      ;;
  esac
}

main "$@"
