#!/usr/bin/env bash
# Interactive test: never prints passwords, OTPs, tokens or response bodies.
set -euo pipefail
set +x
umask 077
[[ $# -le 2 ]] || { echo 'Usage: bash scripts/test-mfa-replay.sh [staging|staging-pair|coolify|coolify-pair] [--concurrent]' >&2; exit 1; }
target="${1:-staging}"
mode="${2:-sequential}"
[[ "$mode" == sequential || "$mode" == --concurrent ]] || { echo 'Option invalide.' >&2; exit 1; }
workers=()
case "$target" in
    staging) api=http://localhost:4002/api/auth; protocol='=http'; origin=http://localhost:5174 ;;
    staging-pair) api=http://localhost:4002/api/auth; protocol='=http'; origin=http://localhost:5174 ;;
    coolify) api=https://clinique-ai.ca/api/auth; protocol='=https'; origin=https://clinique-ai.ca ;;
    coolify-pair) api=http://localhost:4102/api/auth; protocol='=http'; origin=https://clinique-ai.ca ;;
    *) echo 'Cible invalide : staging, staging-pair, coolify ou coolify-pair uniquement.' >&2; exit 1 ;;
esac
api_a="$api"
api_b="$api"
[[ "$target" != staging-pair ]] || api_b=http://localhost:4003/api/auth
if [[ "$target" == coolify-pair ]]; then
    api_b=http://localhost:4103/api/auth
    expected_a="${CLINIA_EXPECTED_INSTANCE_A:-}"
    expected_b="${CLINIA_EXPECTED_INSTANCE_B:-}"
    [[ "$expected_a" =~ ^[A-Za-z0-9_-]{1,128}$ && "$expected_b" =~ ^[A-Za-z0-9_-]{1,128}$ && "$expected_a" != "$expected_b" ]] || {
        echo 'Deux identifiants distincts CLINIA_EXPECTED_INSTANCE_A/B sont requis.' >&2; exit 1;
    }
fi
mfa_passed=false
for dependency in curl jq date awk cmp; do command -v "$dependency" >/dev/null; done
curl() { command curl -q --proto "$protocol" --noproxy "*" --connect-timeout 5 "$@"; }
echo "Cible : $target ($origin)"
echo 'Utiliser un compte de test avec MFA deja configure. Deux sessions peuvent remplacer des sessions existantes.'
echo 'Un refus MFA volontaire sera inscrit dans les journaux. Aucun patient ne sera consulte.'
if [[ "$target" == coolify || "$target" == coolify-pair ]]; then
    if [[ "$target" == coolify-pair ]]; then
        echo 'PRODUCTION via tunnels SSH locaux 4102/4103 : garder les tunnels ouverts. Proxy HTTPS non teste.'
    fi
    read -r -p 'Tapez TESTER COOLIFY pour autoriser ce test distant : ' confirmation
    [[ "$confirmation" == 'TESTER COOLIFY' ]] || { echo 'Test annule.'; exit 1; }
fi
temporary="$(mktemp -d /tmp/clinia-mfa-replay.XXXXXXXX)"
cleanup() {
    local result=$? session logout_api logout_status
    trap - EXIT
    # Requests have bounded timeouts. Reap workers before reading tokens or deleting files.
    for worker in "${workers[@]}"; do wait "$worker" 2>/dev/null || { [[ "$result" -ne 0 ]] || result=1; }; done
    for session in a b; do
        logout_api="$api_a"
        [[ "$session" != b ]] || logout_api="$api_b"
        if [[ -s "$temporary/$session.header" ]]; then
            if ! logout_status="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
                --request POST --header "Origin: $origin" --header "@$temporary/$session.header" \
                --cookie "$temporary/$session.cookies" "$logout_api/logout")" || [[ "$logout_status" != 200 ]]; then
                echo "Attention : deconnexion de la session $session non confirmee." >&2
                [[ "$result" -ne 0 ]] || result=1
            fi
        fi
    done
    # Only the exact private directory created above is removed.
    rm -rf -- "$temporary"
    if [[ "$result" == 0 && "$mfa_passed" == true ]]; then
        if [[ "$mode" == --concurrent ]]; then
            echo 'MFA_CONCURRENT_PASSED : deux requetes lancees en parallele, une seule acceptation ; nouveau code accepte et sessions deconnectees.'
            if [[ "$target" == coolify-pair ]]; then
                echo 'COOLIFY_MFA_PAIR_PASSED : deux instances distinctes verifiees via tunnels SSH, hors proxy HTTPS.'
            fi
            echo 'Limite : chevauchement observe cote client, execution simultanee cote serveur non prouvee ; via le proxy Coolify, instances distinctes non garanties.'
        else
            echo 'PROTECTION CONFIRMEE : code reutilise refuse, nouveau code accepte sur le meme challenge.'
        fi
        if [[ "$target" == staging-pair && "$mode" == sequential ]]; then
            echo 'STAGING_MFA_PAIR_PASSED : rejeu MFA refuse entre instances ; sessions de test deconnectees.'
        fi
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stop() { echo "RESULTAT NON CONCLUANT : $1" >&2; exit 1; }
check_instances() {
    local instance endpoint expected
    for instance in a b; do
        endpoint="$api_a"; expected=mongo-rs-test-backend
        if [[ "$instance" == b ]]; then endpoint="$api_b"; expected=mongo-rs-test-backend-replica; fi
        if [[ "$target" == coolify-pair ]]; then
            expected="$expected_a"; [[ "$instance" != b ]] || expected="$expected_b"
        fi
        curl --fail --silent --show-error --max-time 10 --output "$temporary/ready.json" "${endpoint%/auth}/health/ready"
        jq -e --arg expected "$expected" '.data.status == "ok" and .data.dependencies.mongo == "connected" and .meta.instanceId == $expected' "$temporary/ready.json" >/dev/null || stop 'Instances attendues non confirmees ; controle interrompu.'
    done
}
if [[ "$target" == staging-pair || "$target" == coolify-pair ]]; then
    check_instances
    if [[ "$target" == staging-pair ]]; then
        echo 'Instances STAGING 4002 et 4003 confirmees. Aucun test navigateur ou proxy Coolify.'
    else
        echo "Instances Coolify confirmees : A=$expected_a ; B=$expected_b."
    fi
