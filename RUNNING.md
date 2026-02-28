# RUNNING.md — recovery & quick-start

This file contains quick commands and notes to recover the project state and start the local stack.

1) Git / branch

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git branch -vv
git remote -v
```

Push the current branch if you need to preserve work:

```bash
git push origin $(git rev-parse --abbrev-ref HEAD)
```

2) Create a local `.env` from `.env.example` (DO NOT COMMIT secrets)

```bash
cp .env.example .env
# Edit .env and fill OPENAI_API_KEY, JWT_SECRET, MONGO_INITDB_ROOT_PASSWORD, etc.
```

3) Start local development stack

```bash
# Option A (recommended local helper)
./rebuild-local.sh DEV

# Option B (docker compose)
docker compose -f docker-compose-local.yml up -d

# Check containers and logs
docker compose -f docker-compose-local.yml ps
docker compose -f docker-compose-local.yml logs backend --tail=200
```

4) Quick API tests

```bash
curl -X POST http://localhost:4000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"symptoms":["test"]}'

# For real OpenAI call (requires OPENAI_API_KEY in .env)
curl -X POST http://localhost:4000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"symptoms":["test"],"forceReal":true}'
```

5) Useful files

- `backend/index.js` — backend entrypoint and API routes
- `frontend/vite.config.ts` — vite dev server & proxy
- `docker-compose.yml` — production compose (Traefik labels for Coolify)
- `docker-compose-local.yml` — local compose used by `rebuild-local.sh`

6) Backups & diagnostics

```bash
docker compose -f docker-compose-local.yml logs --tail=500 > diagnostics/all-logs.txt
docker compose -f docker-compose-local.yml ps > diagnostics/compose-ps.txt
```

Security note: never commit secrets. Use Coolify secrets or an external secret manager for production.
