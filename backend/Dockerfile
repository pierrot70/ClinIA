FROM node:20-alpine

WORKDIR /app

# 1. Copier package.json et installer dépendances
COPY package.json .
RUN npm install

# 2. Copier tout ton backend
COPY . .

# 3. Inclure le .env (si tu veux le mettre dans l’image)
COPY .env .env

EXPOSE 4000

CMD ["npm", "start"]