fi
read -r -p "Identifiant du compte de test $target : " identifier
read -r -s -p 'Mot de passe (masque) : ' password
printf '\n'
printf '%s' "$identifier" > "$temporary/identifier"
printf '%s' "$password" > "$temporary/password"
unset identifier password
jq -n --rawfile identifier "$temporary/identifier" --rawfile password "$temporary/password" \
    '{username:$identifier,password:$password}' > "$temporary/login.json"

request() {
    local session="$1" payload="$2" endpoint="$3" api="$api_a"
    [[ "$session" != b ]] || api="$api_b"
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
    jq --rawfile code "$temporary/$code_file" '. + {code:$code}' "$temporary/$session.challenge" > "$temporary/$session.mfa.json"
    request "$session" "$temporary/$session.mfa.json" login/mfa
}
server_time() {
    local http_date
    http_date="$(awk 'tolower($1)=="date:" {sub(/^[^:]*: */, ""); sub(/\r$/, ""); value=$0} END {print value}' "$temporary/$1.response-headers")"
    [[ -n "$http_date" ]] || return 1
    date -u -d "$http_date" +%s 2>/dev/null
}

if [[ "$mode" == --concurrent ]]; then
    login a
    # One active challenge per account: both requests must submit the same challenge.
    cp "$temporary/a.challenge" "$temporary/b.challenge"
    cp "$temporary/a.cookies" "$temporary/b.cookies"
    echo 'Attendre un nouveau code, puis le saisir rapidement : deux requetes seront lancees en parallele.'
    read_code first-code
    # Build separate payloads before starting either request.
    for session in a b; do
        jq --rawfile code "$temporary/first-code" '. + {code:$code}' "$temporary/$session.challenge" > "$temporary/$session.mfa.json"
    done
    parallel_request() {
        local session="$1"
        date +%s%3N > "$temporary/$session.start"
        request "$session" "$temporary/$session.mfa.json" login/mfa
        date +%s%3N > "$temporary/$session.end"
        printf '%s' "$status" > "$temporary/$session.status"
    }
    started=$SECONDS
    parallel_request a & workers+=("$!")
    parallel_request b & workers+=("$!")
    worker_failed=false
    for worker in "${workers[@]}"; do wait "$worker" || worker_failed=true; done
    workers=()
    [[ "$worker_failed" == false ]] || stop 'Erreur reseau ou reponse inattendue ; aucune relance automatique.'
    status_a="$(cat "$temporary/a.status")"
    status_b="$(cat "$temporary/b.status")"
    echo "MFA parallele A : HTTP $status_a"
    echo "MFA parallele B : HTTP $status_b"
    if [[ "$status_a" == 200 && "$status_b" == 200 ]]; then
        echo 'FAILLE REPRODUITE : deux acceptations du meme challenge MFA.'
        exit 2
    fi
    loser=b
    if [[ "$status_a" == 401 && "$status_b" == 200 ]]; then loser=a
    elif [[ "$status_a" != 200 || "$status_b" != 401 ]]; then stop 'Attendu : exactement un 200 et un 401.'; fi
    refusal="$(jq -r '.error.code // "UNKNOWN"' "$temporary/$loser.response")"
    case "$refusal" in
        INVALID_MFA_CHALLENGE|INVALID_MFA_CODE) echo "Refus MFA : $refusal" ;;
        *) stop 'Refus inattendu (code non reconnu).' ;;
    esac
    start_a="$(cat "$temporary/a.start")"; start_b="$(cat "$temporary/b.start")"
    end_a="$(cat "$temporary/a.end")"; end_b="$(cat "$temporary/b.end")"
    (( start_a < end_b && start_b < end_a )) || stop 'Requetes non chevauchantes cote client.'
    first_time="$(server_time a)" || stop 'Horodatage serveur absent.'
    second_time="$(server_time b)" || stop 'Horodatage serveur absent.'
    earliest=$first_time; latest=$second_time
    if (( earliest > latest )); then earliest=$second_time; latest=$first_time; fi
    (( SECONDS - started <= 10 && (earliest - 2) / 30 == (latest + 2) / 30 )) || stop 'Fenetre temporelle ambigue ; reprendre avec un nouveau code.'
    # The shared challenge was consumed by the winner; create a new one for the control.
    login "$loser"
    echo "Attendre le prochain code DIFFERENT pour le nouveau challenge de $loser. Le saisir dans les quatre minutes."
    read_code next-code
    cmp -s "$temporary/first-code" "$temporary/next-code" && stop 'Le deuxieme code doit etre different.'
    mfa "$loser" next-code
    echo "Nouveau code dans $loser : HTTP $status — attendu 200"
    [[ "$status" == 200 ]] || stop 'Nouveau code refuse sur le nouveau challenge.'
    [[ "$target" != coolify-pair ]] || check_instances
    mfa_passed=true
    exit 0
fi

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
[[ "$target" != coolify-pair ]] || check_instances
mfa_passed=true
