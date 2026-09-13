#!/usr/bin/env bash
# Interactive test: never prints passwords, OTPs, tokens or response bodies.
set -euo pipefail
set +x
umask 077
[[ $# -le 1 ]] || { echo 'Usage: bash scripts/test-mfa-replay.sh [staging|coolify]' >&2; exit 1; }
target="${1:-staging}"
case "$target" in
    staging) api=http://localhost:4002/api/auth; protocol='=http'; origin=http://localhost:5174 ;;
    coolify) api=https://clinique-ai.ca/api/auth; protocol='=https'; origin=https://clinique-ai.ca ;;
    *) echo 'Cible invalide : staging ou coolify uniquement.' >&2; exit 1 ;;
esac
for dependency in curl jq date awk cmp; do command -v "$dependency" >/dev/null; done
curl() { command curl -q --proto "$protocol" "$@"; }
echo "Cible : $target ($origin)"
echo 'Utiliser un compte de test avec MFA deja configure. Deux sessions peuvent remplacer des sessions existantes.'
echo 'Un refus MFA volontaire sera inscrit dans les journaux. Aucun patient ne sera consulte.'
if [[ "$target" == coolify ]]; then
    read -r -p 'Tapez TESTER COOLIFY pour autoriser ce test distant : ' confirmation
    [[ "$confirmation" == 'TESTER COOLIFY' ]] || { echo 'Test annule.'; exit 1; }
fi
temporary="$(mktemp -d /tmp/clinia-mfa-replay.XXXXXXXX)"
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
    # Only the exact private directory created above is removed.
    rm -rf -- "$temporary"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stop() { echo "RESULTAT NON CONCLUANT : $1" >&2; exit 1; }
read -r -p "Identifiant du compte de test $target : " identifier
read -r -s -p 'Mot de passe (masque) : ' password
printf '\n'
printf '%s' "$identifier" > "$temporary/identifier"
printf '%s' "$password" > "$temporary/password"
unset identifier password
jq -n --rawfile identifier "$temporary/identifier" --rawfile password "$temporary/password" \
    '{username:$identifier,password:$password}' > "$temporary/login.json"

request() {
    local session="$1" payload="$2" endpoint="$3"
    status="$(curl --silent --show-error --max-time 20 --output "$temporary/$session.response" \
        --dump-header "$temporary/$session.response-headers" --write-out '%{http_code}' \
        --header 'Content-Type: application/json' --header "Origin: $origin" --header 'Cache-Control: no-store' \
        --cookie "$temporary/$session.cookies" --cookie-jar "$temporary/$session.cookies" \
        --data-binary "@$payload" "$api/$endpoint")"
    if [[ "$status" == 200 ]]; then
        # Record every created session immediately so all exit paths can log it out.
        jq -er '.data.accessToken | select(type == "string" and test("^[A-Za-z0-9_.-]+$")) | "Authorization: Bearer " + .' \
            "$temporary/$session.response" > "$temporary/$session.header" || stop 'Reponse de session inattendue.'
    fi
}
login() {
    local session="$1"
    request "$session" "$temporary/login.json" login
    echo "Connexion $session : HTTP $status — attendu 202 MFA"
    [[ "$status" == 202 ]] || stop 'MFA absent ou connexion refusee. Aucun nouvel essai automatique.'
    jq -e '.data.mfaRequired == true and .data.mfaEnrollmentRequired == false and (.data.mfaChallenge | type == "string" and length >= 32)' \
        "$temporary/$session.response" >/dev/null || stop 'Configurer le MFA dans le UI avant ce test (aucun enrollement automatique).'
    jq '{mfaChallenge:.data.mfaChallenge}' "$temporary/$session.response" > "$temporary/$session.challenge"
}
read_code() {
    read -r -s -p 'Code MFA (6 chiffres, masque) : ' mfa_code
    printf '\n'
    [[ "$mfa_code" =~ ^[0-9]{6}$ ]] || stop 'Format du code MFA invalide.'
    printf '%s' "$mfa_code" > "$temporary/$1"
    unset mfa_code
}
mfa() {
    local session="$1" code_file="$2"
    jq --rawfile code "$temporary/$code_file" '. + {code:$code}' "$temporary/$session.challenge" > "$temporary/mfa.json"
    request "$session" "$temporary/mfa.json" login/mfa
}
server_time() {
    local http_date
    http_date="$(awk 'tolower($1)=="date:" {sub(/^[^:]*: */, ""); sub(/\r$/, ""); value=$0} END {print value}' "$temporary/$1.response-headers")"
    [[ -n "$http_date" ]] || return 1
    date -u -d "$http_date" +%s 2>/dev/null
}

login a
echo 'Attendre un nouveau code dans votre authentificateur, puis le saisir rapidement.'
read_code first-code
started=$SECONDS
mfa a first-code
echo "Premier code dans A : HTTP $status — attendu 200"
[[ "$status" == 200 ]] || stop 'Premier code refuse.'
first_time="$(server_time a)" || stop 'Horodatage serveur absent ou invalide.'
login b
mfa b first-code
echo "Meme code dans B : HTTP $status — attendu 401 INVALID_MFA_CODE"
if [[ "$status" == 200 ]]; then
    echo 'FAILLE REPRODUITE : le meme code MFA a ete accepte avec un nouveau challenge.'
    exit 2
fi
[[ "$status" == 401 ]] || stop 'Refus inattendu (limitation, reseau ou challenge).'
jq -e '.error.code == "INVALID_MFA_CODE"' "$temporary/b.response" >/dev/null || stop 'Le refus ne correspond pas a un code MFA invalide.'
second_time="$(server_time b)" || stop 'Horodatage serveur absent ou invalide.'
# Reject ambiguous timing: same server TOTP window, two-second boundary margin,
# and a short local elapsed interval. An expired code must not count as protection.
if (( SECONDS - started > 10 || second_time < first_time ||
      (first_time - 2) / 30 != (second_time + 2) / 30 )); then
    stop 'Fenetre temporelle ambigue. Refaire le test avec un code qui vient de changer.'
fi
echo 'Attendre maintenant le prochain code DIFFERENT. Le saisir dans les quatre minutes.'
read_code next-code
cmp -s "$temporary/first-code" "$temporary/next-code" && stop 'Le deuxieme code doit etre different.'
mfa b next-code
echo "Nouveau code dans B : HTTP $status — attendu 200"
[[ "$status" == 200 ]] || stop 'Le nouveau code a ete refuse. Aucun nouvel essai automatique.'
echo 'PROTECTION CONFIRMEE : code reutilise refuse, nouveau code accepte sur le meme challenge.'
