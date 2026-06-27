# ClinIA - Guide de reproduction du setup de developpement

Ce document decrit le setup de developpement utilise pour ClinIA sur le
poste `pierre-new`: Windows + WSL Ubuntu + Docker Desktop + Codex + acces
iPhone par Tailscale.

Objectif: permettre a un nouveau developpeur de reproduire l'environnement
local sans deviner les pieces critiques.

Ne jamais copier ici de vrais secrets. Les valeurs ci-dessous sont des
placeholders.

## Vue d'ensemble

- Branche de travail: `coolify`
- Frontend local: `http://localhost:5173`
- Backend local: `http://localhost:4000`
- Mongo local: `localhost:27017`
- Mongo Express local: `http://localhost:8081`
- Mailpit local: `http://localhost:8025`
- Mailpit SMTP local: `mailpit:1025` depuis Docker
- Acces iPhone local: via Tailscale, par exemple `http://<tailscale-ip>:5173`
- Production: Coolify + domaine `https://clinique-ai.ca`
- Deploiement production: manuel dans Coolify apres push Git

## Prerequis poste Windows

1. Windows Pro.
2. WSL 2 avec Ubuntu.
3. Docker Desktop avec integration WSL activee.
4. Git dans WSL.
5. Node/npm disponibles dans les conteneurs Docker. Le setup normal passe par
   Docker; il n'est pas necessaire d'installer toutes les dependances Node sur
   Windows.
6. Tailscale installe sur Windows et sur iPhone pour l'acces hors Wi-Fi.
7. Optionnel: Remote Desktop active sur Windows Pro pour depannage d'urgence
   depuis iPhone.

Verification rapide:

```bash
wsl -d Ubuntu
docker version
docker compose version
git --version
```

## Recuperer le code

Depuis WSL:

```bash
cd ~
git clone git@github.com:pierrot70/ClinIA.git clinia-test
cd ~/clinia-test
git checkout coolify
git pull origin coolify
```

Verifier:

```bash
git status --short --branch
git remote -v
```

Note: `cookies.txt` peut exister localement. Il ne doit pas etre commite.

## Variables d'environnement locales

Creer `.env` a partir de l'exemple:

```bash
cp .env.example .env
nano .env
```

Exemple minimal local, sans secrets reels:

```dotenv
# OpenAI
OPENAI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=<openai-api-key>

# ClinIA
CLINIA_MOCK_AI=false
CLINIA_ALLOW_SELF_REGISTRATION=true
NODE_ENV=development

# JWT
JWT_SECRET=<random-long-secret>
JWT_ACCESS_SECRET=<random-long-secret>

# Mongo
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<random-root-password>
MONGO_APP_USERNAME=clinia_app
MONGO_APP_PASSWORD=<random-app-password>
MONGO_URI=mongodb://clinia_app:<url-encoded-app-password>@localhost:27017/clinia?authSource=clinia
MONGO_URI_DOCKER=mongodb://clinia_app:<url-encoded-app-password>@mongo:27017/clinia?authSource=clinia
MONGO_ADMIN_URI_DOCKER=mongodb://root:<url-encoded-root-password>@mongo:27017/?authSource=admin
MONGO_EXPRESS_USERNAME=<local-admin-name>
MONGO_EXPRESS_PASSWORD=<random-mongo-express-password>

# Frontend/API
VITE_API_URL=
CLINIA_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://<tailscale-ip>:5173
```

Important:

- Encoder les caracteres speciaux des mots de passe dans les URI Mongo.
  Exemple: `!` devient `%21`.
- Ne jamais utiliser l'utilisateur Mongo `root` pour le backend.
- En local, `docker-compose-local.yml` configure Mailpit automatiquement:
  `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`.
- En production, configurer SMTP dans Coolify avec les vraies constantes du
  fournisseur choisi.

## Demarrer le stack local

Option recommandee:

```bash
cd ~/clinia-test
./rebuild-local.sh DEV
```

Option plus directe:

```bash
docker compose -p clinia_local -f docker-compose-local.yml up -d --build
```

Verifier les conteneurs:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Noms attendus:

- `clinia_local-frontend-1`
- `clinia_local-backend-1`
- `clinia_local-mongo-1`
- `clinia_local-mongo-express-1`
- `clinia_local-mailpit-1`

URLs locales:

- App: `http://localhost:5173/clinical-demo`
- API health/status: `http://localhost:4000/api/auth/app-status`
- Mailpit: `http://localhost:8025`
- Mongo Express: `http://localhost:8081`

Verification API:

```bash
curl -i http://localhost:4000/api/auth/app-status
```

## Staging local avec Mongo replica set

Le mode `STAGING` sert a reproduire localement une topologie plus proche de
Coolify/production, sans frais cloud et sans toucher aux donnees production.

Il lance:

