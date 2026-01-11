#!/bin/bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
echo "✨ Dev mode lancé :"
echo "Frontend : http://localhost:5173"
echo "Backend  : http://localhost:4000"
echo "Mongo    : mongodb://root:example123@localhost:27017"
