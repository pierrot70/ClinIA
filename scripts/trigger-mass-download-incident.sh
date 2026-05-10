#!/usr/bin/env bash
set -euo pipefail

# Usage examples:
#   CLINIA_EMAIL="admin@example.com" CLINIA_PASSWORD="secret" ./scripts/trigger-mass-download-incident.sh
#   CLINIA_EMAIL="admin@example.com" CLINIA_PASSWORD="secret" SCENARIO="openai-logs" ./scripts/trigger-mass-download-incident.sh
#
# Optional env vars:
#   API_URL=http://localhost:4000
#   SCENARIO=patients|openai-logs
#   MODE=detect|escalate|restrict
#   PATIENT_LIMIT=50
#   PATIENT_REQUESTS=5
#   OPENAI_EXPORT_REQUESTS=3

LOCAL_API_URL="http://localhost:4000"
PROD_API_URL="https://clinique-ai.ca"

API_URL="${API_URL:-}"
SCENARIO="${SCENARIO:-patients}"
MODE="${MODE:-}"
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
SESSION_CHECK_BODY="$TMP_DIR/session-check.json"
RESTRICT_CHECK_BODY="$TMP_DIR/restrict-check.json"
SESSION_REVOKED_DURING_INCIDENT_FETCH="false"

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

prompt_api_url() {
  if [[ -n "$API_URL" ]]; then
    return
  fi

  while true; do
    local selected_target
    printf '\nChoisir l environnement [local/prod] (defaut: local): '
    read -r selected_target
    selected_target="${selected_target:-local}"

    case "$selected_target" in
      local)
        API_URL="$LOCAL_API_URL"
        return
        ;;
      prod)
        API_URL="$PROD_API_URL"
        return
        ;;
      *)
        printf 'Valeur invalide. Entre "local" ou "prod".\n' >&2
        ;;
    esac
  done
}

prompt_mode() {
  if [[ -n "$MODE" ]]; then
    return
  fi

  while true; do
    local selected_mode
    printf '\nChoisir le mode du test [detect/escalate/restrict] (defaut: detect): '
    read -r selected_mode
    selected_mode="${selected_mode:-detect}"

    case "$selected_mode" in
      detect|escalate|restrict)
        MODE="$selected_mode"
        return
        ;;
      *)
        printf 'Valeur invalide. Entre "detect", "escalate" ou "restrict".\n' >&2
        ;;
    esac
  done
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
    if [[ "$status" == "401" ]] && grep -q '"code":"TOKEN_REVOKED"' "$INCIDENTS_BODY"; then
      SESSION_REVOKED_DURING_INCIDENT_FETCH="true"
      log "Session compromise revoquee immediatement apres detection. Ce 401 TOKEN_REVOKED est attendu."
      return
    fi

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

print_escalation_expectations() {
  cat <<'EOF'

Mode escalation:
1. Le premier cycle cree un incident MASS_DOWNLOAD_ATTEMPT.
2. Le second cycle, dans la fenetre courte, doit provoquer la reaction graduelle.
3. Apres le second cycle, une requete protegee doit etre rejetee.
4. Cote UI, la session compromise devrait finir par etre forcee a se reconnecter.

EOF
}

print_restriction_expectations() {
  cat <<'EOF'

Mode restrict:
1. Le premier cycle cree un incident MASS_DOWNLOAD_ATTEMPT.
2. Le second cycle provoque la revocation immediate de la session active.
3. Le script se reconnecte avec les memes identifiants.
4. Une route sensible doit alors refuser l'acces, soit avec ACCOUNT_TEMPORARILY_RESTRICTED, soit avec PASSWORD_RESET_REQUIRED si un reset force est maintenant exige.

EOF
}

print_existing_restriction_error() {
  local response_body="$1"

  node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const error = payload?.error || {};
    const restrictedUntil = error?.restrictedUntil || "inconnue";
    const message = error?.message || "Acces temporairement restreint.";
    console.error("");
    console.error(`[trigger-mass-download-incident.sh] Ce compte est deja sous restriction temporaire.`);
    console.error(`[trigger-mass-download-incident.sh] Fin de restriction: ${restrictedUntil}`);
    console.error(`[trigger-mass-download-incident.sh] Message API: ${message}`);
    console.error("[trigger-mass-download-incident.sh] Attends la fin de la fenetre, utilise un autre compte, ou reinitialise la restriction en local avant de rejouer le scenario.");
  ' "$response_body"
}