- `mongo-rs-1`, `mongo-rs-2`, `mongo-rs-3` dans le replica set `rs0`;
- un backend principal sur `http://localhost:4002`;
- un backend replica sur `http://localhost:4003`;
- la base locale `clinia` dans le stack Docker `clinia_mongo_rs`.

Demarrer ou reconstruire le staging local:

```bash
./rebuild-local.sh STAGING
```

Resultat attendu:

```text
Staging ready
Backend primary : http://localhost:4002
Backend replica : http://localhost:4003
```

Le script verifie aussi que Mongo termine avec:

```text
mongo-rs-1: PRIMARY, health: 1
mongo-rs-2: SECONDARY, health: 1
mongo-rs-3: SECONDARY, health: 1
```

Pour inspecter le stack:

```bash
docker compose -p clinia_mongo_rs -f docker-compose-mongo-rs-local.yml ps
```

### Drill CRUD patients

Le drill patient valide le cycle complet `create`, `read`, `update`, `delete`
sur l'API staging. Il cree un patient marque par `created_by_reference`, le
supprime, puis verifie qu'aucun patient zombie ne reste.

Sortie concise:

```bash
VERBOSE=0 ./scripts/run-staging-patient-write-drill.sh
```

Resultat attendu:

```text
Testing patients collection
Mongo replica set before drill: 3/3 healthy, primary=1, secondaries=2
Patient documents before drill: 4
 - creating patient OK
 - reading patient OK
 - updating patient OK
 - deleting patient OK
Patient documents after drill: 4
Mongo replica set after drill: 3/3 healthy, primary=1, secondaries=2
```

Le nombre de documents avant/apres doit rester identique. Si une etape echoue,
le script affiche `FAILED` et tente quand meme le cleanup par marqueur.

### Drill resilience patients

Le drill resilience automatise les scenarios Mongo les plus utiles pour la
collection `patients`:

- CRUD en etat normal `3/3`;
- arret d'un secondary et CRUD en `2/3`;
- redemarrage du secondary et retour `3/3`;
- arret du primary, election d'un nouveau primary, puis CRUD en `2/3`;
- redemarrage de l'ancien primary et retour final `3/3`.

Commande:

```bash
./scripts/run-staging-patient-resilience-drill.sh
```

Resultat attendu a la fin:

```text
INFO STAGING_PATIENT_RESILIENCE_DRILL_PASSED
```

Ce drill doit toujours laisser la collection `patients` avec le meme nombre de
documents qu'au depart de chaque sous-test.

## Acces depuis iPhone avec Tailscale

1. Installer Tailscale sur Windows et iPhone.
2. Connecter les deux appareils au meme compte Tailnet.
3. Trouver l'IP Tailscale du Lenovo:

```bash
tailscale ip -4
```

4. Sur iPhone, ouvrir:

```text
http://<tailscale-ip>:5173/clinical-demo
```

Pourquoi `VITE_API_URL` doit rester vide en local:

- Le frontend appelle `/api`.
- Vite proxy la requete vers le backend Docker.
- L'iPhone n'essaie pas d'appeler son propre `localhost:4000`.

Si l'iPhone voit le frontend mais que les appels API echouent, verifier:

```bash
curl -i http://localhost:4000/api/auth/app-status
docker logs --tail 80 clinia_local-backend-1
```

Verifier aussi `CLINIA_ALLOWED_ORIGINS` si le backend bloque l'origine.

## Mailpit et recuperation de mot de passe

Mailpit capture les courriels envoyes localement.

- Interface: `http://localhost:8025`
- SMTP Docker: `mailpit:1025`

Test typique:

```bash
curl -s -X POST http://localhost:4000/api/auth/password-recovery/request \
  -H "Content-Type: application/json" \
  -d '{"email":"cloisonnement-a@clinia.local"}' | jq
```

Puis ouvrir Mailpit et lire le code a six chiffres.

Note: seul un compte existant recoit un courriel. Pour un compte inexistant,
l'API retourne volontairement un message generique.

## Tests et commandes utiles

Tests frontend cibles:

```bash
docker exec clinia_local-frontend-1 npm test -- --run src/components/ClinicalDemoResult.test.tsx
docker exec clinia_local-frontend-1 npm test -- --run src/components/admin/ClinicianInboxModal.test.tsx
```

Build frontend:

```bash
docker exec clinia_local-frontend-1 npm run build
```

Tests backend:

```bash
docker exec clinia_local-backend-1 npm test -- --run
```

Logs:

```bash
docker logs --tail 100 clinia_local-backend-1
docker logs --tail 100 clinia_local-frontend-1
```

Redemarrer un service:

```bash
docker restart clinia_local-backend-1
docker restart clinia_local-frontend-1
```

## Workflow Codex et Git

Flux courant:

1. Travailler localement avec Codex.
2. Tester dans Docker local.
3. Commit sur la branche `coolify`.
4. Push vers GitHub.
5. Declencher le deploiement manuellement dans Coolify.
6. Tester `https://clinique-ai.ca`.

