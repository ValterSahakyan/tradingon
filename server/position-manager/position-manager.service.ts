import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { OnEvent } from '@nestjs/event-emitter';
import { ExecutionService } from '../execution/execution.service';
import { LoggingService } from '../logging/logging.service';
import { SignalService } from '../signal/signal.service';
import { HyperliquidClient } from '../execution/hyperliquid.client';
import { HyperliquidWsService } from './hyperliquid-ws.service';
import { ExitReason, OpenPosition, TradeSignal } from '../common/types';
import { RiskService } from '../risk/risk.service';

@Injectable()
export class PositionManagerService implements OnModuleInit {
  private readonly logger = new Logger(PositionManagerService.name);

  private positions = new Map<string, OpenPosition>();
  private tradeLogIds = new Map<string, string>();

  constructor(
    private readonly config: AppConfigService,
    private readonly execution: ExecutionService,
    private readonly logging: LoggingService,
    private readonly signal: SignalService,
    private readonly hlClient: HyperliquidClient,
    private readonly ws: HyperliquidWsService,
    private readonly risk: RiskService,
  ) {}

  onModuleInit() {
    void this.syncPositionsFromExchange();
  }

  @OnEvent('ws.ready')
  handleWsReady(): void {
    const accountAddress = this.hlClient.getAccountAddress();
    if (!accountAddress) {
      return;
    }

    this.ws.subscribeToUserFills(accountAddress);
  }

  @OnEvent('ws.userFills')
  async handleUserFills(): Promise<void> {
    await this.syncPositionsFromExchange();
  }

  @OnEvent('ws.userEvents')
  async handleUserEvents(): Promise<void> {
    await this.syncPositionsFromExchange();
  }

  async openTrade(signal: TradeSignal): Promise<boolean> {
    if (this.positions.size >= this.config.get<number>('capital.maxConcurrentPositions')) {
      this.logger.warn('Max concurrent positions reached - skipping');
      return false;
    }
    if (this.positions.has(signal.token)) {
      this.logger.warn(`Already in position: ${signal.token}`);
      return false;
    }

    this.logger.log(
      `Open trade requested | token=${signal.token} | dir=${signal.direction} | score=${signal.score} | stop=${signal.stopPrice} | tp1=${signal.tp1Price} | tp2=${signal.tp2Price}`,
    );
    const position = await this.execution.openPosition(signal);
    if (!position) {
      this.logger.warn(`Execution returned no position for ${signal.token} ${signal.direction} score=${signal.score}`);
      return false;
    }

    const protectedOnExchange = await this.armExchangeStop(position);
    if (!protectedOnExchange) {
      this.logger.error(`Exchange stop could not be armed for ${position.token}; closing position immediately`);
      await this.execution.closeFullPosition(position, 'emergency');
      return false;
    }

    const tradeLogId = await this.logging.logTradeOpen(signal, position);
    this.positions.set(signal.token, position);
    this.tradeLogIds.set(position.id, tradeLogId);
    this.logger.log(
      `Position tracked locally | token=${position.token} | dir=${position.direction} | entry=${position.entryPrice} | size=${position.size} | openCount=${this.positions.size}`,
    );
    return true;
  }

  getOpenPositions(): Map<string, OpenPosition> { return this.positions; }
  getOpenTokens(): Set<string> { return new Set(this.positions.keys()); }
  getPositionCount(): number { return this.positions.size; }
  getProtectionStatus(): { protectedPositions: number; unprotectedPositions: number } {
    const positions = [...this.positions.values()];
    return {
      protectedPositions: positions.filter((position) => position.stopOrderId != null).length,
      unprotectedPositions: positions.filter((position) => position.stopOrderId == null).length,
    };
  }

  @OnEvent('ws.mids')
  async handlePriceUpdate(mids: Record<string, string>): Promise<void> {
    if (!this.risk.shouldManagePositions()) {
      return;
    }

    const tokens = [...this.positions.keys()];
    for (const token of tokens) {
      const position = this.positions.get(token);
      if (!position) continue;
      if (this.hlClient.isClosing(token)) continue;

      const priceStr = mids[token];
      if (!priceStr) continue;
      const price = parseFloat(priceStr);
      if (price > 0) await this.updatePosition(position, price);
    }
  }

