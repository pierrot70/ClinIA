#!/usr/bin/env bash
# Local interactive client. No SSH, no database credentials, no .env loading.
set +x
set -euo pipefail
umask 077
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for command in node curl bash; do
    command -v "$command" >/dev/null || { echo "Commande manquante : $command" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' || {
    echo 'Node 24 ou plus requis.' >&2; exit 1;
}
exec node "$root/scripts/auth-admin-reset-smoke.mjs" "$@"
