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
sudo mkdir -p /opt/clinia/scripts /var/log/clinia

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/production-health-check.sh \
  -o /opt/clinia/scripts/production-health-check.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/run-production-failover-drill.sh \
  -o /opt/clinia/scripts/run-production-failover-drill.sh

sudo chmod 755 /opt/clinia/scripts/production-health-check.sh /opt/clinia/scripts/run-production-failover-drill.sh
```

Run a full manual check:

```bash
sudo bash -c '
set -a
if [ -f /root/clinia-backup-alert.env ]; then . /root/clinia-backup-alert.env; fi
if [ -f /root/clinia-backup-s3.env ]; then . /root/clinia-backup-s3.env; fi
set +a

ALERT_ON_SUCCESS=false \
CHECK_CONTAINERS=true \
CHECK_MONGO_REPLICA=true \
CHECK_HTTP_READY=true \
CHECK_LOCAL_BACKUP=true \
CHECK_S3_BACKUP=true \
BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
BACKUP_LABEL=clinia-prod \
MONGO_REPLICA_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- \
/opt/clinia/scripts/production-health-check.sh

echo "exit=$?"
'
```

Expected healthy result:

- Disk: `OK`
- Memory: `OK`
- Frontend container: `OK`
- Backend containers: `OK`
- Mongo containers: `OK`
- Mongo replica set: `OK mongo_replica_set set=rs0 members=3 primary=1 secondaries=2 healthy=3`
- Public HTTP readiness: `OK http_ready url=https://clinique-ai.ca/api/health/ready http_code=200`
- Local backup: `OK backup_local archive=... age_hours=...`
- S3 backup: `OK backup_s3 archive=... age_hours=...`

Exit codes:

- `0`: OK
- `1`: WARN, investigate soon
- `2`: CRITICAL, investigate immediately

Schedule the global production health monitor every 15 minutes:

```bash
sudo tee /etc/cron.d/clinia-production-health >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

*/15 * * * * root set -a; if [ -f /root/clinia-backup-alert.env ]; then . /root/clinia-backup-alert.env; fi; if [ -f /root/clinia-backup-s3.env ]; then . /root/clinia-backup-s3.env; fi; set +a; ALERT_ON_SUCCESS=false CHECK_CONTAINERS=true CHECK_MONGO_REPLICA=true CHECK_HTTP_READY=true CHECK_LOCAL_BACKUP=true CHECK_S3_BACKUP=true BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_LABEL=clinia-prod MONGO_REPLICA_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- /opt/clinia/scripts/production-health-check.sh >>/var/log/clinia/production-health-check.log 2>&1
EOF
```

The monitor sends Slack alerts through `/root/clinia-backup-alert.env` when a
check returns `WARN` or `CRITICAL`. Keep `ALERT_ON_SUCCESS=false` for this cron
to avoid noisy heartbeat alerts every 15 minutes.

Mongo replica alert routing:

Use dedicated Slack Incoming Webhooks for Mongo topology alerts:

- `MONGO_DEGRADED_WEBHOOK_URL`: send to `#mongo-degraded` when Mongo has `2/3`
  healthy members. Majority writes should still work, but redundancy is reduced.
- `MONGO_INCIDENT_WEBHOOK_URL`: send to `#mongo-incident` when Mongo has `1/3`
  healthy members or no healthy primary. Majority writes should not be trusted.
- `ALERT_ORIGIN`: set to `DEV` for local drills and `PROD` for Coolify. Slack
  messages include this origin, for example `[warning][DEV]` or
  `[failed][PROD]`.

Store real webhook URLs only in root-owned env files, never in git. For
production, put them in a root-only file such as
`/root/clinia-mongo-alerts.env`:

```bash
sudo tee /root/clinia-mongo-alerts.env >/dev/null <<'EOF'
ALERT_ORIGIN=PROD
ALERT_WEBHOOK_FORMAT=slack
MONGO_DEGRADED_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE/REPLACE/REPLACE
MONGO_INCIDENT_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE/REPLACE/REPLACE
EOF
sudo chmod 600 /root/clinia-mongo-alerts.env
```

Then source that file from the health cron before running the script:

