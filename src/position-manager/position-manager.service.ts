import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { ExecutionService } from '../execution/execution.service';
import { LoggingService } from '../logging/logging.service';
import { SignalService } from '../signal/signal.service';
import { HyperliquidClient } from '../execution/hyperliquid.client';
import { HyperliquidWsService } from './hyperliquid-ws.service';
import { ExitReason, OpenPosition, TradeSignal } from '../common/types';

@Injectable()
export class PositionManagerService implements OnModuleInit {
  private readonly logger = new Logger(PositionManagerService.name);

  private positions = new Map<string, OpenPosition>();
  private tradeLogIds = new Map<string, string>();

  constructor(
    private readonly config: ConfigService,
    private readonly execution: ExecutionService,
    private readonly logging: LoggingService,
    private readonly signal: SignalService,
    private readonly hlClient: HyperliquidClient,
    private readonly ws: HyperliquidWsService,
  ) {}

  async onModuleInit() {
    await this.syncPositionsFromExchange();
  }

  // ─── Trade open ────────────────────────────────────────────────

  async openTrade(signal: TradeSignal): Promise<boolean> {
    if (this.positions.size >= this.config.get<number>('capital.maxConcurrentPositions')) {
      this.logger.warn('Max concurrent positions reached — skipping');
      return false;
    }
    if (this.positions.has(signal.token)) {
      this.logger.warn(`Already in position: ${signal.token}`);
      return false;
    }

    const position = await this.execution.openPosition(signal);
    if (!position) return false;

    const tradeLogId = await this.logging.logTradeOpen(signal, position);
    this.positions.set(signal.token, position);
    this.tradeLogIds.set(position.id, tradeLogId);
    return true;
  }

  getOpenPositions(): Map<string, OpenPosition> { return this.positions; }
  getOpenTokens(): Set<string> { return new Set(this.positions.keys()); }
  getPositionCount(): number { return this.positions.size; }

  // ─── Price updates (WebSocket allMids) ────────────────────────

  @OnEvent('ws.mids')
  async handlePriceUpdate(mids: Record<string, string>): Promise<void> {
    // Snapshot keys so we don't iterate a mutating map
    const tokens = [...this.positions.keys()];
    for (const token of tokens) {
      const position = this.positions.get(token);
      if (!position) continue;
      // Skip if a close order is already in-flight for this coin
      if (this.hlClient.isClosing(token)) continue;

      const priceStr = mids[token];
      if (!priceStr) continue;
      const price = parseFloat(priceStr);
      if (price > 0) await this.updatePosition(position, price);
    }
  }

  // ─── Position update + exit logic ─────────────────────────────

  private async updatePosition(position: OpenPosition, currentPrice: number): Promise<void> {
    position.currentPrice = currentPrice;

    // Track trailing extreme for vol stop and TP3 trailing stop
    if (position.direction === 'long') {
      if (currentPrice > position.trailingHighest) position.trailingHighest = currentPrice;
    } else {
      if (currentPrice < position.trailingHighest) position.trailingHighest = currentPrice;
    }

    // Unrealized PnL
    const priceDiff = position.direction === 'long'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    position.unrealizedPnl = (priceDiff / position.entryPrice) * position.notional;

    // ── 1. Volatility stop — rug pull protection ─────────────────
    const volPct = this.config.get<number>('exits.volatilityStopPercent') / 100;
    const dropFromExtreme = position.direction === 'long'
      ? (position.trailingHighest - currentPrice) / position.trailingHighest
      : (currentPrice - position.trailingHighest) / position.trailingHighest;

    if (dropFromExtreme >= volPct) {
      await this.closeAndLog(position, 'volatility_stop');
      return;
    }

    // ── 2. Primary stop loss ─────────────────────────────────────
    const hitStop = position.direction === 'long'
      ? currentPrice <= position.stopPrice
      : currentPrice >= position.stopPrice;

    if (hitStop) {
      await this.closeAndLog(position, 'stop_loss');
      return;
    }

    // ── 3. Time stop ─────────────────────────────────────────────
    const maxHoldMs = this.config.get<number>('exits.maxHoldHours') * 3600_000;
    if (Date.now() - position.openTime >= maxHoldMs) {
      await this.closeAndLog(position, 'time_stop');
      return;
    }

    // ── 4. TP1 — close 50% ───────────────────────────────────────
    if (!position.tp1Hit) {
      const tp1Pct = this.config.get<number>('exits.tp1Percent') / 100;
      const tp1Price = position.direction === 'long'
        ? position.entryPrice * (1 + tp1Pct)
        : position.entryPrice * (1 - tp1Pct);
      const tp1Hit = position.direction === 'long'
        ? currentPrice >= tp1Price
        : currentPrice <= tp1Price;

      if (tp1Hit) {
        const exitPx = await this.execution.closePosition(position, position.tp1Size, 'TP1');
        if (exitPx !== null) {
          position.size -= position.tp1Size;
          position.tp1Hit = true;
          position.stopPrice = position.entryPrice; // breakeven
          this.logger.log(`TP1 hit ${position.token} — stop moved to breakeven`);
        }
      }
    }

    // ── 5. TP2 — close 35% ───────────────────────────────────────
    if (position.tp1Hit && !position.tp2Hit) {
      const tp2Pct = this.config.get<number>('exits.tp2Percent') / 100;
      const tp2Price = position.direction === 'long'
        ? position.entryPrice * (1 + tp2Pct)
        : position.entryPrice * (1 - tp2Pct);
      const tp2Hit = position.direction === 'long'
        ? currentPrice >= tp2Price
        : currentPrice <= tp2Price;

      if (tp2Hit) {
        const exitPx = await this.execution.closePosition(position, position.tp2Size, 'TP2');
        if (exitPx !== null) {
          position.size -= position.tp2Size;
          position.tp2Hit = true;
          this.logger.log(`TP2 hit ${position.token}`);
        }
      }
    }

    // ── 6. TP3 — trailing stop on remaining 15% ──────────────────
    if (position.tp1Hit && position.tp2Hit && position.size > 0) {
      const trailPct = this.config.get<number>('exits.trailingStopPercent') / 100;
      const trailStop = position.direction === 'long'
        ? position.trailingHighest * (1 - trailPct)
        : position.trailingHighest * (1 + trailPct);
      const trailHit = position.direction === 'long'
        ? currentPrice <= trailStop
        : currentPrice >= trailStop;

      if (trailHit) {
        await this.closeAndLog(position, 'TP3');
        return;
      }
    }
  }

