#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
./node_modules/.bin/typeorm migration:run -d server/dist/config/data-source.js

echo "[entrypoint] Seeding app settings..."
node server/dist/config/seed-app-settings.js

echo "[entrypoint] Starting TradingOn..."
exec node server/dist/main.js