```bash
*/15 * * * * root set -a; if [ -f /root/clinia-backup-alert.env ]; then . /root/clinia-backup-alert.env; fi; if [ -f /root/clinia-backup-s3.env ]; then . /root/clinia-backup-s3.env; fi; if [ -f /root/clinia-mongo-alerts.env ]; then . /root/clinia-mongo-alerts.env; fi; set +a; ALERT_ON_SUCCESS=false CHECK_CONTAINERS=true CHECK_MONGO_REPLICA=true CHECK_HTTP_READY=true CHECK_LOCAL_BACKUP=true CHECK_S3_BACKUP=true BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_LABEL=clinia-prod MONGO_REPLICA_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- /opt/clinia/scripts/production-health-check.sh >>/var/log/clinia/production-health-check.log 2>&1
```

For local drills, export the same variables with `ALERT_ORIGIN=DEV` in the local
terminal. Do not paste Slack webhook URLs in chat or commit them.

### Mongo degraded/incident alert drills

Purpose: prove that Mongo topology degradation is routed to the right Slack
channel with the right origin marker.

Local drill, already validated in the local replica set stack:

```bash
ALERT_ORIGIN=DEV \
MONGO_DEGRADED_WEBHOOK_URL="$MONGO_DEGRADED_WEBHOOK_URL" \
MONGO_INCIDENT_WEBHOOK_URL="$MONGO_INCIDENT_WEBHOOK_URL" \
./scripts/run-local-mongo-alert-drill.sh
```

Expected local result:

```text
INFO LOCAL_MONGO_ALERT_DRILL_PASSED origin=DEV
```

Expected local Slack messages:

- `#mongo-degraded`: one `[warning][DEV]` message when Mongo is `2/3`.
- `#mongo-incident`: one `[failed][DEV]` message when Mongo is `1/3`.

Production drill: run only during a planned maintenance window. This drill
intentionally stops both Mongo secondaries for a short period. At `2/3`, Mongo
still has a majority and should remain writable. At `1/3`, Mongo should lose
majority and writes should not be trusted until the members return.

Install or refresh the scripts on `clinia-coolify`:

```bash
sudo mkdir -p /opt/clinia/scripts

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/production-health-check.sh \
  -o /opt/clinia/scripts/production-health-check.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/run-production-mongo-alert-drill.sh \
  -o /opt/clinia/scripts/run-production-mongo-alert-drill.sh

sudo chmod 755 /opt/clinia/scripts/production-health-check.sh \
  /opt/clinia/scripts/run-production-mongo-alert-drill.sh
```

Run the production alert drill:

```bash
sudo CONFIRM_PRODUCTION_MONGO_ALERT_DRILL=RUN_CLINIA_MONGO_ALERT_DRILL \
  ALERT_ORIGIN=PROD \
  /opt/clinia/scripts/run-production-mongo-alert-drill.sh
```

Expected production result:

```text
INFO PRODUCTION_MONGO_ALERT_DRILL_PASSED origin=PROD
```

Expected production Slack messages:

- `#mongo-degraded`: one `[warning][PROD]` message for `2/3`.
- `#mongo-incident`: one `[failed][PROD]` message for `1/3` or no healthy
  primary.

Final success requires the script to restart the stopped secondaries and verify
Mongo is back to `1 PRIMARY`, `2 SECONDARY`, `healthy=3`. If the script fails,
it attempts cleanup automatically; immediately run the full production health
check and inspect `/var/log/clinia/production-health-check.log`.

Test the Slack failure path without breaking production:

```bash
sudo bash -c '
set -a
. /root/clinia-backup-alert.env
set +a

CHECK_CONTAINERS=false \
CHECK_MONGO_REPLICA=false \
CHECK_HTTP_READY=true \
HTTP_READY_URL=https://clinique-ai.ca/api/health/ready-does-not-exist \
/opt/clinia/scripts/production-health-check.sh
'
```

Expected result: exit code `2` and one Slack `[failed]` alert for
`clinia-production-health`.

## Operations signal grid

Use this grid when Slack, the dashboard, or a manual check reports a production
signal.

