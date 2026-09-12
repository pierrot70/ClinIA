#!/usr/bin/env bash
# Manual staging/Coolify check. Never prints credentials, MFA codes or user lists.
set -euo pipefail
set +x
umask 077
[[ $# -le 1 ]] || { echo 'Usage: bash scripts/test-reauth-session-binding.sh [staging|coolify]' >&2; exit 1; }
target="${1:-staging}"
case "$target" in
    staging) api=http://localhost:4002/api/auth; origin=http://localhost:5174; protocol='=http' ;;
    coolify) api=https://clinique-ai.ca/api/auth; origin=https://clinique-ai.ca; protocol='=https' ;;
    *) echo 'Cible invalide : staging ou coolify uniquement.' >&2; exit 1 ;;
esac
command -v curl >/dev/null
command -v jq >/dev/null
# Ignore local curl configuration; keep TLS verification and never follow redirects.
curl() { command curl -q --proto "$protocol" "$@"; }
echo "Cible : $target ($origin)"
echo 'Utiliser un SUPERADMIN de test : deux sessions seront creees et peuvent remplacer des sessions existantes.'
if [[ "$target" == coolify ]]; then
    read -r -p 'Tapez TESTER COOLIFY pour autoriser ces connexions et lectures distantes : ' confirmation
    [[ "$confirmation" == 'TESTER COOLIFY' ]] || { echo 'Test annule.'; exit 1; }
fi
temporary="$(mktemp -d /tmp/clinia-reauth-check.XXXXXXXX)"
cleanup() {
    for session in a b; do
        if [[ -s "$temporary/$session.header" ]]; then
            if ! logout_status="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
                --request POST --header "Origin: $origin" --header "@$temporary/$session.header" \
                --cookie "$temporary/$session.cookies" "$api/logout")" || [[ "$logout_status" != 200 ]]; then
                echo "Attention : deconnexion de la session $session non confirmee." >&2
            fi
        fi
    done
    # Exact private directory created above; no user-supplied deletion target.
    rm -rf -- "$temporary"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
read -r -p "Identifiant du SUPERADMIN $target : " identifier
read -r -s -p 'Mot de passe (masque) : ' password
printf '\n'
printf '%s' "$identifier" > "$temporary/identifier"
printf '%s' "$password" > "$temporary/password"
unset identifier password
jq -n --rawfile identifier "$temporary/identifier" --rawfile password "$temporary/password" \
    '{username:$identifier,password:$password}' > "$temporary/login.json"
jq -n --rawfile password "$temporary/password" '{password:$password}' > "$temporary/reauth.json"

for session in a b; do
    status="$(curl --silent --show-error --max-time 20 --output "$temporary/$session.json" --write-out '%{http_code}' \
        --header 'Content-Type: application/json' --header "Origin: $origin" \
        --cookie-jar "$temporary/$session.cookies" --data-binary "@$temporary/login.json" "$api/login")"
    echo "Connexion $session : HTTP $status"
    if [[ "$status" == 202 ]]; then
        if ! jq -e '.data.mfaRequired == true and .data.mfaEnrollmentRequired == false and (.data.mfaChallenge | type == "string")' "$temporary/$session.json" >/dev/null; then
            echo 'Test interrompu : MFA non configure ou reponse inattendue. Configurer le MFA dans le UI avant ce test.' >&2
            exit 1
        fi
        echo "Session $session : saisir un code MFA actuel. Pour B, attendre un nouveau code different de celui utilise pour A."
        read -r -s -p 'Code MFA (6 chiffres, masque) : ' mfa_code
        printf '\n'
        [[ "$mfa_code" =~ ^[0-9]{6}$ ]] || { echo 'Format du code MFA invalide.' >&2; exit 1; }
        printf '%s' "$mfa_code" > "$temporary/mfa-code"
        unset mfa_code
        jq --rawfile code "$temporary/mfa-code" '{mfaChallenge:.data.mfaChallenge,code:$code}' "$temporary/$session.json" > "$temporary/mfa.json"
        status="$(curl --silent --show-error --max-time 20 --output "$temporary/$session.json" --write-out '%{http_code}' \
            --header 'Content-Type: application/json' --header "Origin: $origin" \
            --cookie "$temporary/$session.cookies" --cookie-jar "$temporary/$session.cookies" \
            --data-binary "@$temporary/mfa.json" "$api/login/mfa")"
        echo "MFA $session : HTTP $status"
        rm -f -- "$temporary/mfa-code" "$temporary/mfa.json"
    fi
    if [[ "$status" != 200 ]]; then
        echo 'Test interrompu : connexion ou MFA refuse. Aucun resultat sur la faille. Pas de nouvelle tentative automatique.' >&2
        exit 1
    fi
    jq -er '.data.accessToken | select(type == "string" and test("^[A-Za-z0-9_.-]+$")) | "Authorization: Bearer " + .' \
        "$temporary/$session.json" > "$temporary/$session.header"
    if ! jq -e '.data.user.role == "SUPERADMIN"' "$temporary/$session.json" >/dev/null; then
        echo 'Ce test exige un compte SUPERADMIN.' >&2
        exit 1
    fi
done

check() {
    local session="$1" cookie_file="$2"
    status="$(curl --silent --show-error --max-time 20 --output "$temporary/result.json" --write-out '%{http_code}' \
        --header "@$temporary/$session.header" --header 'Cache-Control: no-store' \
        --cookie "$cookie_file" "$api/users/active")"
    code="$(jq -r 'if (.error.code | type) == "string" then .error.code else "-" end' "$temporary/result.json")"
    # Only fixed known codes may be printed, never arbitrary server response text.
    case "$code" in REAUTH_REQUIRED|SESSION_REPLACED|INVALID_TOKEN|UNAUTHORIZED|FORBIDDEN|-) ;; *) code=OTHER_ERROR ;; esac
}
check b "$temporary/b.cookies"
echo "B sans confirmation : HTTP $status ($code) — attendu 403 REAUTH_REQUIRED"
[[ "$status" == 403 && "$code" == REAUTH_REQUIRED ]] || { echo 'Controle initial invalide.' >&2; exit 1; }

status="$(curl --silent --show-error --max-time 20 --output "$temporary/confirmation.json" --write-out '%{http_code}' \
    --header "@$temporary/a.header" --header 'Content-Type: application/json' --header "Origin: $origin" \
    --cookie "$temporary/a.cookies" --cookie-jar "$temporary/a.cookies" \
    --data-binary "@$temporary/reauth.json" "$api/reauth")"
echo "Confirmation dans A : HTTP $status — attendu 200"
[[ "$status" == 200 ]] || { echo 'Confirmation impossible, test interrompu.' >&2; exit 1; }
check a "$temporary/a.cookies"
echo "A avec sa confirmation : HTTP $status ($code) — attendu 200"
[[ "$status" == 200 ]] || { echo 'Controle positif invalide.' >&2; exit 1; }
check b "$temporary/a.cookies"
echo "B avec la confirmation de A : HTTP $status ($code)"
if [[ "$status" == 200 ]]; then
    echo 'FAILLE REPRODUITE : la confirmation est acceptee dans une autre session.'
elif [[ "$status" == 403 && "$code" == REAUTH_REQUIRED ]]; then
    echo 'PROTECTION CONFIRMEE : la confirmation empruntee est refusee.'
else
    echo 'RESULTAT NON CONCLUANT.' >&2
    exit 1
fi
