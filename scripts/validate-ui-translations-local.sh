#!/usr/bin/env bash
# Local/offline translation checks only. No install, Docker mutation, seed or push.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "${NODE_ENV:-}" != production ]] || { echo 'Translation validation must run locally.' >&2; exit 1; }
cd "$root"
node --test scripts/verify-ui-translations.test.mjs
node scripts/verify-login-translation-catalog.mjs
node scripts/verify-ui-translations.mjs --check --baseline scripts/ui-translations-exceptions.json --output /tmp/clinia-ui-translations-audit.json
node scripts/verify-ui-translation-coverage.mjs --check --output /tmp/clinia-ui-translation-coverage.json
cd "$root/frontend"
npm test
npm run build
cd "$root/backend"
npx --no-install vitest run routes/__tests__/translation.routes.test.js services/__tests__/translationService.test.js services/__tests__/approvedUiTranslationSeeder.test.js services/__tests__/uiTranslationPayload.test.js
echo 'UI_TRANSLATION_LOCAL_TESTS_PASSED (review coverage report separately)'