  // ─── External / emergency close ───────────────────────────────

  async closeAllPositions(reason: ExitReason): Promise<void> {
    this.logger.warn(`Closing all positions — ${reason}`);
    const tokens = [...this.positions.keys()];
    for (const token of tokens) {
      const pos = this.positions.get(token);
      if (pos) await this.closeAndLog(pos, reason);
    }
  }

  async checkTimeStops(): Promise<void> {
    const maxHoldMs = this.config.get<number>('exits.maxHoldHours') * 3600_000;
    const tokens = [...this.positions.keys()];
    for (const token of tokens) {
      const pos = this.positions.get(token);
      if (pos && Date.now() - pos.openTime >= maxHoldMs) {
        await this.closeAndLog(pos, 'time_stop');
      }
    }
  }

  // ─── Close + log (with in-flight guard) ───────────────────────

  private async closeAndLog(position: OpenPosition, reason: ExitReason): Promise<void> {
    // Guard: if already closing this coin, skip
    if (this.hlClient.isClosing(position.token)) return;
    this.hlClient.markClosing(position.token);

    try {
      const exitPrice = await this.execution.closeFullPosition(position, reason);
      if (exitPrice === null) {
        // Order failed — will retry on next tick
        return;
      }

      const priceDiff = position.direction === 'long'
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;
      const pnlUsd = (priceDiff / position.entryPrice) * position.notional;

      const tradeLogId = this.tradeLogIds.get(position.id);
      if (tradeLogId) {
        await this.logging.logTradeClose(
          tradeLogId, exitPrice, reason, pnlUsd, 0, position.tp1Hit, position.tp2Hit,
        );
      }

      this.signal.recordTradeResult(pnlUsd >= 0);
      this.positions.delete(position.token);
      this.tradeLogIds.delete(position.id);
    } finally {
      this.hlClient.clearClosing(position.token);
    }
  }

  // ─── Restart resync ───────────────────────────────────────────

  private async syncPositionsFromExchange(): Promise<void> {
    try {
      const hlPositions = await this.hlClient.getOpenPositions();
      if (hlPositions.length === 0) return;

      this.logger.log(`Resyncing ${hlPositions.length} position(s) from exchange`);
      const stopPct = this.config.get<number>('exits.stopLossPercent') / 100;

      for (const p of hlPositions) {
        const sz = parseFloat(p.szi);
        if (sz === 0) continue;
        const entryPx = parseFloat(p.entryPx);
        const direction = sz > 0 ? 'long' : 'short';
        const absSz = Math.abs(sz);
        const notional = Math.abs(parseFloat(p.positionValue ?? '0'));

        this.positions.set(p.coin, {
          id: `${p.coin}-restored-${Date.now()}`,
          token: p.coin,
          direction,
          entryPrice: entryPx,
          currentPrice: entryPx,
          margin: parseFloat(p.marginUsed ?? '0'),
          notional,
          leverage: p.leverage?.value ?? 3,
          size: absSz,
          unrealizedPnl: parseFloat(p.unrealizedPnl ?? '0'),
          tp1Hit: false,
          tp2Hit: false,
          stopPrice: direction === 'long'
            ? entryPx * (1 - stopPct)
            : entryPx * (1 + stopPct),
          trailingHighest: entryPx,
          openTime: Date.now() - 3600_000, // conservatively assume 1h ago
          patternsFired: [],
          score: 0,
          marketCondition: 'sideways',
          tp1Size: absSz * 0.5,
          tp2Size: absSz * 0.35,
          tp3Size: absSz * 0.15,
        });
      }
    } catch (err) {
      this.logger.error(`syncPositionsFromExchange failed: ${err.message}`);
    }
  }
}
