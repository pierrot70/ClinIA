# Build stage
FROM node:24-alpine AS build

WORKDIR /app

# Copie explicite du package.json + lockfile pour un cache Docker stable
COPY package.json package-lock.json ./

# Install déterministe (inclut devDependencies pour le build)
RUN npm ci --include=dev

# Copie du reste du code
COPY . .

# Build (prod) - utilise la config standard du projet
RUN npm run build

# Prod stage. This Nginx variant runs as an unprivileged user and listens on 8080.
FROM nginx/nginx-unprivileged:1.30.7-alpine@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
