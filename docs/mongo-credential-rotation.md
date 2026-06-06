# Mongo credential rotation

The Mongo root password was previously committed to Git. Removing it from the
current files does not invalidate copies in Git history, clones, logs, or
caches. Rotate it everywhere before considering the credential secure.

## Target state

- Mongo `root` is used only for database administration.
- ClinIA backend uses a dedicated user with `readWrite` on the `clinia`
  database only.
- Local secrets live in `.env`, which is ignored by Git.
- Production secrets live in Coolify environment secrets.
- Production startup refuses a `MONGO_URI` whose username is `root`.

## Required variables

Local `.env`:

```dotenv
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<new-random-root-password>
MONGO_APP_USERNAME=clinia_app
MONGO_APP_PASSWORD=<new-random-app-password>
MONGO_URI=mongodb://clinia_app:<url-encoded-app-password>@localhost:27017/clinia?authSource=clinia
MONGO_URI_DOCKER=mongodb://clinia_app:<url-encoded-app-password>@mongo:27017/clinia?authSource=clinia
MONGO_ADMIN_URI_DOCKER=mongodb://root:<url-encoded-root-password>@mongo:27017/?authSource=admin
MONGO_EXPRESS_USERNAME=<new-mongo-express-username>
MONGO_EXPRESS_PASSWORD=<new-mongo-express-password>
```

Coolify secrets:

```dotenv
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<new-random-root-password>
MONGO_URI=mongodb://clinia_app:<url-encoded-app-password>@mongo:27017/clinia?authSource=clinia
```

Do not reuse the root password for the application user or Mongo Express.

## Existing database migration

Changing `MONGO_INITDB_ROOT_PASSWORD` does not update an existing Mongo volume.
The database password must be changed inside Mongo first.

Before rotating production credentials:

1. Take and verify a database backup.
2. Keep the current deployment running.
3. Open a Mongo shell inside the Mongo container using the current root
   credential.

Create or update the limited application user:

```javascript
use clinia

db.createUser({
  user: "clinia_app",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "clinia" }]
})
```

If `clinia_app` already exists:

```javascript
use clinia
db.updateUser("clinia_app", {
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "clinia" }]
})
```

Verify the application user before changing the backend:

```bash
mongosh \
  "mongodb://clinia_app@mongo:27017/clinia?authSource=clinia" \
  --password
```

Then update `MONGO_URI` in Coolify and redeploy the backend. Confirm the health
endpoint and authenticated workflows work before rotating root.

Rotate root last:

```javascript
use admin
db.changeUserPassword("root", passwordPrompt())
```

Immediately update `MONGO_INITDB_ROOT_PASSWORD` in Coolify after changing it.

## Verification

Confirm no tracked secret remains:

```bash
./scripts/check-tracked-secrets.sh
```

Confirm production rejects root:

```bash
NODE_ENV=production \
MONGO_URI='mongodb://root:example@mongo:27017/clinia?authSource=admin' \
npm --prefix backend test -- --run app/__tests__/startServer.test.js
```

Confirm the deployed backend remains healthy after switching to the limited
application user:

```bash
curl -i https://clinique-ai.ca/api/auth/app-status
```

