#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tradingon}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" pull db
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

for _ in $(seq 1 20); do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
    echo "Deployment healthy"
    exit 0
  fi
  sleep 5
done

echo "Deployment did not become healthy in time"
docker compose -f "$COMPOSE_FILE" ps
exit 1