print_password_reset_required_error() {
  local response_body="$1"

  node -e '
    const fs = require("fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const error = payload?.error || {};
    const message =
      error?.message ||
      "Un changement de mot de passe est requis avant de poursuivre.";
    console.error("");
    console.error("[trigger-mass-download-incident.sh] Ce compte est deja bloque jusqu a reinitialisation du mot de passe.");
    console.error(`[trigger-mass-download-incident.sh] Message API: ${message}`);
    console.error("[trigger-mass-download-incident.sh] Fais reinitialiser le mot de passe par un SUPERADMIN, puis rejoue le scenario avec le nouveau mot de passe.");
  ' "$response_body"
}

verify_session_revoked() {
  local token="$1"
  local status
  local url="$API_URL/api/patients?page=1&limit=1"

  log "Verification qu'une requete protegee est maintenant rejetee"

  if [[ "$SESSION_REVOKED_DURING_INCIDENT_FETCH" == "true" ]]; then
    printf '[%s] HTTP session-check 401\n' "$SCRIPT_NAME"
    return
  fi

  status="$(
    curl -sS \
      -o "$SESSION_CHECK_BODY" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $token" \
      "$url"
  )"

  printf '[%s] HTTP session-check %s\n' "$SCRIPT_NAME" "$status"

  if [[ "$status" != "401" ]]; then
    printf '\n--- Reponse session-check (%s) ---\n' "$status" >&2
    cat "$SESSION_CHECK_BODY" >&2
    printf '\n---------------------------------\n' >&2
    fail "La session n'a pas ete revoquee comme attendu en mode escalate."
  fi
}

verify_sensitive_route_restricted_after_relogin() {
  local fresh_token="$1"
  local status
  local url

  case "$SCENARIO" in
    patients)
      url="$API_URL/api/patients?page=1&limit=1"
      ;;
    openai-logs)
      url="$API_URL/api/openai-logs/export.csv?startDate=2026-05-01&endDate=2026-05-09"
      ;;
    *)
      fail "SCENARIO invalide pour le test de restriction."
      ;;
  esac

  log "Verification qu'une reconnexion ne redonne pas acces a la route sensible"

  status="$(
    curl -sS \
      -o "$RESTRICT_CHECK_BODY" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $fresh_token" \
      "$url"
  )"

  printf '[%s] HTTP restrict-check %s\n' "$SCRIPT_NAME" "$status"

  if [[ "$status" == "423" ]] && grep -q '"code":"ACCOUNT_TEMPORARILY_RESTRICTED"' "$RESTRICT_CHECK_BODY"; then
    log "Restriction temporaire confirmee apres reconnexion."
    return
  fi

  if [[ "$status" == "403" ]] && grep -q '"code":"PASSWORD_RESET_REQUIRED"' "$RESTRICT_CHECK_BODY"; then
    log "Reset de mot de passe force confirme apres reconnexion."
    return
  fi

  if [[ "$status" != "423" && "$status" != "403" ]]; then
    printf '\n--- Reponse restrict-check (%s) ---\n' "$status" >&2
    cat "$RESTRICT_CHECK_BODY" >&2
    printf '\n----------------------------------\n' >&2
    fail "La route sensible n'a pas renvoye le blocage attendu apres reconnexion."
  fi

  printf '\n--- Reponse restrict-check (%s) ---\n' "$status" >&2
  cat "$RESTRICT_CHECK_BODY" >&2
  printf '\n----------------------------------\n' >&2
  fail "La route sensible a repondu, mais pas avec ACCOUNT_TEMPORARILY_RESTRICTED ni PASSWORD_RESET_REQUIRED."
}