| Signal | Meaning | First action |
| --- | --- | --- |
| Slack `[ok] clinia-production-health` | Hourly heartbeat passed. App, Mongo, backups, S3, disk, and memory are within thresholds. | No action. |
| Slack `[failed] clinia-production-health` | At least one health monitor check is critical. | Open `/var/log/clinia/production-health-check.log`, run the full manual health check, then follow the failed line below. |
| `CRITICAL http_ready` | Public API readiness failed. | Test Cloudflare bypass with `curl --resolve`; inspect backend containers and logs. |
| `CRITICAL mongo_replica_set` | Mongo topology is not normal. | Run replica set checks; confirm `1 PRIMARY`, `2 SECONDARY`, `health: 1`, and low lag. |
| `CRITICAL backup_local` | Latest local backup is missing, too old, or missing `.sha256`. | Run the scheduled backup manually and inspect `/var/log/clinia/mongo-backup-*.log`. |
| `CRITICAL backup_s3` | Latest S3 backup is missing, too old, or missing `.sha256`. | Source `/root/clinia-backup-s3.env`, list S3, then rerun a manual backup. |
| Slack `[failed] clinia-mongo-backup` | The scheduled backup job failed. | Inspect the log path shown in Slack, then rerun the scheduled backup manually. |
| Slack `[ok] clinia-mongo-backup` | Backup, verification, retention, and S3 upload completed. | No action unless the dashboard or S3 listing disagrees. |
| Dashboard backup age over 24 h | Backups may not be running. | Check cron, latest backup log, and Slack backup alerts. |
| Dashboard checksum missing/error | A backup artifact is incomplete or corrupted. | Do not restore that archive; use another verified backup and rerun backup. |
| `DRILL FAILED` | Controlled failover did not return to normal automatically. | Run the full health check, inspect stopped containers, and do not continue drills until normal. |

Normal temporary signals:

- During failover drills, a stopped Mongo member can briefly show
  `(not reachable/healthy)` and `health: 0`.
- During container restart, a short `502` or `MongoNetworkError` can be normal
  if the final health check returns OK.
- A drill is successful only when the final state returns to normal, not merely
  when the application keeps responding during the outage.

## Production failover drill script

Use this script only during a planned maintenance window. It runs the controlled
failover drills end to end:

- stop the primary backend and confirm the replica backend serves traffic;
- stop `mongo-replica-1` and confirm the app still serves traffic;
- stop the current Mongo primary and confirm a secondary is elected;
- restart every stopped container;
- verify the final normal state: `1 PRIMARY`, `2 SECONDARY`, `health: 1` for
  all Mongo members, low replica lag, and `/api/health/ready` OK.

Install or refresh the script:

```bash
sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/run-production-failover-drill.sh \
  -o /opt/clinia/scripts/run-production-failover-drill.sh

sudo chmod 755 /opt/clinia/scripts/run-production-failover-drill.sh
```

Run the drill:

```bash
sudo CONFIRM_PRODUCTION_FAILOVER_DRILL=RUN_CLINIA_FAILOVER_DRILL \
  /opt/clinia/scripts/run-production-failover-drill.sh
```

Expected final result:

```text
INFO production_failover_drill=passed verdict="DRILL PASSED: all tested services returned to normal"
```

Validated production evidence:

- Backend failover: stopping `backend-*` left `backend-replica-*` serving
  `/api/health/ready` successfully.
- Mongo secondary failure: stopping `mongo-replica-1` left the API healthy while
  the replica set reported that member as not reachable, then returned it to
  `SECONDARY` with `health: 1`.
- Mongo primary failover: stopping the current primary caused a secondary to be
  elected `PRIMARY`; `/api/health/ready` stayed OK; after restart the set
  returned to `1 PRIMARY`, `2 SECONDARY`, `health: 1`.
- Final automated drill verdict observed:
  `DRILL PASSED: all tested services returned to normal`.

Expected temporary signals during the drill:

- `MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017` while a Mongo
  container is starting.
- `stateStr: '(not reachable/healthy)'` and `health: 0` for the intentionally
  stopped Mongo member.
- A short period where the former primary returns as `SECONDARY` or where
  another member remains `PRIMARY`. This is acceptable if the final state is
  normal.

Final normal Mongo criteria:

```text
ok: 1
primaryCount: 1
secondaryCount: 2
unhealthyCount: 0
lagSeconds: 0-10
```

Also confirm `/api/health/ready` returns `status: ok` and
`dependencies.mongo: connected`.

