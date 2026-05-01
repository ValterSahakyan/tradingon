#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/tradingon}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

attempt=0
while [ "$attempt" -lt 20 ]; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
    echo "Deployment healthy"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done

echo "Deployment did not become healthy in time"
docker compose -f "$COMPOSE_FILE" ps
exit 1
