#!/usr/bin/env bash

set -euo pipefail

BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-./backups/mongo}"
MONGO_CONTAINER="${MONGO_CONTAINER:-}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-}"
MONGO_CONTAINER_EXCLUDE_PATTERN="${MONGO_CONTAINER_EXCLUDE_PATTERN:-mongo-express}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-root}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"
MONGO_DATABASE="${MONGO_DATABASE:-}"
MONGO_URI="${MONGO_URI:-}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-mongo}"
MIN_AVAILABLE_KB="${MIN_AVAILABLE_KB:-1048576}"

fail() {
  printf 'ERROR %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'INFO %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "command_not_found command=$1"
}

resolve_container() {
  if [[ -n "$MONGO_CONTAINER" ]]; then
    printf '%s\n' "$MONGO_CONTAINER"
    return
  fi

  docker ps --format '{{.Names}}' |
    awk -v prefix="$MONGO_CONTAINER_PREFIX" -v exclude="$MONGO_CONTAINER_EXCLUDE_PATTERN" '
      index($1, prefix) == 1 && (exclude == "" || index($1, exclude) == 0) {
        print $1
        found = 1
        exit
      }
      END { if (!found) exit 1 }
    '
}

load_root_password_from_container() {
  local container="$1"

  docker inspect "$container" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
    tail -n1
}

archive_db_argument() {
  if [[ -n "$MONGO_DATABASE" ]]; then
    printf -- '--db=%s' "$MONGO_DATABASE"
  fi
}

require_command docker
require_command gzip
require_command sha256sum
require_command stat

if ! docker info >/dev/null 2>&1; then
  fail 'docker_unavailable'
fi

container="$(resolve_container)" || fail "mongo_container_not_found prefix=$MONGO_CONTAINER_PREFIX"

if ! docker inspect "$container" >/dev/null 2>&1; then
  fail "mongo_container_not_found name=$container"
fi

mkdir -p "$BACKUP_OUTPUT_DIR"

available_kb="$(df -P "$BACKUP_OUTPUT_DIR" | awk 'NR == 2 { print $4 }')"
if [[ -z "$available_kb" || "$available_kb" -lt "$MIN_AVAILABLE_KB" ]]; then
  fail "insufficient_disk output_dir=$BACKUP_OUTPUT_DIR available_kb=${available_kb:-unknown} required_kb=$MIN_AVAILABLE_KB"
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
archive_name="${BACKUP_LABEL}-${timestamp}.archive.gz"
container_archive_path="/tmp/${archive_name}"
host_archive_path="${BACKUP_OUTPUT_DIR%/}/${archive_name}"
host_sha_path="${host_archive_path}.sha256"
host_manifest_path="${host_archive_path}.manifest.json"

db_arg="$(archive_db_argument)"

info "container=$container"
info "output=$host_archive_path"

if [[ -n "$MONGO_URI" ]]; then
  info 'auth=uri'
  docker exec \
    -e MONGO_URI="$MONGO_URI" \
    -e CONTAINER_ARCHIVE_PATH="$container_archive_path" \
    -e MONGO_DATABASE="$MONGO_DATABASE" \
    "$container" \
    sh -lc 'db_arg=""; if [ -n "$MONGO_DATABASE" ]; then db_arg="--db=$MONGO_DATABASE"; fi; mongodump --uri="$MONGO_URI" $db_arg --archive="$CONTAINER_ARCHIVE_PATH" --gzip'

  if [[ -n "$MONGO_DATABASE" ]]; then
    docker exec \
      -e MONGO_URI="$MONGO_URI" \
      -e MONGO_DATABASE="$MONGO_DATABASE" \
      "$container" \
      sh -lc 'mongosh "$MONGO_URI" --quiet --eval "
        const databaseName = process.env.MONGO_DATABASE;
        const target = db.getSiblingDB(databaseName);
        const collections = target.getCollectionNames().sort();
        const collectionStats = collections.map((name) => ({
          name,
          documentCount: target.getCollection(name).countDocuments()
        }));
        print(JSON.stringify({
          databaseName,
          generatedAt: new Date().toISOString(),
          collectionCount: collectionStats.length,
          documentCount: collectionStats.reduce((sum, entry) => sum + entry.documentCount, 0),
          collections: collectionStats
        }));
      "' > "$host_manifest_path"
  fi
else
  if [[ -z "$MONGO_ROOT_PASSWORD" ]]; then
    MONGO_ROOT_PASSWORD="$(load_root_password_from_container "$container")"
  fi

  if [[ -z "$MONGO_ROOT_PASSWORD" ]]; then
    fail 'missing_mongo_root_password set MONGO_URI or MONGO_ROOT_PASSWORD'
  fi

  info "auth=root username=$MONGO_ROOT_USERNAME auth_db=$MONGO_AUTH_DB"
  docker exec \
    -e MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
    -e MONGO_ROOT_PASSWORD="$MONGO_ROOT_PASSWORD" \
    -e MONGO_AUTH_DB="$MONGO_AUTH_DB" \
    -e CONTAINER_ARCHIVE_PATH="$container_archive_path" \
    -e MONGO_DATABASE="$MONGO_DATABASE" \
    "$container" \
    sh -lc 'db_arg=""; if [ -n "$MONGO_DATABASE" ]; then db_arg="--db=$MONGO_DATABASE"; fi; mongodump --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" --authenticationDatabase "$MONGO_AUTH_DB" $db_arg --archive="$CONTAINER_ARCHIVE_PATH" --gzip'

  if [[ -n "$MONGO_DATABASE" ]]; then
    docker exec \
      -e MONGO_ROOT_USERNAME="$MONGO_ROOT_USERNAME" \
      -e MONGO_ROOT_PASSWORD="$MONGO_ROOT_PASSWORD" \
      -e MONGO_AUTH_DB="$MONGO_AUTH_DB" \
      -e MONGO_DATABASE="$MONGO_DATABASE" \
      "$container" \
      sh -lc 'mongosh --quiet --username="$MONGO_ROOT_USERNAME" --password="$MONGO_ROOT_PASSWORD" --authenticationDatabase "$MONGO_AUTH_DB" --eval "
        const databaseName = process.env.MONGO_DATABASE;
        const target = db.getSiblingDB(databaseName);
        const collections = target.getCollectionNames().sort();
        const collectionStats = collections.map((name) => ({
          name,
          documentCount: target.getCollection(name).countDocuments()
        }));
        print(JSON.stringify({
          databaseName,
          generatedAt: new Date().toISOString(),
          collectionCount: collectionStats.length,
          documentCount: collectionStats.reduce((sum, entry) => sum + entry.documentCount, 0),
          collections: collectionStats
        }));
      "' > "$host_manifest_path"
  fi
fi

docker cp "$container:$container_archive_path" "$host_archive_path"
docker exec "$container" rm -f "$container_archive_path" >/dev/null 2>&1 || true

chmod 600 "$host_archive_path"
sha256sum "$host_archive_path" > "$host_sha_path"
chmod 600 "$host_sha_path"

if [[ -f "$host_manifest_path" ]]; then
  chmod 600 "$host_manifest_path"
fi

gzip -t "$host_archive_path"

size_bytes="$(stat -c '%s' "$host_archive_path")"
permissions="$(stat -c '%a' "$host_archive_path")"

info "archive=$host_archive_path"
info "sha256_file=$host_sha_path"
if [[ -f "$host_manifest_path" ]]; then
  info "manifest_file=$host_manifest_path"
fi
info "size_bytes=$size_bytes permissions=$permissions"
info 'gzip=ok'
info 'backup=ok'