If it fails, the script attempts to restart any container it stopped and prints
`DRILL FAILED`. Run the production health-check script immediately after any
failed drill.

Recommended drill cadence:

- Run the full production failover drill quarterly, and after any infrastructure
  change touching Coolify routing, backend scaling, Mongo topology, or Mongo
  credentials.
- Run the S3 fetch plus restore drill quarterly.
- Keep the daily backup plus hourly Slack heartbeat running continuously.
- Record each drill date, operator, final verdict, selected backup archive when
  applicable, and any unexpected temporary signal.

## Evidence log template

Use this template after each production incident, restore drill, failover drill,
or monitoring change. Store the note in the operational incident tracker or in a
dated internal evidence file; do not paste secrets.

```text
Date/time UTC:
Operator:
Scenario:
Scope:

Commands/scripts run:
- <command or script>

Expected result:
- <expected signal>

Actual result:
- <observed signal>

Evidence:
- Health endpoint:
- Mongo final state:
- Backup archive:
- S3 object:
- Slack alert:
- Relevant log path:

Outcome:
- PASS / FAIL

Follow-up:
- <owner and next action>
```

Minimum evidence for a successful failover drill:

- `production_failover_drill=passed`
- `/api/health/ready` returned OK after the drill
- Mongo final state:
  `primaryCount: 1`, `secondaryCount: 2`, `unhealthyCount: 0`,
  `lagSeconds <= 10`
- Any temporary `502`, `MongoNetworkError`, or `not reachable/healthy` signal
  resolved before the final verdict

Minimum evidence for a successful restore drill:

- selected backup archive name
- source: local or S3
- `sha256sum -c`: OK
- `gzip -t`: OK
- `mongorestore`: `0 document(s) failed`
- final Mongo state normal
- `/api/health/ready`: OK

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

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/fetch-mongo-backup-from-s3.sh \
  -o /opt/clinia/scripts/fetch-mongo-backup-from-s3.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/configure-mongo-backup-slack-alert.sh \
  -o /opt/clinia/scripts/configure-mongo-backup-slack-alert.sh

sudo curl -fsSL https://raw.githubusercontent.com/pierrot70/ClinIA/coolify/scripts/configure-mongo-backup-s3.sh \
  -o /opt/clinia/scripts/configure-mongo-backup-s3.sh

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

Slack Incoming Webhooks work well for the first alerting channel. In Slack,
create or open a ClinIA operations app, enable Incoming Webhooks, add a webhook
to the target channel, and keep the generated URL secret.

Use the helper script to store the Slack URL in a root-only env file, run a
failure-alert test, and reinstall the real daily cron only after confirming that
Slack received the test notification:

```bash
sudo /opt/clinia/scripts/configure-mongo-backup-slack-alert.sh
```

When prompted, paste either the full Slack webhook URL or only the secret suffix
in the form `/TON/URL/SLACK`. The helper writes
`/root/clinia-backup-alert.env` with mode `600` and configures cron to source
that file, so the real Slack URL is not stored in this repository. It sets
`ALERT_ON_SUCCESS=true`, so Slack receives one notification for every scheduled
backup: `ok` when the backup and upload complete, or `failed` when any step
fails.

Manual equivalent:

```bash
sudo tee /etc/cron.d/clinia-mongo-backup >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

15 5 * * * root set -a; . /root/clinia-backup-alert.env; set +a; BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep BACKUP_RETENTION_DAYS=7 BACKUP_LOG_DIR=/var/log/clinia MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- MONGO_DATABASE=clinia BACKUP_LABEL=clinia-prod /opt/clinia/scripts/scheduled-mongo-backup.sh
EOF
```

Replace the example Slack URL before enabling alerting. Do not commit the real
webhook URL; Slack treats it as a secret and may revoke leaked URLs. The wrapper
also auto-detects `hooks.slack.com` and `hooks.slack-gov.com`, but
`ALERT_WEBHOOK_FORMAT=slack` keeps the cron intent explicit.

For a non-Slack receiver, set `ALERT_WEBHOOK_FORMAT=generic`. If the receiver
needs auth, add `ALERT_WEBHOOK_BEARER_TOKEN=...` or
`ALERT_WEBHOOK_HEADER='X-Clinia-Backup-Token: ...'`.