  private async updatePosition(position: OpenPosition, currentPrice: number): Promise<void> {
    position.currentPrice = currentPrice;

    if (position.direction === 'long') {
      if (currentPrice > position.trailingHighest) position.trailingHighest = currentPrice;
    } else {
      if (currentPrice < position.trailingHighest) position.trailingHighest = currentPrice;
    }

    const priceDiff = position.direction === 'long'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    position.unrealizedPnl = (priceDiff / position.entryPrice) * position.notional;

    const volPct = this.config.get<number>('exits.volatilityStopPercent') / 100;
    const dropFromExtreme = position.direction === 'long'
      ? (position.trailingHighest - currentPrice) / position.trailingHighest
      : (currentPrice - position.trailingHighest) / position.trailingHighest;

    if (dropFromExtreme >= volPct) {
      await this.closeAndLog(position, 'volatility_stop');
      return;
    }

    const hitStop = position.direction === 'long'
      ? currentPrice <= position.stopPrice
      : currentPrice >= position.stopPrice;

    if (hitStop) {
      await this.closeAndLog(position, 'stop_loss');
      return;
    }

    const maxHoldMs = this.config.get<number>('exits.maxHoldHours') * 3600_000;
    if (Date.now() - position.openTime >= maxHoldMs) {
      await this.closeAndLog(position, 'time_stop');
      return;
    }

    if (!position.tp1Hit) {
      const tp1Hit = position.direction === 'long'
        ? currentPrice >= position.tp1Price
        : currentPrice <= position.tp1Price;

      if (tp1Hit) {
        const closeSize = Math.min(position.tp1Size, position.size);
        const exitPx = await this.runCloseAttempt(
          position,
          () => this.execution.closePosition(position, closeSize, 'TP1'),
        );
        if (exitPx !== null) {
          this.applyPartialClose(position, closeSize, exitPx);
          position.tp1Hit = true;
          position.stopPrice = position.entryPrice;
          await this.refreshExchangeStop(position);
          this.logger.log(`TP1 hit ${position.token} - stop moved to breakeven`);
        }
      }
    }

    if (position.tp1Hit && !position.tp2Hit) {
      const tp2Hit = position.direction === 'long'
        ? currentPrice >= position.tp2Price
        : currentPrice <= position.tp2Price;

      if (tp2Hit) {
        const closeSize = Math.min(position.tp2Size, position.size);
        const exitPx = await this.runCloseAttempt(
          position,
          () => this.execution.closePosition(position, closeSize, 'TP2'),
        );
        if (exitPx !== null) {
          this.applyPartialClose(position, closeSize, exitPx);
          position.tp2Hit = true;
          await this.refreshExchangeStop(position);
          this.logger.log(`TP2 hit ${position.token}`);
        }
      }
    }

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

  async closeAllPositions(reason: ExitReason): Promise<void> {
    this.logger.warn(`Closing all positions - ${reason}`);
    const tokens = [...this.positions.keys()];
    for (const token of tokens) {
      const pos = this.positions.get(token);
      if (pos) await this.closeAndLog(pos, reason);
    }
  }

  async closePositionByToken(token: string, reason: ExitReason = 'manual'): Promise<boolean> {
    const position = this.positions.get(token);
    if (!position) {
      this.logger.warn(`Requested manual close for missing position: ${token}`);
      return false;
    }

    await this.closeAndLog(position, reason);
    return !this.positions.has(token);
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

  private async closeAndLog(position: OpenPosition, reason: ExitReason): Promise<void> {
    const exitPrice = await this.runCloseAttempt(
      position,
      () => this.execution.closeFullPosition(position, reason),
    );
    if (exitPrice === null) {
      return;
    }

    const priceDiff = position.direction === 'long'
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;
    const pnlUsd = position.realizedPnl + (priceDiff / position.entryPrice) * position.notional;

    const tradeLogId = this.tradeLogIds.get(position.id);
    if (tradeLogId) {
      await this.logging.logTradeClose(
        tradeLogId, exitPrice, reason, pnlUsd, 0, position.tp1Hit, position.tp2Hit,
      );
    }

    this.signal.recordTradeResult(pnlUsd >= 0);
    this.positions.delete(position.token);
    this.tradeLogIds.delete(position.id);
    await this.hlClient.cancelCoinTriggerOrders(position.token);
  }

  private async runCloseAttempt<T>(
    position: OpenPosition,
    action: () => Promise<T | null>,
  ): Promise<T | null> {
    if (this.hlClient.isClosing(position.token)) {
      return null;
    }

    this.hlClient.markClosing(position.token);
    try {
      return await action();
    } finally {
      this.hlClient.clearClosing(position.token);
    }
  }

  private async armExchangeStop(position: OpenPosition): Promise<boolean> {
    await this.hlClient.cancelCoinTriggerOrders(position.token);
    const isBuy = position.direction === 'short';
    const result = await this.hlClient.placeTriggerMarketOrder(
      position.token,
      isBuy,
      position.size,
      position.stopPrice,
      'sl',
      true,
    );

    if (!result || (result.status !== 'resting' && result.status !== 'filled')) {
      return false;
    }

    position.stopOrderId = result.oid ?? null;
    return true;
  }

  private async refreshExchangeStop(position: OpenPosition): Promise<void> {
    if (position.size <= 0) {
      await this.hlClient.cancelCoinTriggerOrders(position.token);
      position.stopOrderId = null;
      return;
    }

    const armed = await this.armExchangeStop(position);
    if (!armed) {
      this.logger.warn(`Failed to refresh exchange stop for ${position.token}`);
    }
  }

  private async syncPositionsFromExchange(): Promise<void> {
    try {
      const hlPositions = await this.hlClient.getOpenPositions();
      const exchangeTokens = new Set(
        hlPositions
          .map((position) => position.coin)
          .filter((coin) => typeof coin === 'string' && coin.length > 0),
      );

      for (const token of [...this.positions.keys()]) {
        if (!exchangeTokens.has(token)) {
          this.logger.log(`Removing stale local position for ${token} after exchange resync`);
          const local = this.positions.get(token);
          if (local) {
            this.tradeLogIds.delete(local.id);
          }
          this.positions.delete(token);
        }
      }

      if (hlPositions.length === 0) return;

      this.logger.log(`Resyncing ${hlPositions.length} position(s) from exchange`);
      const stopPct = this.config.get<number>('exits.stopLossPercent') / 100;
      const tp1Ratio = this.config.get<number>('exits.tp1ClosePercent') / 100;
      const tp2Ratio = this.config.get<number>('exits.tp2ClosePercent') / 100;

      for (const p of hlPositions) {
        const sz = parseFloat(p.szi);
        if (sz === 0) continue;
        const entryPx = parseFloat(p.entryPx);
        const direction = sz > 0 ? 'long' : 'short';
        const absSz = Math.abs(sz);
        const notional = Math.abs(parseFloat(p.positionValue ?? '0'));
        const tp1Size = absSz * tp1Ratio;
        const tp2Size = absSz * tp2Ratio;
        const tp3Size = Math.max(0, absSz - tp1Size - tp2Size);
        const existing = this.positions.get(p.coin);

        this.positions.set(p.coin, {
          id: existing?.id ?? `${p.coin}-restored-${Date.now()}`,
          token: p.coin,
          direction,
          entryPrice: entryPx,
          currentPrice: existing?.currentPrice ?? entryPx,
          margin: parseFloat(p.marginUsed ?? '0'),
          notional,
          leverage: p.leverage?.value ?? this.config.get<number>('capital.leverage'),
          size: absSz,
          unrealizedPnl: parseFloat(p.unrealizedPnl ?? '0'),
          realizedPnl: existing?.realizedPnl ?? 0,
          tp1Hit: existing?.tp1Hit ?? false,
          tp2Hit: existing?.tp2Hit ?? false,
          stopPrice: direction === 'long'
            ? entryPx * (1 - stopPct)
            : entryPx * (1 + stopPct),
          tp1Price: direction === 'long'
            ? entryPx * (1 + this.config.get<number>('exits.tp1Percent') / 100)
            : entryPx * (1 - this.config.get<number>('exits.tp1Percent') / 100),
          tp2Price: direction === 'long'
            ? entryPx * (1 + this.config.get<number>('exits.tp2Percent') / 100)
            : entryPx * (1 - this.config.get<number>('exits.tp2Percent') / 100),
          trailingHighest: existing?.trailingHighest ?? entryPx,
          openTime: existing?.openTime ?? Date.now(),
          patternsFired: existing?.patternsFired ?? [],
          score: existing?.score ?? 0,
          marketCondition: existing?.marketCondition ?? 'sideways',
          tp1Size,
          tp2Size,
          tp3Size,
          stopOrderId: existing?.stopOrderId ?? null,
        });
      }

      await this.reconcileExchangeProtection();
    } catch (err) {
      this.logger.error(`syncPositionsFromExchange failed: ${err.message}`);
    }
  }

  private async reconcileExchangeProtection(): Promise<void> {
    const openOrders = await this.hlClient.getFrontendOpenOrders();
    const stopOrdersByCoin = new Map<string, number>();

    for (const order of openOrders) {
      if (
        typeof order?.coin === 'string'
        && order.isTrigger === true
        && order.triggerCondition === 'sl'
        && typeof order?.oid === 'number'
      ) {
        stopOrdersByCoin.set(order.coin, Number(order.oid));
      }
    }

    for (const position of this.positions.values()) {
      const existingOrderId = stopOrdersByCoin.get(position.token);
      if (existingOrderId != null) {
        position.stopOrderId = existingOrderId;
        continue;
      }

      this.logger.warn(`No exchange stop found for restored ${position.token}; re-arming protection`);
      const armed = await this.armExchangeStop(position);
      if (!armed) {
        position.stopOrderId = null;
        this.logger.error(`Failed to re-arm exchange stop for restored ${position.token}`);
      }
    }
  }

  private applyPartialClose(position: OpenPosition, closeSize: number, exitPrice: number): void {
    if (closeSize <= 0 || position.size <= 0) {
      return;
    }

    const portion = Math.min(1, closeSize / position.size);
    const closingNotional = position.notional * portion;
    const closingMargin = position.margin * portion;
    const priceDiff =
      position.direction === 'long'
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;

    position.realizedPnl += (priceDiff / position.entryPrice) * closingNotional;
    position.size = Math.max(0, position.size - closeSize);
    position.notional = Math.max(0, position.notional - closingNotional);
    position.margin = Math.max(0, position.margin - closingMargin);
    position.tp3Size = position.size;
    position.unrealizedPnl = 0;
  }
}
