#!/usr/bin/env bash
# Deterministic preflight regressions: no real Docker mutations or downloads.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$root/scripts/lib/rebuild-environment.sh"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export ROOT_DIR="$scratch"
log="$scratch/docker.log"
scenario=ok
docker() {
  printf '%s\n' "$1" >> "$log"
  case "$1" in
    run) [[ "$scenario" != mount_failure ]] ;;
    inspect) printf '12345\n' ;;
    rm) return 0 ;;
    *) return 1 ;;
  esac
}
curl() {
  [[ "$scenario" != network_failure ]] || return 1
  cat "$ROOT_DIR"/.rebuild-probe.*
}
sleep() { :; }
rebuild_in_container() { return 1; }
rebuild_check_container_access
[[ ! -e "$log" ]] # WSL does not need a sibling-container probe.
rebuild_in_container() { return 0; }
for scenario in ok mount_failure network_failure; do
  : > "$log"
  if rebuild_check_container_access > "$scratch/output" 2>&1; then
    [[ "$scenario" == ok ]]
  else
    [[ "$scenario" != ok ]]
  fi
  [[ "$(tail -1 "$log")" == rm ]]
  [[ -z "$(find "$scratch" -name '.rebuild-probe.*' -print -quit)" ]]
done
STAGING_FRONTEND_PORT=5174
STAGING_FRONTEND_HOST=127.0.0.1
node() { return 0; } # Port occupied in another PID namespace.
lsof() { return 0; }
if rebuild_check_frontend_port > "$scratch/output"; then
  echo 'FAIL: invisible frontend listener accepted' >&2
  exit 1
fi
node() { return 1; } # Free port.
rebuild_check_frontend_port
echo 'REBUILD_ENVIRONMENT_TESTS_PASSED (WSL, DevContainer, mount/network failures, cleanup, port conflict)'
