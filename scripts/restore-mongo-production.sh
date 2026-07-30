#!/usr/bin/env bash

set -euo pipefail

BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-/var/backups/clinia/mongo}"
BACKUP_KEEP_DIR="${BACKUP_KEEP_DIR:-/var/backups/clinia/mongo-keep}"
BACKUP_LABEL="${BACKUP_LABEL:-clinia-prod}"
RESTORE_ARCHIVE="${RESTORE_ARCHIVE:-}"
RESTORE_SELECTION="${RESTORE_SELECTION:-latest}"
MONGO_DATABASE="${MONGO_DATABASE:-clinia}"
MONGO_CONTAINER_PREFIX="${MONGO_CONTAINER_PREFIX:-mongo-gko400wwcs44csw8000o0sss-}"
MONGO_REPLICA_1_PREFIX="${MONGO_REPLICA_1_PREFIX:-mongo-replica-1-}"
MONGO_REPLICA_2_PREFIX="${MONGO_REPLICA_2_PREFIX:-mongo-replica-2-}"
BACKEND_PREFIX="${BACKEND_PREFIX:-backend-}"
BACKEND_REPLICA_PREFIX="${BACKEND_REPLICA_PREFIX:-backend-replica-}"
CONFIRM_RESTORE_PRODUCTION="${CONFIRM_RESTORE_PRODUCTION:-}"
HEALTH_READY_URL="${HEALTH_READY_URL:-https://clinique-ai.ca/api/health/ready}"
DB_STATUS_URL="${DB_STATUS_URL:-https://clinique-ai.ca/api/db-status}"
DB_STATUS_BEARER_TOKEN="${DB_STATUS_BEARER_TOKEN:-}"
REPLICA_WAIT_ATTEMPTS="${REPLICA_WAIT_ATTEMPTS:-60}"
REPLICA_WAIT_SECONDS="${REPLICA_WAIT_SECONDS:-10}"
HTTP_WAIT_ATTEMPTS="${HTTP_WAIT_ATTEMPTS:-30}"
HTTP_WAIT_SECONDS="${HTTP_WAIT_SECONDS:-10}"
BACKUP_AGE_IDENTITY_FILE="${BACKUP_AGE_IDENTITY_FILE:-}"
RESTORE_WORKING_ARCHIVE=""
RESTORE_WORKING_ARCHIVE_IS_TEMPORARY=false

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

backup_archive_query() {
  local sort_order="$1"

  find "$BACKUP_OUTPUT_DIR" \
    -maxdepth 1 \
    -type f \
    \( -name "${BACKUP_LABEL}-*.archive.gz" -o -name "${BACKUP_LABEL}-*.archive.gz.age" \) \
    -printf '%T@ %p\n' |
    sort "$sort_order"
}

latest_backup_archive() {
  backup_archive_query "-nr" |
    awk 'NR == 1 { $1=""; sub(/^ /, ""); print }'
}

oldest_backup_archive() {
  backup_archive_query "-n" |
    awk 'NR == 1 { $1=""; sub(/^ /, ""); print }'
}

protected_backup_archive() {
  local sort_order="$1"
  local line archive_path archive_name

  while IFS= read -r line; do
    archive_path="${line#* }"
    archive_name="$(basename "$archive_path")"

    if [[ -f "${BACKUP_KEEP_DIR%/}/${archive_name}.keep" ]]; then
      printf '%s\n' "$archive_path"
      return
    fi
  done < <(backup_archive_query "$sort_order")
}

selected_backup_archive() {
  if [[ -n "$RESTORE_ARCHIVE" ]]; then
    printf '%s\n' "$RESTORE_ARCHIVE"
    return
  fi

  case "$RESTORE_SELECTION" in
    latest)
      latest_backup_archive
      ;;
    oldest)
      oldest_backup_archive
      ;;
    protected | protected-newest)
      protected_backup_archive "-nr"
      ;;
    protected-oldest)
      protected_backup_archive "-n"
      ;;
    *)
      fail "invalid_restore_selection value=$RESTORE_SELECTION expected=latest,oldest,protected-newest,protected-oldest"
      ;;
  esac
}

running_backend_containers() {
  docker ps --format '{{.Names}}' |
    awk -v backend="$BACKEND_PREFIX" -v replica="$BACKEND_REPLICA_PREFIX" '
      index($1, backend) == 1 || index($1, replica) == 1 {
        print $1
      }
    '
}

mongo_containers() {
  docker ps --format '{{.Names}}' |
    awk -v primary="$MONGO_CONTAINER_PREFIX" -v replica1="$MONGO_REPLICA_1_PREFIX" -v replica2="$MONGO_REPLICA_2_PREFIX" '
      index($1, primary) == 1 || index($1, replica1) == 1 || index($1, replica2) == 1 {
        print $1
      }
    '
}

