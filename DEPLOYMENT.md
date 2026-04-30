# Production deployment

This project is set up to run on an Ubuntu server with Docker Compose, behind Nginx, at `yogurtsoftware.online`.

## 1. Server prerequisites

Install the required packages on the Ubuntu server:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx curl
sudo systemctl enable --now docker nginx
```

Create the application directory:

```bash
sudo mkdir -p /opt/tradingon
sudo chown -R $USER:$USER /opt/tradingon
```

## 2. Environment file

Create `/opt/tradingon/.env` on the server. The deployment workflow does not overwrite it.

Minimum example:

```env
PORT=3002
POSTGRES_DB=tradingon
POSTGRES_USER=tradingon
POSTGRES_PASSWORD=change-me
DASHBOARD_ALLOWED_WALLET=0xYourWalletAddress
DASHBOARD_AUTH_SECRET=replace-with-a-random-32-plus-character-secret
DASHBOARD_SESSION_TTL_HOURS=12
DATABASE_SSL=false
TYPEORM_SYNCHRONIZE=false
HYPERLIQUID_PRIVATE_KEY=replace-me
```

Add the rest of your runtime variables there as needed for the trading bot.

## 3. Nginx

Copy [nginx/tradingon.conf](/c:/work/tradingon/nginx/tradingon.conf) to `/etc/nginx/sites-available/tradingon.conf`, enable it, and reload Nginx:

```bash
sudo cp /opt/tradingon/nginx/tradingon.conf /etc/nginx/sites-available/tradingon.conf
sudo ln -sf /etc/nginx/sites-available/tradingon.conf /etc/nginx/sites-enabled/tradingon.conf
sudo nginx -t
sudo systemctl reload nginx
```

Then issue the TLS certificate:

```bash
sudo certbot --nginx -d yogurtsoftware.online -d www.yogurtsoftware.online
```

## 4. GitHub Actions secrets

Add these repository secrets before enabling deploys:

- `APP_DIR` = `/opt/tradingon`
- `SSH_HOST` = your server IP or DNS name
- `SSH_PORT` = `22`
- `SSH_PRIVATE_KEY` = private key for the deploy user
- `SSH_USER` = deploy user on the server

The deploy workflow syncs the repository to the server and runs [scripts/deploy-prod.sh](/c:/work/tradingon/scripts/deploy-prod.sh), which rebuilds the Docker image and restarts the stack.

## 5. Deploy flow

- CI runs on pull requests and pushes to `main`.
- CD runs on pushes to `main` and on manual dispatch.
- The app is exposed only on `127.0.0.1:3002`; Nginx is the public entrypoint.
- Health is checked at `http://127.0.0.1:3002/api/health` during deploy.

## 6. Manual recovery commands

From `/opt/tradingon` on the server:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1:3002/api/health
```
