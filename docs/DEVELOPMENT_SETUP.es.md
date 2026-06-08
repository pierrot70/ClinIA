# ClinIA - Guia para reproducir el entorno de desarrollo

Este documento describe el entorno de desarrollo utilizado para ClinIA en el
equipo `pierre-new`: Windows + WSL Ubuntu + Docker Desktop + Codex + acceso
desde iPhone mediante Tailscale.

Objetivo: permitir que un nuevo desarrollador reproduzca el entorno local sin
tener que adivinar sus componentes criticos.

Nunca se deben copiar secretos reales en este documento. Los valores que
aparecen a continuacion son marcadores de posicion.

## Descripcion general

- Rama de trabajo: `coolify`
- Frontend local: `http://localhost:5173`
- Backend local: `http://localhost:4000`
- Mongo local: `localhost:27017`
- Mongo Express local: `http://localhost:8081`
- Mailpit local: `http://localhost:8025`
- SMTP local de Mailpit: `mailpit:1025` desde Docker
- Acceso local desde iPhone: mediante Tailscale, por ejemplo
  `http://<tailscale-ip>:5173`
- Produccion: Coolify + dominio `https://clinique-ai.ca`
- Despliegue a produccion: manual en Coolify despues de hacer push a Git

## Requisitos del equipo Windows

1. Windows Pro.
2. WSL 2 con Ubuntu.
3. Docker Desktop con la integracion WSL activada.
4. Git instalado en WSL.
5. Node/npm disponibles en los contenedores Docker. El entorno normal utiliza
   Docker; no es necesario instalar todas las dependencias Node en Windows.
6. Tailscale instalado en Windows y en el iPhone para el acceso fuera de la red
   Wi-Fi.
7. Opcional: Remote Desktop activado en Windows Pro para resolver emergencias
   desde el iPhone.

Verificacion rapida:

```bash
wsl -d Ubuntu
docker version
docker compose version
git --version
```

## Obtener el codigo

Desde WSL:

```bash
cd ~
git clone git@github.com:pierrot70/ClinIA.git clinia-test
cd ~/clinia-test
git checkout coolify
git pull origin coolify
```

Verificar:

```bash
git status --short --branch
git remote -v
```

Nota: `cookies.txt` puede existir localmente. No debe incluirse en ningun
commit.

## Variables de entorno locales

Crear `.env` a partir del archivo de ejemplo:

```bash
cp .env.example .env
nano .env
```

Ejemplo local minimo, sin secretos reales:

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

Importante:

- Codificar los caracteres especiales de las contrasenas en las URI de Mongo.
  Ejemplo: `!` se convierte en `%21`.
- Nunca utilizar el usuario Mongo `root` para el backend.
- En local, `docker-compose-local.yml` configura Mailpit automaticamente:
  `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`.
- En produccion, configurar SMTP en Coolify con las variables reales del
  proveedor seleccionado.

## Iniciar el entorno local

Opcion recomendada:

```bash
cd ~/clinia-test
./rebuild-local.sh DEV
```

Opcion mas directa:

```bash
docker compose -p clinia_local -f docker-compose-local.yml up -d --build
```

Verificar los contenedores:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Nombres esperados:

- `clinia_local-frontend-1`
- `clinia_local-backend-1`
- `clinia_local-mongo-1`
- `clinia_local-mongo-express-1`
- `clinia_local-mailpit-1`

Direcciones locales:

- Aplicacion: `http://localhost:5173/clinical-demo`
- Estado de la API: `http://localhost:4000/api/auth/app-status`
- Mailpit: `http://localhost:8025`
- Mongo Express: `http://localhost:8081`

Verificacion de la API:

```bash
curl -i http://localhost:4000/api/auth/app-status
```

## Acceso desde iPhone mediante Tailscale

1. Instalar Tailscale en Windows y en el iPhone.
2. Conectar ambos dispositivos a la misma cuenta Tailnet.
3. Obtener la direccion IP Tailscale del equipo Lenovo:

```bash
tailscale ip -4
```

4. Abrir en el iPhone:

```text
http://<tailscale-ip>:5173/clinical-demo
```

Por que `VITE_API_URL` debe permanecer vacio en local:

- El frontend llama a `/api`.
- Vite reenvia la solicitud al backend Docker mediante su proxy.
- El iPhone no intenta llamar a su propio `localhost:4000`.

Si el iPhone muestra el frontend pero las llamadas API fallan, verificar:

```bash
curl -i http://localhost:4000/api/auth/app-status
docker logs --tail 80 clinia_local-backend-1
```

Verificar tambien `CLINIA_ALLOWED_ORIGINS` si el backend bloquea el origen.

## Mailpit y recuperacion de contrasena

Mailpit captura los correos electronicos enviados localmente.

- Interfaz: `http://localhost:8025`
- SMTP desde Docker: `mailpit:1025`

Prueba tipica:

```bash
curl -s -X POST http://localhost:4000/api/auth/password-recovery/request \
  -H "Content-Type: application/json" \
  -d '{"email":"cloisonnement-a@clinia.local"}' | jq
```

Despues, abrir Mailpit y leer el codigo de seis digitos.

Nota: solo una cuenta existente recibe un correo electronico. Para una cuenta
inexistente, la API devuelve deliberadamente un mensaje generico.

## Pruebas y comandos utiles

Pruebas frontend especificas:

```bash
docker exec clinia_local-frontend-1 npm test -- --run src/components/ClinicalDemoResult.test.tsx
docker exec clinia_local-frontend-1 npm test -- --run src/components/admin/ClinicianInboxModal.test.tsx
```

Compilar el frontend:

