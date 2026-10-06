#!/usr/bin/env bash
# Sourced by rebuild-local.sh. Does not alter Docker or the workspace on import.

rebuild_in_container() {
  [[ -f /.dockerenv || -f /run/.containerenv || "${REMOTE_CONTAINERS:-}" == true ]]
}

rebuild_check_tools() {
  local tool
  for tool in node npm curl lsof ps; do
    command -v "$tool" >/dev/null || {
      echo "ERREUR outil requis introuvable : $tool"
      return 1
    }
  done
  node -e 'if (process.versions.node.split(".")[0] !== "24") { console.error("Node 24 requis"); process.exit(1); }'
  docker compose version >/dev/null
}

rebuild_check_frontend_port() {
  # A Vite process in WSL cannot be stopped from a sibling PID namespace.
  # Refuse before CI/down instead of later accepting the old UI as a success.
  if node -e '
    const s = require("net").connect(Number(process.argv[1]), process.argv[2]);
    s.on("connect", () => { s.destroy(); process.exit(0); });
    s.on("error", () => process.exit(1));
    s.setTimeout(1000, () => { s.destroy(); process.exit(1); });
  ' "$STAGING_FRONTEND_PORT" "$STAGING_FRONTEND_HOST"; then
    local pid found=0
    while read -r pid; do
      [[ -n "$pid" ]] || continue
      if [[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" != "$ROOT_DIR/frontend" ]] ||
        [[ "$(ps -p "$pid" -o command= 2>/dev/null)" != *vite* ]]; then
        echo "ERREUR port $STAGING_FRONTEND_PORT utilise par un autre processus/checkout."
        return 1
      fi
      found=1
    done < <(lsof -tiTCP:"$STAGING_FRONTEND_PORT" -sTCP:LISTEN 2>/dev/null || true)
    if [[ "$found" == 0 ]]; then
      echo "ERREUR port $STAGING_FRONTEND_PORT occupe hors de cette session."
      echo 'Arreter le frontend dans son environnement WSL/DevContainer avant le rebuild.'
      return 1
    fi
  fi
}

rebuild_check_container_access() (
  rebuild_in_container || return 0

  # Integration tests publish disposable Mongo instances on host loopback.
  # Check the actual connection AND host-visible source paths before any CI/down.
  local marker probe_name probe_port response attempt
  marker="$(mktemp "$ROOT_DIR/.rebuild-probe.XXXXXX")"
  probe_name="clinia-rebuild-probe-$(basename "$marker" | tr '[:upper:]' '[:lower:]')-$$"
  cleanup_rebuild_probe() {
    docker rm -f "$probe_name" >/dev/null 2>&1 || true
    rm -f "$marker"
  }
  trap cleanup_rebuild_probe EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  printf '%s' "$probe_name" > "$marker"

  if ! docker run -d --name "$probe_name" \
    --mount "type=bind,source=$marker,target=/probe-token,readonly" \
    --publish 127.0.0.1::18765 \
    node:24-bookworm node -e '
      const token = require("fs").readFileSync("/probe-token", "utf8");
      require("http").createServer((req, res) => res.end(token)).listen(18765, "0.0.0.0");
    ' >/dev/null; then
    echo 'ERREUR le moteur Docker doit voir le checkout au meme chemin que le DevContainer.'
    echo 'Voir docs/devcontainer-staging.md (montage du workspace).'
    return 1
  fi
  probe_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "18765/tcp") 0).HostPort}}' "$probe_name")"
  for attempt in {1..10}; do
    response="$(curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:$probe_port" 2>/dev/null || true)"
    if [[ "$response" == "$probe_name" ]]; then
      echo 'OK DevContainer : fichiers partages et ports Docker sur localhost accessibles.'
      return 0
    fi
    sleep 1
  done
  echo 'ERREUR les ports Docker de localhost ne sont pas accessibles depuis ce conteneur.'
  echo 'Configurer --network=host et, dans Docker Desktop, Enable host networking.'
  echo 'Voir docs/devcontainer-staging.md. Aucun conteneur staging arrete.'
  return 1
)