load_root_password() {
  local container="$1"

  docker inspect "$container" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
    tail -n1
}

find_primary_container() {
  local container

  for container in "$@"; do
    if docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$container" \
      sh -c 'mongosh --quiet \
        --username root \
        --password="$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.hello().isWritablePrimary === true"' |
      grep -q 'true'; then
      printf '%s\n' "$container"
      return 0
    fi
  done

  return 1
}

verify_selected_archive() {
  local archive="$1"

  [[ -f "$archive" ]] || fail "archive_not_found path=$archive"
  [[ -f "${archive}.sha256" ]] || fail "sha256_file_not_found path=${archive}.sha256"

  sha256sum -c "${archive}.sha256"

  if [[ "$archive" == *.archive.gz.age ]]; then
    require_command age
    [[ -n "$BACKUP_AGE_IDENTITY_FILE" ]] ||
      fail 'missing_age_identity_file set BACKUP_AGE_IDENTITY_FILE to a temporary private age identity for this restore'
    [[ -f "$BACKUP_AGE_IDENTITY_FILE" ]] || fail "age_identity_not_found path=$BACKUP_AGE_IDENTITY_FILE"
    [[ "$(stat -c '%a' "$BACKUP_AGE_IDENTITY_FILE")" == '600' ]] ||
      fail "unexpected_age_identity_permissions path=$BACKUP_AGE_IDENTITY_FILE expected=600"
  else
    gzip -t "$archive"
  fi
}

materialize_restore_archive() {
  local archive="$1"

  if [[ "$archive" != *.archive.gz.age ]]; then
    RESTORE_WORKING_ARCHIVE="$archive"
    return
  fi

  RESTORE_WORKING_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/clinia-restore.XXXXXX.archive.gz")"
  RESTORE_WORKING_ARCHIVE_IS_TEMPORARY=true
  chmod 600 "$RESTORE_WORKING_ARCHIVE"
  age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" "$archive" > "$RESTORE_WORKING_ARCHIVE"
  gzip -t "$RESTORE_WORKING_ARCHIVE"
  info 'restore_archive_decryption=gzip_ok'
}

cleanup_restore_working_archive() {
  if [[ "$RESTORE_WORKING_ARCHIVE_IS_TEMPORARY" == "true" && -n "$RESTORE_WORKING_ARCHIVE" ]]; then
    rm -f "$RESTORE_WORKING_ARCHIVE"
  fi
}

stop_backends() {
  mapfile -t STOPPED_BACKENDS < <(running_backend_containers)

  if [[ "${#STOPPED_BACKENDS[@]}" -eq 0 ]]; then
    info 'backend_stop=skipped reason=no_running_backend_containers'
    return
  fi

  info "backend_stop containers=${STOPPED_BACKENDS[*]}"
  docker stop "${STOPPED_BACKENDS[@]}"
}

start_backends() {
  if [[ "${#STOPPED_BACKENDS[@]}" -eq 0 ]]; then
    info 'backend_start=skipped reason=no_previously_running_backend_containers'
    return
  fi

  info "backend_start containers=${STOPPED_BACKENDS[*]}"
  docker start "${STOPPED_BACKENDS[@]}"
}

restore_archive_to_primary() {
  local archive="$1"
  local primary_container="$2"
  local remote_archive="/tmp/clinia-production-restore.archive.gz"

  docker cp "$archive" "$primary_container:$remote_archive"

  docker exec \
    -e MONGO_PASSWORD="$MONGO_PASSWORD" \
    "$primary_container" \
    sh -c 'mongorestore \
      --username root \
      --password="$MONGO_PASSWORD" \
      --authenticationDatabase admin \
      --archive=/tmp/clinia-production-restore.archive.gz \
      --gzip \
      --drop \
      --nsFrom="'"$MONGO_DATABASE"'.*" \
      --nsTo="'"$MONGO_DATABASE"'.*"'

  docker exec "$primary_container" rm -f "$remote_archive" >/dev/null 2>&1 || true
}

validate_collections() {
  local primary_container="$1"

  docker exec \
    -e MONGO_PASSWORD="$MONGO_PASSWORD" \
    "$primary_container" \
    sh -c 'mongosh --quiet \
      --username root \
      --password="$MONGO_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const databaseName = \"'"$MONGO_DATABASE"'\";
        const target = db.getSiblingDB(databaseName);
        const collections = target.getCollectionNames().sort();
        const counts = collections.map((name) => ({
          collection: name,
          count: target.getCollection(name).countDocuments()
        }));
        printjson({ databaseName, collectionCount: collections.length, counts });
        if (collections.length === 0) quit(2);
      "'
}

