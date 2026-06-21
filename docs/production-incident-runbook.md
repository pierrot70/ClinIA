# ClinIA production incident runbook

Use this checklist when ClinIA appears unavailable or degraded.

## Current production path

```text
User -> Cloudflare -> DigitalOcean Load Balancer -> clinia-coolify -> Coolify/Traefik -> frontend/backend -> MongoDB replica set
```

- Cloudflare DNS record: `clinique-ai.ca`
- DigitalOcean Load Balancer IP: `146.190.189.77`
- Direct droplet rollback IP: `138.197.142.207`
- Health endpoint: `https://clinique-ai.ca/api/health/ready`

## First 2 minutes

1. Check the public health endpoint:

```bash
curl -i https://clinique-ai.ca/api/health/ready
```

Expected result: `HTTP/2 200` and `"mongo":"connected"`.

2. Bypass Cloudflare and test the DigitalOcean Load Balancer directly:

```bash
curl -i --resolve clinique-ai.ca:443:146.190.189.77 \
  https://clinique-ai.ca/api/health/ready
```

If this works but the normal URL fails, suspect Cloudflare or DNS.

3. Test the frontend through the Load Balancer:

```bash
curl -I --resolve clinique-ai.ca:443:146.190.189.77 \
  https://clinique-ai.ca/
```

Expected result: `HTTP/2 200` and `content-type: text/html`.

## Production health-check script

Use the repository health-check script for a complete production baseline after
a deployment, during an incident, or after changing infrastructure settings.

On `clinia-coolify`:

```bash
cd /tmp

curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/production-health-check.sh \
  -o production-health-check.sh

chmod +x production-health-check.sh

CHECK_CONTAINERS=true \
CHECK_MONGO_REPLICA=true \
CHECK_HTTP_READY=true \
MONGO_REPLICA_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
./production-health-check.sh

echo "exit=$?"
```

Expected healthy result:

- Disk: `OK`
- Memory: `OK`
- Frontend container: `OK`
- Backend containers: `OK`
- Mongo containers: `OK`
- Mongo replica set: `OK mongo_replica_set set=rs0 members=3 primary=1 secondaries=2 healthy=3`
- Public HTTP readiness: `OK http_ready url=https://clinique-ai.ca/api/health/ready http_code=200`

Exit codes:

- `0`: OK
- `1`: WARN, investigate soon
- `2`: CRITICAL, investigate immediately

## Droplet checks

Run these on `clinia-coolify`:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' |
grep -E '^(frontend|backend|mongo)'
```

Expected healthy baseline:

- `frontend-*` is up.
- `backend-*` and `backend-replica-*` are up and healthy.
- `mongo`, `mongo-replica-1`, and `mongo-replica-2` are up.

If the API returns `502` or `504`, inspect backend logs:

```bash
docker logs --tail 80 "$(docker ps -a --format '{{.Names}}' | grep '^backend-' | head -n1)"
```

Common signals:

- `Authentication failed`: verify `MONGO_URI` in Coolify.
- `Server selection timed out`: verify Mongo replica set health.
- Repeated restarts: check container status and recent Coolify deployment logs.

## MongoDB replica set checks

Resolve the current primary Mongo container:

```bash
MONGO_CONTAINER="$(docker ps --format '{{.Names}}' |
  grep '^mongo-gko400wwcs44csw8000o0sss-' |
  head -n1)"

MONGO_PASSWORD="$(
  docker inspect "$MONGO_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
  tail -n1
)"
```

Check replica set status:

```bash
docker exec \
  -e MONGO_PASSWORD="$MONGO_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet \
    --username root \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --eval "rs.status().members.map(({name,stateStr,health}) => ({name,stateStr,health}))"'
```

Expected result:

- One `PRIMARY`
- Two `SECONDARY`
- All `health: 1`

If `mongo` is down but a replica is primary, test through an active replica:

```bash
ACTIVE_MONGO="$(docker ps --format '{{.Names}}' |
  grep '^mongo-replica-1-' |
  head -n1)"
