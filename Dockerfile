# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install all deps (dev included — needed for build tools)
RUN npm ci && npm --prefix frontend ci

# Copy full source
COPY . .

# Build frontend → /app/public, then NestJS → /app/dist
RUN npm run build:all

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled backend
COPY --from=builder /app/dist ./dist

# Built frontend (served as static files by NestJS ServeStaticModule)
COPY --from=builder /app/public ./public

# Startup script
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
