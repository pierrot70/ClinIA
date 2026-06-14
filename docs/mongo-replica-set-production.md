# MongoDB replica set production runbook

This runbook converts the existing standalone `mongo` service into replica set
`rs0` while preserving its existing `mongo_data` volume.

## Preconditions

- A fresh `mongodump` archive exists outside the Mongo container.
- The archive permissions are `600`, owned by `root`.
- `gzip -t` succeeds and the SHA-256 checksum is recorded.
- Both backend containers are healthy before starting.
- A short maintenance window is accepted.

## Deployment sequence

1. Deploy the Compose configuration containing `mongo`, `mongo-replica-1`,
   `mongo-replica-2`, and the shared keyfile volume.
2. Confirm all three Mongo containers are running.
3. Resolve the current Coolify container names:

```bash
MONGO_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^mongo-' | head -n1)"
MONGO_REPLICA_1_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^mongo-replica-1-' | head -n1)"
MONGO_REPLICA_2_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^mongo-replica-2-' | head -n1)"
```

4. Load the current Mongo root password without printing it:

```bash
MONGO_PASSWORD="$(
  docker inspect "$MONGO_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
  tail -n1
)"
```

5. Verify root authentication:

```bash
docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet --username root --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin --eval "db.runCommand({ ping: 1 })"'
```

6. Initiate `rs0` manually from the existing `mongo` member:

```bash
docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet --username root --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin --eval '"'"'
      rs.initiate({
        _id: "rs0",
        members: [
          { _id: 0, host: "mongo:27017", priority: 2 },
          { _id: 1, host: "mongo-replica-1:27017", priority: 1 },
          { _id: 2, host: "mongo-replica-2:27017", priority: 1 }
        ]
      })
    '"'"''
```

7. Wait until `mongo` is `PRIMARY` and both replicas are `SECONDARY`:

```bash
docker exec -e MONGO_PASSWORD="$MONGO_PASSWORD" "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet --username root --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --eval "rs.status().members.map(({name,stateStr,health}) => ({name,stateStr,health}))"'
```

8. Verify `https://clinique-ai.ca/api/health/ready` returns `200`.
9. Update the Coolify `MONGO_URI` seed list:

```text
mongodb://clinia_app:<encoded-password>@mongo:27017,mongo-replica-1:27017,mongo-replica-2:27017/clinia?authSource=clinia&replicaSet=rs0
```

10. Redeploy and test Mongo primary failover.

## Rollback before `rs.initiate`

Revert the deployment to the previous commit. The existing `mongo_data` volume
remains unchanged.

## Rollback after `rs.initiate`

Prefer repairing the replica set. If a complete rollback is required:

1. Stop application writes.
2. Restore the verified pre-conversion archive into a clean standalone MongoDB.
3. Restore the previous Compose configuration and standalone `MONGO_URI`.
4. Validate application health before reopening writes.

Do not delete any Mongo volume during rollback.