```

Then run the same `rs.status()` command against `$ACTIVE_MONGO`.

## Mongo backup and restore drill

Run this drill from `clinia-coolify` before risky infrastructure work and at
least once after changing Mongo credentials or replica set topology. The restore
target must stay isolated in `clinia_restore_test`; never restore a drill over
the production `clinia` database.

Create a fresh backup:

```bash
cd /tmp

curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/backup-mongo.sh \
  -o backup-mongo.sh

chmod +x backup-mongo.sh

BACKUP_OUTPUT_DIR=/tmp/clinia-mongo-backups \
MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
MONGO_DATABASE=clinia \
BACKUP_LABEL=clinia-prod \
./backup-mongo.sh
```

Expected result:

- `INFO backup=ok`
- A `clinia-prod-*.archive.gz` file under `/tmp/clinia-mongo-backups`
- A matching `.sha256` file
- Archive permissions are `600`

Verify the backup before any restore test:

```bash
BACKUP_ARCHIVE="$(ls -t /tmp/clinia-mongo-backups/clinia-prod-*.archive.gz | head -n1)"

sha256sum -c "${BACKUP_ARCHIVE}.sha256"
gzip -t "$BACKUP_ARCHIVE"
ls -lh "$BACKUP_ARCHIVE" "${BACKUP_ARCHIVE}.sha256"
```

Expected result:

- `sha256sum` returns `OK`
- `gzip -t` exits with code `0`
- The archive size is non-zero

Restore the archive into the isolated drill database:

```bash
MONGO_CONTAINER="$(docker ps --format '{{.Names}}' |
  grep '^mongo-gko400wwcs44csw8000o0sss-' |
  head -n1)"

MONGO_PASSWORD="$(
  docker inspect "$MONGO_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^MONGO_INITDB_ROOT_PASSWORD=//p' |
  tail -n1
)"

docker exec \
  -e MONGO_PASSWORD="$MONGO_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet \
    --username root \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --eval "
      const hello = db.hello();
      printjson({
        isWritablePrimary: hello.isWritablePrimary,
        primary: hello.primary
      });
      if (!hello.isWritablePrimary) quit(2);
    "'

docker cp "$BACKUP_ARCHIVE" "$MONGO_CONTAINER:/tmp/clinia-restore-test.archive.gz"

docker exec \
  -e MONGO_PASSWORD="$MONGO_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -c 'mongorestore \
    --username root \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --archive=/tmp/clinia-restore-test.archive.gz \
    --gzip \
    --drop \
    --nsFrom="clinia.*" \
    --nsTo="clinia_restore_test.*"'
