# Build stage
FROM node:20-alpine AS build

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
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