run_restriction_preflight_check() {
  local token="$1"
  local status
  local url="$API_URL/api/patients?page=1&limit=1"

  log "Preflight: verification immediate d'une restriction deja active sur /api/patients"

  status="$(
    curl -sS \
      -o "$RESTRICT_CHECK_BODY" \
      -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      -H "Authorization: Bearer $token" \
      "$url"
  )"

  if [[ "$status" == "423" ]] && grep -q '"code":"ACCOUNT_TEMPORARILY_RESTRICTED"' "$RESTRICT_CHECK_BODY"; then
    print_existing_restriction_error "$RESTRICT_CHECK_BODY"
    exit 1
  fi

  if [[ "$status" == "403" ]] && grep -q '"code":"PASSWORD_RESET_REQUIRED"' "$RESTRICT_CHECK_BODY"; then
    print_password_reset_required_error "$RESTRICT_CHECK_BODY"
    exit 1
  fi

  if [[ "$status" != "200" ]]; then
    printf '\n--- Reponse preflight (%s) ---\n' "$status" >&2
    cat "$RESTRICT_CHECK_BODY" >&2
    printf '\n------------------------------\n' >&2
    fail "Le preflight sur /api/patients a echoue avant le scenario."
  fi
}

handle_expected_token_revoked() {
  local status="$1"
  local response_body="$2"

  if [[ "$status" == "401" ]] && grep -q '"code":"TOKEN_REVOKED"' "$response_body"; then
    SESSION_REVOKED_DURING_INCIDENT_FETCH="true"
    log "Session compromise revoquee pendant le scenario. Ce 401 TOKEN_REVOKED est attendu."
    return 0
  fi

  return 1
}

handle_existing_account_restriction() {
  local status="$1"
  local response_body="$2"

  if [[ "$status" == "423" ]] && grep -q '"code":"ACCOUNT_TEMPORARILY_RESTRICTED"' "$response_body"; then
    print_existing_restriction_error "$response_body"
    exit 1
  fi

  return 1
}

handle_password_reset_required() {
  local status="$1"
  local response_body="$2"

  if [[ "$status" == "403" ]] && grep -q '"code":"PASSWORD_RESET_REQUIRED"' "$response_body"; then
    print_password_reset_required_error "$response_body"
    exit 1
  fi

  return 1
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
      if handle_existing_account_restriction "$status" "$response_body"; then
        return
      fi

      if handle_password_reset_required "$status" "$response_body"; then
        return
      fi

      if handle_expected_token_revoked "$status" "$response_body"; then
        return
      fi

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
      if handle_existing_account_restriction "$status" "$response_body"; then
        return
      fi

      if handle_password_reset_required "$status" "$response_body"; then
        return
      fi

      if handle_expected_token_revoked "$status" "$response_body"; then
        return
      fi

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

  prompt_api_url
  prompt_mode

  case "$MODE" in
    detect|escalate|restrict)
      ;;
    *)
      fail "MODE invalide: utilise 'detect', 'escalate' ou 'restrict'."
      ;;
  esac

  local token
  token="$(login_and_get_token)"

  if [[ "$MODE" == "restrict" ]]; then
    run_restriction_preflight_check "$token"
  fi

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

  if [[ "$MODE" == "escalate" || "$MODE" == "restrict" ]]; then
    print_escalation_expectations
    if [[ "$MODE" == "restrict" ]]; then
      print_restriction_expectations
    fi
    if [[ "$SESSION_REVOKED_DURING_INCIDENT_FETCH" != "true" ]]; then
      read -r -p "Pret a lancer un second cycle pour provoquer l'escalade ? [Entrée] " _

      case "$SCENARIO" in
        patients)
          run_patients_scenario "$token"
          ;;
        openai-logs)
          run_openai_logs_scenario "$token"
          ;;
      esac

      log "Verification directe des incidents cote backend apres escalation"
      fetch_incident_count "$token"
    else
      log "Le premier cycle a deja provoque la revocation de session; second cycle saute."
    fi

    verify_session_revoked "$token"

    if [[ "$MODE" == "restrict" ]]; then
      read -r -p "Pret a tester la reconnexion puis la restriction temporaire ? [Entrée] " _
      token="$(login_and_get_token)"
      verify_sensitive_route_restricted_after_relogin "$token"
    fi
  fi

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
