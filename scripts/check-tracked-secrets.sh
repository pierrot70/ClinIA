#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

failures=""

check_pattern() {
  local description="$1"
  local pattern="$2"
  local matches

  matches="$(git grep -n -E "$pattern" -- '*.yml' '*.yaml' '*.js' '*.cjs' '*.sh' '.env.example' ':!scripts/check-tracked-secrets.sh' 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    failures+=$'\n'"$description"$'\n'"$matches"$'\n'
  fi
}

check_pattern \
  "Previously exposed Mongo credential detected." \
  '321eRRe|example123'

matches="$(git grep -n -E '^[[:space:]]*(MONGO_URI|ME_CONFIG_MONGODB_URL):[[:space:]]*["'\'']?mongodb(\+srv)?://' -- '*.yml' '*.yaml' 2>/dev/null || true)"
if [[ -n "$matches" ]]; then
  failures+=$'\nHard-coded Mongo URI detected in Compose.\n'"$matches"$'\n'
fi

matches="$(git grep -n -E '^[[:space:]]*(MONGO_INITDB_ROOT_PASSWORD|ME_CONFIG_BASICAUTH_PASSWORD|JWT_SECRET):' -- '*.yml' '*.yaml' 2>/dev/null | grep -Fv '${' || true)"
if [[ -n "$matches" ]]; then
  failures+=$'\nHard-coded Compose password detected.\n'"$matches"$'\n'
fi

if [[ -n "$failures" ]]; then
  echo "Refusing to continue: tracked secrets or credentials were detected." >&2
  printf '%s' "$failures" >&2
  echo "Move secret values to .env locally or Coolify secrets in production." >&2
  exit 1
fi

echo "Tracked secret check passed."
