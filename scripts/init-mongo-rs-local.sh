#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose-mongo-rs-local.yml"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-clinia_mongo_rs}"

dc() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

root_auth_works() {
  dc exec -T mongo-rs-1 sh -c 'mongosh --quiet \
    --username "$CLINIA_RS_ROOT_USERNAME" \
    --password="$CLINIA_RS_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.runCommand({ connectionStatus: 1 })" >/dev/null 2>&1'
}

echo "Waiting for mongo-rs-1..."
for _ in {1..30}; do
  if dc exec -T mongo-rs-1 mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if root_auth_works; then
  echo "Replica set already initialized"
else
  dc exec -T mongo-rs-1 mongosh --quiet --eval '
    rs.initiate({
      _id: "rs0",
      members: [
        { _id: 0, host: "mongo-rs-1:27017", priority: 2 },
        { _id: 1, host: "mongo-rs-2:27017", priority: 1 },
        { _id: 2, host: "mongo-rs-3:27017", priority: 1 }
      ]
    });
    print("Replica set initiated");
  '
fi

echo "Waiting for a primary..."
for _ in {1..30}; do
  if root_auth_works; then
    primary_ready="$(
      dc exec -T mongo-rs-1 sh -c 'mongosh --quiet \
        --username "$CLINIA_RS_ROOT_USERNAME" \
        --password="$CLINIA_RS_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "db.hello().isWritablePrimary"' 2>/dev/null || true
    )"
  else
    primary_ready="$(
      dc exec -T mongo-rs-1 mongosh --quiet \
        --eval 'db.hello().isWritablePrimary' 2>/dev/null || true
    )"
  fi

  if [ "$primary_ready" = "true" ]; then
    break
  fi
  sleep 2
done

if ! root_auth_works; then
  dc exec -T mongo-rs-1 mongosh --quiet --eval '
    db.getSiblingDB("admin").createUser({
      user: process.env.CLINIA_RS_ROOT_USERNAME,
      pwd: process.env.CLINIA_RS_ROOT_PASSWORD,
      roles: [{ role: "root", db: "admin" }]
    });
    print("Root user created");
  '
else
  echo "Root user already exists"
fi

dc exec -T mongo-rs-1 sh -c 'mongosh --quiet \
  --username "$CLINIA_RS_ROOT_USERNAME" \
  --password="$CLINIA_RS_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval '"'"'
    const appDb = db.getSiblingDB("clinia");
    const appUserRoles = [
      { role: "readWrite", db: "clinia" },
      { role: "clusterMonitor", db: "admin" }
    ];
    if (!appDb.getUser(process.env.CLINIA_RS_APP_USERNAME)) {
      appDb.createUser({
        user: process.env.CLINIA_RS_APP_USERNAME,
        pwd: process.env.CLINIA_RS_APP_PASSWORD,
        roles: appUserRoles
      });
      print("Application user created");
    } else {
      appDb.updateUser(process.env.CLINIA_RS_APP_USERNAME, { roles: appUserRoles });
      print("Application user already exists");
    }
  '"'"

echo "Mongo replica set initialized."
