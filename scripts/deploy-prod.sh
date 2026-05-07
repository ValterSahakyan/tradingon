#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/tradingon}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env"
  exit 1
fi

PORT_VALUE="$(grep -E '^PORT=' .env | tail -n 1 | cut -d '=' -f 2- | tr -d '\r' || true)"
PORT_VALUE="${PORT_VALUE:-3000}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:${PORT_VALUE}/api/health/live}"

docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

attempt=0
while [ "$attempt" -lt 36 ]; do
  APP_HEALTH_STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' tradingon-app 2>/dev/null || true)"
  if [ "$APP_HEALTH_STATUS" = "healthy" ] && curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
    echo "Deployment healthy"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 5
done

echo "Deployment did not become healthy in time"
docker compose -f "$COMPOSE_FILE" ps
echo "----- app logs (tail) -----"
docker compose -f "$COMPOSE_FILE" logs --tail=200 app || true
echo "----- db logs (tail) -----"
docker compose -f "$COMPOSE_FILE" logs --tail=100 db || true
exit 1
