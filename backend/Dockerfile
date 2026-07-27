FROM node:20-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S -g 10001 clinia && adduser -S -D -H -u 10001 -G clinia clinia
COPY --from=dependencies --chown=clinia:clinia /app/node_modules ./node_modules
COPY --chown=clinia:clinia . .

USER 10001:10001
EXPOSE 4000
CMD ["npm", "start"]