Commandes:

```bash
git status --short --branch
git add <fichiers>
git commit -m "feat: description courte"
git push origin coolify
```

Le depot active des hooks locaux via `.githooks`. Le hook `pre-push` peut ouvrir
une fenetre Zenity de confirmation. Dans Codex Windows, cette fenetre peut etre
masquee. Si le push a deja ete explicitement approuve dans la conversation et
que les tests ont passe, il est possible de pousser sans ce hook local:

```bash
git push --no-verify origin coolify
```

Ne pas utiliser `--no-verify` pour contourner des tests ou controles de secrets.

## Coolify et production

Production utilise `docker-compose.yml` et des variables d'environnement
definies dans Coolify.

Variables critiques:

```dotenv
NODE_ENV=production
CLINIA_MOCK_AI=false
OPENAI_API_KEY=<production-openai-key>
JWT_SECRET=<production-random-secret>
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<production-root-password>
MONGO_URI=mongodb://clinia_app:<url-encoded-app-password>@mongo:27017/clinia?authSource=clinia
```

Regles importantes:

- Une seule variable `MONGO_URI` valide dans Coolify.
- `MONGO_URI` doit commencer par `mongodb://` ou `mongodb+srv://`.
- `MONGO_URI` doit utiliser `clinia_app`, pas `root`.
- Le deploiement est manuel pour l'instant, volontairement.

Verifier production apres deploiement:

```bash
curl -i https://clinique-ai.ca/api/auth/app-status
```

## Remote Desktop depuis iPhone

Usage: depannage seulement, par exemple redemarrer Docker Desktop ou VS Code.

1. Windows Pro: activer Remote Desktop.
2. Tailscale actif sur Windows et iPhone.
3. Dans Windows App / Remote Desktop sur iPhone:
   - PC: `<tailscale-ip>:3389`
   - Username possible pour compte Microsoft:
     `MicrosoftAccount\<adresse-email-microsoft>`
   - Password: mot de passe du compte Microsoft, pas le PIN Windows.

Le PIN Windows ne remplace pas le mot de passe pour RDP.

## Eviter la veille Windows

Pour que Codex et Docker restent accessibles:

1. Windows Settings.
2. System.
3. Power.
4. Mettre la veille automatique a `Never` quand le desktop est branche au AC.

Le redemarrage automatique de Codex/ClinIA n'est pas requis dans le setup
actuel. Le choix courant est de redemarrer manuellement apres un reboot Windows.

## Depannage

### Le frontend marche sur iPhone, mais pas les appels API

Verifier que `VITE_API_URL` est vide en local et que les appels passent par
`/api`.

Verifier:

```bash
curl -i http://localhost:4000/api/auth/app-status
docker logs --tail 80 clinia_local-backend-1
```

### Backend en boucle de redemarrage

Inspecter les logs:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 80 <backend-container>
```

Erreur connue:

```text
Invalid scheme, expected connection string to start with "mongodb://"
```

Cause probable: `MONGO_URI` mal definie ou variable dupliquee dans Coolify.

### MONGO_URI Coolify invalide

Diagnostiquer sans afficher le secret:

```bash
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep '^backend-' | head -n1)
docker inspect "$BACKEND_CONTAINER" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' |
sed -nE 's#^MONGO_URI=mongodb://([^:]+):.*#Utilisateur Mongo: \1#p'
```

Attendu:

```text
Utilisateur Mongo: clinia_app
```

### Mailpit ne recoit rien

Verifier que le compte existe. L'API ne revele pas si un email est inconnu.

Verifier les variables backend locales:

```bash
docker exec clinia_local-backend-1 printenv | grep '^SMTP_'
```

Attendu:

```text
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
```

### Popup de push masquee

Si `git push` semble bloquer, le hook `.githooks/pre-push` attend peut-etre une
confirmation Zenity cachee derriere Codex Windows.

Solutions:

- Retrouver la fenetre et approuver.
- Ou, si le push est explicitement voulu et les tests ont passe:

```bash
git push --no-verify origin coolify
```

### Lenovo inaccessible apres quelques minutes

Verifier:

- Tailscale actif.
- Windows ne dort pas.
- Docker Desktop toujours ouvert.
- Les conteneurs tournent:

```bash
docker ps
```

## Sources inspectees pour ce guide

- `RUNNING.md`
- `.env.example`
- `docker-compose-local.yml`
- `docker-compose-mongo-rs-local.yml`
- `docker-compose.yml`
- `dev.sh`
- `rebuild-local.sh`
- `scripts/run-staging-patient-write-drill.sh`
- `scripts/run-staging-patient-resilience-drill.sh`
- `.githooks/pre-push`
- `docs/mongo-credential-rotation.md`
- `backend/package.json`
- `frontend/package.json`
- Historique operationnel du setup ClinIA/Coolify/Tailscale documente dans
  cette session Codex.
