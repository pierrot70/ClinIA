#!/usr/bin/env bash
# Shared checks for local validation and GitHub Actions.
# Full pre-commit validation: bash scripts/ci-local.sh
# GitHub runs the same steps individually: ci-local.sh backend|frontend STEP.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-all}"
step="${2:-all}"
[[ $# -le 2 ]] || { echo 'Usage: bash scripts/ci-local.sh [all|backend|frontend] [step]' >&2; exit 2; }
case "$target:$step" in
    all:all|backend:all|frontend:all|backend:install|frontend:install|backend:audit|frontend:audit|backend:tests|frontend:tests|backend:reauth|backend:mongo|backend:integration|frontend:build) ;;
    *) echo 'Unknown CI target or step.' >&2; exit 2 ;;
esac
[[ "${NODE_ENV:-}" != production ]] || { echo 'Run CI on a development or validation host.' >&2; exit 1; }
node -e 'if (process.versions.node.split(".")[0] !== "24") { console.error("Node 24 is required, as in GitHub Actions."); process.exit(1); }'
export CI=true

check_docker() {
    local endpoint
    endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
    [[ "$endpoint" == unix://* ]] || { echo 'A local Docker Unix socket is required.' >&2; exit 1; }
    docker version --format '{{.Server.Version}}' >/dev/null
}

run_step() (
    local component="$1" phase="$2"
    cd "$root/$component"
    if [[ "$component" == backend ]]; then export TZ=America/Toronto; else export TZ=UTC; fi
    printf '\nCI %s / %s\n' "$component" "$phase"
    case "$phase" in
        install) npm ci --no-audit ;;
        audit) node "$root/scripts/verify-npm-audit.mjs" ;;
        tests) npm test -- --run ;;
        reauth) npm test -- --run services/__tests__/auth.service.test.js --sequence.shuffle --sequence.seed=3 ;;
        mongo) check_docker; docker pull mongo:7 ;;
        integration) npm run test:validation-report ;;
        build) npm run build ;;
    esac
)

run_component() {
    local component="$1" phase
    local -a phases=(install audit tests build)
    if [[ "$component" == backend ]]; then phases=(install audit tests reauth mongo integration); fi
    for phase in "${phases[@]}"; do run_step "$component" "$phase"; done
}

if [[ "$target" == all ]]; then
    # Fail before reinstalling dependencies if integration cannot run locally.
    check_docker
    run_component frontend
    run_component backend
    echo 'CI_LOCAL_PASSED: frontend, backend, audits, build and integration.'
elif [[ "$step" == all ]]; then
    run_component "$target"
    printf 'CI_COMPONENT_PASSED: %s (not the full CI).\n' "$target"
else
    run_step "$target" "$step"
fi