Alert payloads must never include patient data. The wrapper sends only:
`service`, `status`, `message`, `host`, `timestamp`, and `logPath`. For Slack,
the helper enables positive backup heartbeats with `ALERT_ON_SUCCESS=true`.

Test the failure alert without touching Mongo by pointing the cron command at a
missing Mongo prefix:

```bash
sudo BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
  BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep \
  BACKUP_RETENTION_DAYS=7 \
  BACKUP_LOG_DIR=/var/log/clinia \
  ALERT_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE/REPLACE/REPLACE \
  ALERT_WEBHOOK_FORMAT=slack \
  MONGO_CONTAINER_PREFIX=missing-mongo-prefix- \
  MONGO_DATABASE=clinia \
  BACKUP_LABEL=clinia-prod \
  /opt/clinia/scripts/scheduled-mongo-backup.sh
```

Expected result: the command exits non-zero, prints
`ERROR scheduled_backup_failed log=...`, and the receiving webhook gets a
`status=failed` alert. Then rerun the normal manual scheduled-backup test with
the real Mongo prefix to confirm backups still succeed.

External S3 storage:

Use S3-compatible object storage after Slack alerting is working. The scheduled
wrapper uploads only after the local archive passes `sha256` and `gzip`
verification. It uploads:

- `clinia-prod-*.archive.gz`
- `clinia-prod-*.archive.gz.sha256`
- `clinia-prod-*.archive.gz.manifest.json` when present

Install the AWS CLI if needed:

```bash
sudo apt-get update
sudo apt-get install -y unzip

cd /tmp
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q -o awscliv2.zip
sudo ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update
aws --version
```

Configure S3 or DigitalOcean Spaces:

```bash
sudo /opt/clinia/scripts/configure-mongo-backup-s3.sh
```

When prompted:

- `S3 destination`: use a dedicated prefix, for example
  `s3://clinia-backups/mongo/prod`.
- `S3 endpoint URL`: leave blank for AWS S3. For DigitalOcean Spaces, use the
  region endpoint, for example `https://nyc3.digitaloceanspaces.com`.
- `S3 region`: use the AWS region or the Spaces region, for example
  `ca-central-1` or `nyc3`.
- Paste the access key id and secret access key. Do not paste them in Slack or
  commit them.

The helper writes `/root/clinia-backup-s3.env` with mode `600`, uploads a small
test file, and rewrites the daily cron so it sources both Slack and S3 env files.
If S3 upload fails during the daily backup, the whole backup job fails and Slack
receives the failure alert.

Manual cron equivalent with Slack and S3:

```bash
sudo tee /etc/cron.d/clinia-mongo-backup >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

15 5 * * * root set -a; . /root/clinia-backup-alert.env; . /root/clinia-backup-s3.env; set +a; BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo BACKUP_KEEP_DIR=/var/backups/clinia/mongo-keep BACKUP_RETENTION_DAYS=7 BACKUP_LOG_DIR=/var/log/clinia MONGO_CONTAINER_PREFIX=mongo-gko400wwcs44csw8000o0sss- MONGO_DATABASE=clinia BACKUP_LABEL=clinia-prod /opt/clinia/scripts/scheduled-mongo-backup.sh
EOF
```

Fetch a backup back from S3 without restoring production:

```bash
sudo bash -c '
set -a
. /root/clinia-backup-s3.env
set +a

BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
BACKUP_LABEL=clinia-prod \
/opt/clinia/scripts/fetch-mongo-backup-from-s3.sh
'
```

Expected result:

- the latest `clinia-prod-*.archive.gz` is downloaded locally;
- its `.sha256` and `.manifest.json` are downloaded when present;
- `sha256sum -c` and `gzip -t` pass;
- the helper prints the exact `restore-mongo-production.sh` command to run.

Fetch a specific S3 archive:

```bash
sudo bash -c '
set -a
. /root/clinia-backup-s3.env
set +a

S3_RESTORE_ARCHIVE=clinia-prod-YYYYMMDD-HHMMSS.archive.gz \
BACKUP_OUTPUT_DIR=/var/backups/clinia/mongo \
BACKUP_LABEL=clinia-prod \
/opt/clinia/scripts/fetch-mongo-backup-from-s3.sh
'
```

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
