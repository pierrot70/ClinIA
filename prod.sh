#!/bin/bash
docker compose down

docker compose build
docker compose up -d

echo "🚀 Prod mode lancé :"
echo "Frontend : http://localhost:8080"
echo "Backend  : http://localhost:4000"