```

Validate the restored collections:

```bash
docker exec \
  -e MONGO_PASSWORD="$MONGO_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet \
    --username root \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --eval "
      const source = db.getSiblingDB(\"clinia\");
      const restored = db.getSiblingDB(\"clinia_restore_test\");
      const sourceCollections = source.getCollectionNames().sort();
      const restoredCollections = restored.getCollectionNames().sort();
      printjson({ sourceCollections, restoredCollections });
      const counts = sourceCollections.map((name) => ({
        collection: name,
        source: source.getCollection(name).countDocuments(),
        restored: restored.getCollection(name).countDocuments()
      }));
      printjson(counts);
      const missing = sourceCollections.filter((name) => !restoredCollections.includes(name));
      const mismatched = counts.filter((entry) => entry.source !== entry.restored);
      if (missing.length || mismatched.length) {
        printjson({ missing, mismatched });
        quit(2);
      }
    "'
```

Expected result:

- `sourceCollections` and `restoredCollections` contain the same collection names.
- Counts match for each collection.
- If production writes occurred during the backup window, repeat the drill during
  a quiet period before treating count drift as a restore failure.

Record a minimal drill evidence file without patient data:

```bash
DRILL_EVIDENCE="/tmp/clinia-mongo-backups/restore-drill-$(date -u +%Y%m%d-%H%M%S).txt"

{
  date -u
  printf 'archive=%s\n' "$BACKUP_ARCHIVE"
  sha256sum "$BACKUP_ARCHIVE"
  docker exec \
    -e MONGO_PASSWORD="$MONGO_PASSWORD" \
    "$MONGO_CONTAINER" \
    sh -c 'mongosh --quiet \
      --username root \
      --password="$MONGO_PASSWORD" \
      --authenticationDatabase admin \
      --eval "
        const restored = db.getSiblingDB(\"clinia_restore_test\");
        const collections = restored.getCollectionNames().sort();
        printjson({
          database: \"clinia_restore_test\",
          collectionCount: collections.length,
          collections
        });
      "'
} > "$DRILL_EVIDENCE"

chmod 600 "$DRILL_EVIDENCE"
ls -lh "$DRILL_EVIDENCE"
```

Failure criteria:

- Checksum or gzip verification fails.
- `mongorestore` fails or targets any database other than `clinia_restore_test`.
- A production collection is missing from `clinia_restore_test`.
- Counts differ when the drill ran during a quiet period.

Optional cleanup after validation:

```bash
docker exec \
  -e MONGO_PASSWORD="$MONGO_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -c 'mongosh --quiet \
    --username root \
    --password="$MONGO_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.getSiblingDB(\"clinia_restore_test\").dropDatabase()"'

docker exec "$MONGO_CONTAINER" rm -f /tmp/clinia-restore-test.archive.gz
```

## Automated Mongo backups

Use the scheduled backup wrapper for the minimum viable production baseline:
daily backup, automatic `sha256` and `gzip` verification, local retention, and
optional webhook alerting on failure. This still keeps the archive on the
droplet; the next hardening step is copying verified archives to external object
storage such as DigitalOcean Spaces or S3.

Current local retention target: `7` days.

Install the wrapper on `clinia-coolify`:

```bash
sudo mkdir -p /opt/clinia/scripts /var/backups/clinia/mongo /var/backups/clinia/mongo-keep /var/log/clinia

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/backup-mongo.sh \
  -o /opt/clinia/scripts/backup-mongo.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/verify-mongo-backup.sh \
  -o /opt/clinia/scripts/verify-mongo-backup.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/scheduled-mongo-backup.sh \
  -o /opt/clinia/scripts/scheduled-mongo-backup.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/restore-mongo-production.sh \
  -o /opt/clinia/scripts/restore-mongo-production.sh

sudo chmod 700 /var/backups/clinia/mongo
sudo chmod 700 /var/backups/clinia/mongo-keep
sudo chmod 755 /opt/clinia/scripts/*.sh
```

Run a manual scheduled-backup test:

```bash
sudo BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_RETENTION_DAYS=7 \
  BACKUP_LOG_DIR=/var/log/clinia \
  MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
  MONGO_DATABASE=clinia \
  BACKUP_LABEL=clinia-prod \
  /opt/clinia/scripts/scheduled-mongo-backup.sh
```

Expected result:

- `INFO backup=ok`
- `INFO backup_verification=ok`
- `INFO backup_completed archive=...`
- A matching `.manifest.json` with collection and document counts
- A dated log under `/var/log/clinia`

Schedule the daily backup:

```bash
sudo tee /etc/cron.d/clinia-mongo-backup >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

15 5 * * * root BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep BACKUP_RETENTION_DAYS=7 BACKUP_LOG_DIR=/var/log/clinia MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- MONGO_DATABASE=clinia BACKUP_LABEL=clinia-prod /opt/clinia/scripts/scheduled-mongo-backup.sh
EOF
```

Increase `BACKUP_RETENTION_DAYS` only after confirming disk capacity.

Optional alerting:

```bash
sudo tee /etc/cron.d/clinia-mongo-backup >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

15 5 * * * root BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep BACKUP_RETENTION_DAYS=7 BACKUP_LOG_DIR=/var/log/clinia ALERT_WEBHOOK_URL=https://example.invalid/clinia-backup-alerts MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- MONGO_DATABASE=clinia BACKUP_LABEL=clinia-prod /opt/clinia/scripts/scheduled-mongo-backup.sh
EOF
```

Replace the example webhook URL before enabling alerting. Do not put patient
data in alert payloads; the wrapper sends only service status and log location.
Set `ALERT_ON_SUCCESS=true` only if the receiving system needs positive backup
heartbeats.

Dashboard visibility:

- The database dashboard reads only backup metadata: filename, size, age, and
  checksum-file status.
- New backups also include a `.manifest.json` with collection and document
  counts. Older backups without a manifest remain valid, but the dashboard shows
  their counts as unavailable.
- The dashboard shows the 8 most recent backups plus any manually conserved
  backups.
- Manually conserved backups create a `.keep` marker under
  `/var/backups/clinia/mongo-keep`; the cron retention job never deletes an
  archive that has this marker.
- The backup directory must be mounted read-only in the backend containers:
  `/var/backups/clinia/mongo:/var/backups/clinia/mongo:ro`.
- The keep-marker directory must be mounted read-write in the backend containers:
  `/var/backups/clinia/mongo-keep:/var/backups/clinia/mongo-keep:rw`.
- Set `MONGO_BACKUP_DIR=/var/backups/clinia/mongo` and
  `MONGO_BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep` and
  `MONGO_BACKUP_RETENTION_DAYS=7` for the backend.
- Do not mount the backup directory in the frontend container.

Daily verification:

```bash
sudo ls -lt /var/backups/clinia/mongo/clinia-prod-*.archive.gz | head
sudo tail -n 80 "$(sudo ls -t /var/log/clinia/mongo-backup-*.log | head -n1)"
```

Escalate if the latest log is missing `INFO backup_verification=ok`, if the
latest archive is older than 24 hours, or if `/var/backups/clinia/mongo` is close
to full.

## Catastrophic Mongo production restore

Use this only when production must be restored from a local backup. The script
stops the running backend containers, selects the requested
`clinia-prod-*.archive.gz`, verifies `sha256` and `gzip`, restores the `clinia`
database on the current Mongo primary, waits until two secondaries are
`SECONDARY` with `health: 1`, restarts the backends, checks
`/api/health/ready`, and then checks `/api/db-status` if a bearer token is
provided.

Do not restore each Mongo member manually. Restore only to the primary and let
the replica set replicate the restored data.

Install or refresh the restore script:

```bash
sudo mkdir -p /opt/clinia/scripts

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/restore-mongo-production.sh \
  -o /opt/clinia/scripts/restore-mongo-production.sh

sudo chmod 755 /opt/clinia/scripts/restore-mongo-production.sh
```

Restore the latest backup:

```bash
sudo CONFIRM_RESTORE_PRODUCTION=RESTORE_LATEST_CLINIA_BACKUP \
  BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_LABEL=clinia-prod \
  MONGO_DATABASE=clinia \
  MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
  MONGO_REPLICA_1_PREFIX=mongo-replica-1- \
  MONGO_REPLICA_2_PREFIX=mongo-replica-2- \
  BACKEND_PREFIX=backend- \
  BACKEND_REPLICA_PREFIX=backend-replica- \
  /opt/clinia/scripts/restore-mongo-production.sh
```

Restore the oldest local backup:

```bash
sudo CONFIRM_RESTORE_PRODUCTION=RESTORE_SELECTED_CLINIA_BACKUP \
  RESTORE_SELECTION=oldest \
  BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_LABEL=clinia-prod \
  MONGO_DATABASE=clinia \
  MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
  MONGO_REPLICA_1_PREFIX=mongo-replica-1- \
  MONGO_REPLICA_2_PREFIX=mongo-replica-2- \
  BACKEND_PREFIX=backend- \
  BACKEND_REPLICA_PREFIX=backend-replica- \
  /opt/clinia/scripts/restore-mongo-production.sh
```

Restore the newest manually conserved backup:

```bash
sudo CONFIRM_RESTORE_PRODUCTION=RESTORE_SELECTED_CLINIA_BACKUP \
  RESTORE_SELECTION=protected-newest \
  BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_LABEL=clinia-prod \
  MONGO_DATABASE=clinia \
  MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
  MONGO_REPLICA_1_PREFIX=mongo-replica-1- \
  MONGO_REPLICA_2_PREFIX=mongo-replica-2- \
  BACKEND_PREFIX=backend- \
  BACKEND_REPLICA_PREFIX=backend-replica- \
  /opt/clinia/scripts/restore-mongo-production.sh
```

Restore a specific backup selected from the dashboard:

```bash
sudo CONFIRM_RESTORE_PRODUCTION=RESTORE_SELECTED_CLINIA_BACKUP \
  RESTORE_ARCHIVE=/var/backups/clinia/mongo/clinia-prod-YYYYMMDD-HHMMSS.archive.gz \
  BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_LABEL=clinia-prod \
  MONGO_DATABASE=clinia \
  MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
  MONGO_REPLICA_1_PREFIX=mongo-replica-1- \
  MONGO_REPLICA_2_PREFIX=mongo-replica-2- \
  BACKEND_PREFIX=backend- \
  BACKEND_REPLICA_PREFIX=backend-replica- \
  /opt/clinia/scripts/restore-mongo-production.sh
```

Expected success signals:

- `INFO selected_archive=...`
- `INFO restore_selection=...`
- `INFO backend_stop containers=...`
- `INFO primary=...`
- `INFO replica_set=healthy`
- `INFO backend_start containers=...`
- `INFO http_ready=ok url=https://clinique-ai.ca/api/health/ready`
- `INFO restore_complete archive=... database=clinia`

If the restore fails after the backend containers were stopped, do not restart
the backends until the Mongo error is understood. Keeping the API down is safer
than reopening writes against a partially restored database.

If you have a current admin bearer token, add:

```bash
DB_STATUS_BEARER_TOKEN=<admin-access-token>
```

Without `DB_STATUS_BEARER_TOKEN`, the script prints
`db_status=manual_check_required`. In that case, open `/admin/db-status` in the
UI after the restore and confirm Mongo, collections, replica set, and backups
look healthy.

## Load Balancer checks

In DigitalOcean:

- Load Balancer: `clinia-1b-prod`
- Type: Regional / HTTP / External / TOR1
- Forwarding rules:
  - `HTTP 80 -> HTTP 80`
  - `HTTPS 443 -> HTTPS 443`
  - Certificate mode: passthrough
- Health check:
  - TCP
  - Port `443`

If the droplet is shown as `Down`:

1. Confirm the droplet listens on `80` and `443`:

```bash
ss -ltnp | grep -E ':80|:443'
```

2. Confirm the private VPC path works from the droplet itself:

```bash
curl -k -i --connect-timeout 5 \
  -H "Host: clinique-ai.ca" \
  https://10.118.0.2/api/health/ready
```

3. Confirm DigitalOcean firewall allows inbound `80` and `443`.

## Cloudflare rollback

Use this only if the Load Balancer path is failing and direct droplet access is
known to work.

In Cloudflare DNS records, change:

```text
A  clinique-ai.ca  146.190.189.77
```

back to:

```text
A  clinique-ai.ca  138.197.142.207
```

Keep the record proxied if it was proxied before.

Validate rollback:

```bash
curl -i https://clinique-ai.ca/api/health/ready
```

Expected result: `HTTP/2 200`.

## Restart order

Prefer diagnosis before restarts. If a restart is required:

1. Restart unhealthy backend first.
2. Avoid restarting all Mongo members at once.
3. Restart only one Mongo member at a time and wait for `rs.status()`.
4. If a Coolify redeploy is needed, confirm the backup and rollback path first.

## Escalation notes

Record the following before making changes:

- Current time and symptom.
- Last successful health check.
- Output of `docker ps`.
- Last 80 backend log lines.
- Mongo replica set status.
- Whether Cloudflare, Load Balancer direct, and direct droplet paths differ.
