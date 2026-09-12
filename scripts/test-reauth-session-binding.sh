#!/usr/bin/env bash
# Manual before/after check on local staging only. Never prints credentials or user lists.
set -euo pipefail
set +x
umask 077
api=http://localhost:4002/api/auth
origin=http://localhost:5174
command -v curl >/dev/null
command -v jq >/dev/null
temporary="$(mktemp -d /tmp/clinia-reauth-check.XXXXXXXX)"
cleanup() {
    for session in a b; do
        if [[ -s "$temporary/$session.header" ]]; then
            if ! curl --silent --show-error --max-time 15 --output /dev/null \
                --request POST --header "Origin: $origin" --header "@$temporary/$session.header" \
                --cookie "$temporary/$session.cookies" "$api/logout"; then
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
read -r -p 'Identifiant du SUPERADMIN staging : ' identifier
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
    if [[ "$status" != 200 ]]; then
        echo 'Test interrompu : connexion refusee ou MFA demande. Aucun resultat sur la faille.' >&2
        exit 1
    fi
    jq -er '.data.accessToken | select(type == "string" and test("^[A-Za-z0-9_.-]+$")) | "Authorization: Bearer " + .' \
        "$temporary/$session.json" > "$temporary/$session.header"
    if ! jq -e '.data.user.role == "SUPERADMIN"' "$temporary/$session.json" >/dev/null; then
        echo 'Ce test exige un compte SUPERADMIN staging.' >&2
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
