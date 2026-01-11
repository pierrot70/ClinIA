FROM node:20-alpine

WORKDIR /app

# Copie explicite du package.json + lockfile
COPY package.json package-lock.json ./

# Install déterministe
RUN npm ci

# Copie du code
COPY . .

EXPOSE 4000
CMD ["npm", "start"]
