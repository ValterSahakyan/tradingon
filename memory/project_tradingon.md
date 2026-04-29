---
name: tradingon project context
description: NestJS Hyperliquid perp futures trading bot — architecture, modules, and constraints
type: project
---

Hyperliquid perpetual futures trading bot for Solana meme tokens. NestJS + TypeScript + PostgreSQL.

**Why:** Automated long/short bot targeting 100 Solana meme tokens on Hyperliquid perp DEX with 4-pattern confluence scoring.

**How to apply:** Use this context when the user asks about this bot's architecture, modules, or behavior.

Key constraints baked into code:
- Leverage: HARD CODED 3x, never configurable
- Max 5 concurrent positions
- Emergency stop at $150 capital (starting $200)
- All params in `.env` — see `.env.example`
- Bot is stateless: restarts resync from exchange via `HyperliquidClient.getOpenPositions()`

Module map:
- `MarketDataModule` — OHLCV + funding rates + market condition (BTC/SOL)
- `SignalModule` — 4 patterns: volume spike (P1, req), bull/bear flag (P2), fibonacci (P3), accumulation breakout (P4, req)
- `LoggingModule` — PostgreSQL trade_logs + daily_stats entities
- `ExecutionModule` — HyperliquidClient (REST + signing) + ExecutionService
- `PositionManagerModule` — WebSocket price feed, TP1/TP2/TP3 ladder, stop loss management
- `RiskModule` — daily/weekly limits, consecutive loss pauses, emergency capital floor
- `BotModule` — orchestrator, cron every 5min

API: `https://api.hyperliquid-testnet.xyz` (testnet default), WS: `wss://api.hyperliquid-testnet.xyz/ws`
