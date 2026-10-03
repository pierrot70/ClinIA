#!/usr/bin/env bash
# Run from the VS Code/WSL terminal; no deployed database or SMTP connection.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# == 0 ]] || { echo 'Usage: bash scripts/test-auth-recovery-local.sh'; exit 2; }
for command in node docker curl; do
    command -v "$command" >/dev/null || { echo "Commande manquante : $command" >&2; exit 1; }
done
node -e 'if (process.versions.node.split(".")[0] !== "24") { console.error("Node 24 requis."); process.exit(1); }'
[[ "${NODE_ENV:-}" != production ]] || { echo 'Refus : NODE_ENV=production.' >&2; exit 1; }
[[ -x "$root/backend/node_modules/.bin/vitest" ]] || {
    echo 'Installer les dépendances locales : npm --prefix backend ci' >&2; exit 1;
}
endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
[[ "$endpoint" == unix://* ]] || { echo 'Un moteur Docker local est requis.' >&2; exit 1; }
docker version --format '{{.Server.Version}}' >/dev/null
docker image inspect mongo:7 >/dev/null 2>&1 || {
    echo 'Préparer MongoDB : docker pull mongo:7' >&2; exit 1;
}
echo 'TEST LOCAL — MongoDB jetable, comptes synthétiques, courriels simulés.'
echo 'Aucun appel à Coolify, Brevo ou à la base applicative ; ports locaux aléatoires.'
bash "$root/scripts/run-urgentologist-walk-in-integration.sh" --recovery-security
echo 'AUTH_RECOVERY_LOCAL_PASSED — ne constitue pas une vérification du déploiement.'
