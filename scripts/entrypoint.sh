#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
./node_modules/.bin/typeorm migration:run -d dist/config/data-source.js

echo "[entrypoint] Seeding app settings (upsert — safe to re-run)..."
node dist/config/seed-app-settings.js

echo "[entrypoint] Starting TradingOn bot..."
exec node dist/main