wait_for_replica_set() {
  local primary_container="$1"
  local attempt

  for attempt in $(seq 1 "$REPLICA_WAIT_ATTEMPTS"); do
    if docker exec \
      -e MONGO_PASSWORD="$MONGO_PASSWORD" \
      "$primary_container" \
      sh -c 'mongosh --quiet \
        --username root \
        --password="$MONGO_PASSWORD" \
        --authenticationDatabase admin \
        --eval "
          const status = rs.status();
          const primaryCount = status.members.filter((m) => m.stateStr === \"PRIMARY\" && m.health === 1).length;
          const secondaryCount = status.members.filter((m) => m.stateStr === \"SECONDARY\" && m.health === 1).length;
          const healthyCount = status.members.filter((m) => m.health === 1).length;
          printjson({
            primaryCount,
            secondaryCount,
            healthyCount,
            members: status.members.map(({ name, stateStr, health }) => ({ name, stateStr, health }))
          });
          if (primaryCount !== 1 || secondaryCount < 2 || healthyCount < 3) quit(2);
        "'; then
      info 'replica_set=healthy'
      return
    fi

    info "replica_set=waiting attempt=$attempt sleep_seconds=$REPLICA_WAIT_SECONDS"
    sleep "$REPLICA_WAIT_SECONDS"
  done

  fail 'replica_set_not_healthy_after_restore'
}

wait_for_http_ready() {
  local attempt

  for attempt in $(seq 1 "$HTTP_WAIT_ATTEMPTS"); do
    if curl -fsS "$HEALTH_READY_URL" >/dev/null; then
      info "http_ready=ok url=$HEALTH_READY_URL"
      return
    fi

    info "http_ready=waiting attempt=$attempt sleep_seconds=$HTTP_WAIT_SECONDS"
    sleep "$HTTP_WAIT_SECONDS"
  done

  fail "http_ready_failed url=$HEALTH_READY_URL"
}

check_db_status() {
  if [[ -z "$DB_STATUS_BEARER_TOKEN" ]]; then
    info "db_status=manual_check_required url=$DB_STATUS_URL reason=missing_DB_STATUS_BEARER_TOKEN"
    return
  fi

  curl -fsS \
    -H "Authorization: Bearer $DB_STATUS_BEARER_TOKEN" \
    "$DB_STATUS_URL" >/dev/null

  info "db_status=ok url=$DB_STATUS_URL"
}

require_command awk
require_command basename
require_command curl
require_command docker
require_command find
require_command gzip
require_command grep
require_command mktemp
require_command rm
require_command sha256sum
require_command sort

if [[ -n "$RESTORE_ARCHIVE" || "$RESTORE_SELECTION" != "latest" ]]; then
  [[ "$CONFIRM_RESTORE_PRODUCTION" == "RESTORE_SELECTED_CLINIA_BACKUP" ]] ||
    fail 'missing_confirmation set CONFIRM_RESTORE_PRODUCTION=RESTORE_SELECTED_CLINIA_BACKUP'
else
  [[ "$CONFIRM_RESTORE_PRODUCTION" == "RESTORE_LATEST_CLINIA_BACKUP" ]] ||
    fail 'missing_confirmation set CONFIRM_RESTORE_PRODUCTION=RESTORE_LATEST_CLINIA_BACKUP'
fi

mapfile -t STOPPED_BACKENDS < <(true)
archive="$(selected_backup_archive)"

[[ -n "$archive" ]] || fail "backup_not_found dir=$BACKUP_OUTPUT_DIR label=$BACKUP_LABEL selection=$RESTORE_SELECTION"

info "selected_archive=$archive"
if [[ -n "$RESTORE_ARCHIVE" ]]; then
  info 'restore_selection=explicit'
else
  info "restore_selection=$RESTORE_SELECTION"
fi
verify_selected_archive "$archive"
trap cleanup_restore_working_archive EXIT
materialize_restore_archive "$archive"

mapfile -t MONGO_CONTAINERS < <(mongo_containers)
[[ "${#MONGO_CONTAINERS[@]}" -gt 0 ]] || fail 'mongo_containers_not_found'

MONGO_PASSWORD=""
for container in "${MONGO_CONTAINERS[@]}"; do
  MONGO_PASSWORD="$(load_root_password "$container")"
  [[ -n "$MONGO_PASSWORD" ]] && break
done

[[ -n "$MONGO_PASSWORD" ]] || fail 'mongo_root_password_not_found'

primary_container="$(find_primary_container "${MONGO_CONTAINERS[@]}")" ||
  fail 'mongo_primary_not_found'

info "primary=$primary_container"
info "database=$MONGO_DATABASE"

stop_backends
restore_archive_to_primary "$RESTORE_WORKING_ARCHIVE" "$primary_container"
validate_collections "$primary_container"
wait_for_replica_set "$primary_container"
start_backends
wait_for_http_ready
check_db_status

info "restore_complete archive=$archive database=$MONGO_DATABASE"
