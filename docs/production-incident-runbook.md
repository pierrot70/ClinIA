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
