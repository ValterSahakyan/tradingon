# TradingOn Deployment

## Local development

1. Copy `.env.example` to `.env` and fill in secrets.
2. Start Postgres:

```bash
docker compose up -d db
```

3. Start frontend and backend together:

```bash
npm run dev:all
```

The frontend runs on `http://localhost:5173` and proxies `/api` to the Nest backend on `PORT`.

## Production with Docker

1. Prepare a production `.env` on the server.
2. Build and start the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

3. Check health:

```bash
curl http://127.0.0.1:${PORT:-3000}/api/health
```

The backend serves the built frontend from `public/`, so the production app runs as a single origin.

## CI/CD

`CI` workflow:

- installs dependencies
- runs `npm run typecheck`
- runs `npm run build:all`
- runs `npm test`
- builds the Docker image
- on pushes to `main`, runs the deploy job after CI passes
- syncs the repo to the target server over SSH
- runs `scripts/deploy-prod.sh`

Required GitHub secrets for deployment:

- `SSH_PRIVATE_KEY`
- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `APP_DIR`