```bash
docker exec clinia_local-frontend-1 npm run build
```

Pruebas backend:

```bash
docker exec clinia_local-backend-1 npm test -- --run
```

Registros:

```bash
docker logs --tail 100 clinia_local-backend-1
docker logs --tail 100 clinia_local-frontend-1
```

Reiniciar un servicio:

```bash
docker restart clinia_local-backend-1
docker restart clinia_local-frontend-1
```

## Flujo de trabajo con Codex y Git

Flujo actual:

1. Trabajar localmente con Codex.
2. Probar los cambios en Docker local.
3. Crear un commit en la rama `coolify`.
4. Hacer push a GitHub.
5. Iniciar manualmente el despliegue en Coolify.
6. Probar `https://clinique-ai.ca`.

Comandos:

```bash
git status --short --branch
git add <files>
git commit -m "feat: short description"
git push origin coolify
```

El repositorio activa hooks locales mediante `.githooks`. El hook `pre-push`
puede abrir una ventana de confirmacion Zenity. En Codex Windows, esta ventana
puede quedar oculta. Si el push ya fue aprobado explicitamente en la
conversacion y las pruebas pasaron, se puede hacer push sin este hook local:

```bash
git push --no-verify origin coolify
```

No utilizar `--no-verify` para omitir pruebas ni controles de secretos.

## Coolify y produccion

Produccion utiliza `docker-compose.yml` y variables de entorno configuradas en
Coolify.

Variables criticas:

```dotenv
NODE_ENV=production
CLINIA_MOCK_AI=false
OPENAI_API_KEY=<production-openai-key>
JWT_SECRET=<production-random-secret>
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=<production-root-password>
MONGO_URI=mongodb://clinia_app:<url-encoded-app-password>@mongo:27017/clinia?authSource=clinia
```

Reglas importantes:

- Debe existir una sola variable `MONGO_URI` valida en Coolify.
- `MONGO_URI` debe comenzar con `mongodb://` o `mongodb+srv://`.
- `MONGO_URI` debe utilizar `clinia_app`, no `root`.
- Por ahora, el despliegue es manual de manera intencional.

Verificar produccion despues del despliegue:

```bash
curl -i https://clinique-ai.ca/api/auth/app-status
```

## Remote Desktop desde iPhone

Uso: solamente para resolver problemas, por ejemplo reiniciar Docker Desktop o
VS Code.

1. Windows Pro: activar Remote Desktop.
2. Tailscale activo en Windows y en el iPhone.
3. En Windows App / Remote Desktop para iPhone:
   - PC: `<tailscale-ip>:3389`
   - Nombre de usuario posible para una cuenta Microsoft:
     `MicrosoftAccount\<microsoft-email-address>`
   - Contrasena: la contrasena de la cuenta Microsoft, no el PIN de Windows.

El PIN de Windows no sustituye la contrasena para RDP.

## Evitar la suspension de Windows

Para que Codex y Docker permanezcan accesibles:

1. Abrir Windows Settings.
2. Abrir System.
3. Abrir Power.
4. Configurar la suspension automatica como `Never` cuando el equipo de
   escritorio este conectado a la corriente.

El inicio automatico de Codex/ClinIA no es necesario en el entorno actual. La
decision actual es reiniciarlos manualmente despues de reiniciar Windows.

## Solucion de problemas

### El frontend funciona en iPhone, pero las llamadas API no funcionan

Verificar que `VITE_API_URL` este vacio en local y que las llamadas pasen por
`/api`.

Verificar:

```bash
curl -i http://localhost:4000/api/auth/app-status
docker logs --tail 80 clinia_local-backend-1
```

### El backend se reinicia continuamente

Examinar los registros:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 80 <backend-container>
```

Error conocido:

```text
Invalid scheme, expected connection string to start with "mongodb://"
```

Causa probable: `MONGO_URI` esta mal configurada o existe mas de una variable
con ese nombre en Coolify.

### MONGO_URI no valida en Coolify

Diagnosticar sin mostrar el secreto:

```bash
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep '^backend-' | head -n1)
docker inspect "$BACKEND_CONTAINER" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' |
sed -nE 's#^MONGO_URI=mongodb://([^:]+):.*#Usuario Mongo: \1#p'
```

Resultado esperado:

```text
Usuario Mongo: clinia_app
```

### Mailpit no recibe ningun correo

Verificar que la cuenta exista. La API no revela si un correo electronico es
desconocido.

Verificar las variables locales del backend:

```bash
docker exec clinia_local-backend-1 printenv | grep '^SMTP_'
```

Resultado esperado:

```text
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
```

### Ventana de confirmacion de push oculta

Si `git push` parece bloqueado, el hook `.githooks/pre-push` puede estar
esperando una confirmacion Zenity oculta detras de Codex Windows.

Soluciones:

- Encontrar la ventana y aprobar el push.
- O, si el push fue solicitado explicitamente y las pruebas pasaron:

```bash
git push --no-verify origin coolify
```

### El equipo Lenovo deja de estar accesible despues de algunos minutos

Verificar:

- Tailscale activo.
- Windows no esta suspendido.
- Docker Desktop sigue abierto.
- Los contenedores estan activos:

```bash
docker ps
```

## Fuentes consultadas para esta guia

- `RUNNING.md`
- `.env.example`
- `docker-compose-local.yml`
- `docker-compose.yml`
- `dev.sh`
- `rebuild-local.sh`
- `.githooks/pre-push`
- `docs/mongo-credential-rotation.md`
- `backend/package.json`
- `frontend/package.json`
- Historial operativo del entorno ClinIA/Coolify/Tailscale documentado en esta
  sesion de Codex.
