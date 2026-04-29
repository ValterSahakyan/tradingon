import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HyperliquidClient } from './hyperliquid.client';
import { OpenPosition, TradeSignal } from '../common/types';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly LEVERAGE = 3; // hard-coded, never change

  constructor(
    private readonly config: ConfigService,
    private readonly hl: HyperliquidClient,
  ) {}

  async openPosition(signal: TradeSignal): Promise<OpenPosition | null> {
    const { token, direction, currentPrice, suggestedMargin, notional } = signal;

    // Always set isolated margin + leverage before entering
    await this.hl.setLeverage(token, this.LEVERAGE);

    const isBuy = direction === 'long';
    const sz = this.calculateSize(notional, currentPrice);

    if (sz <= 0) {
      this.logger.warn(`Zero size for ${token} — skipping`);
      return null;
    }

    const result = await this.hl.placeMarketOrder(token, isBuy, sz);
    if (!result || result.status === 'rejected') {
      this.logger.error(`Order rejected for ${token}`);
      return null;
    }

    // Use actual fill price from the exchange response.
    // Fall back to mid-price only if avgPx is missing (resting IOC edge case).
    const fillPrice = result.avgPx && result.avgPx > 0
      ? result.avgPx
      : await this.hl.getMidPrice(token);

    if (fillPrice <= 0) {
      this.logger.error(`Could not determine fill price for ${token}`);
      return null;
    }

    const stopLossPct = this.config.get<number>('exits.stopLossPercent') / 100;
    const stopPrice = isBuy
      ? fillPrice * (1 - stopLossPct)
      : fillPrice * (1 + stopLossPct);

    // Use actual filled size if available (partial fills on IOC)
    const filledSz = result.totalSz && result.totalSz > 0 ? result.totalSz : sz;

    const position: OpenPosition = {
      id: `${token}-${Date.now()}`,
      token,
      direction,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      margin: suggestedMargin,
      notional: filledSz * fillPrice / this.LEVERAGE,
      leverage: this.LEVERAGE,
      size: filledSz,
      unrealizedPnl: 0,
      tp1Hit: false,
      tp2Hit: false,
      stopPrice,
      trailingHighest: fillPrice,
      openTime: Date.now(),
      patternsFired: signal.patternsFired,
      score: signal.score,
      marketCondition: signal.marketCondition,
      tp1Size: filledSz * 0.5,
      tp2Size: filledSz * 0.35,
      tp3Size: filledSz * 0.15,
    };

    this.logger.log(
      `Opened ${direction} ${token} @ ${fillPrice} | sz: ${filledSz} | stop: ${stopPrice}`,
    );
    return position;
  }

  async closePosition(
    position: OpenPosition,
    sizeToClose: number,
    reason: string,
  ): Promise<number | null> {
    const isBuy = position.direction === 'short'; // close long = sell; close short = buy
    const result = await this.hl.placeMarketOrder(position.token, isBuy, sizeToClose, true);

    if (!result || result.status === 'rejected') {
      this.logger.error(`Close failed for ${position.token} — ${reason}`);
      return null;
    }

    const exitPrice = result.avgPx && result.avgPx > 0
      ? result.avgPx
      : await this.hl.getMidPrice(position.token);

    this.logger.log(`Closed ${sizeToClose} of ${position.token} @ ${exitPrice} — ${reason}`);
    return exitPrice;
  }

  async closeFullPosition(position: OpenPosition, reason: string): Promise<number | null> {
    return this.closePosition(position, position.size, reason);
  }

  async getAccountValue(): Promise<number> {
    return this.hl.getAccountValue();
  }

  private calculateSize(notional: number, price: number): number {
    if (price <= 0) return 0;
    // Round down to exchange precision using szDecimals
    const raw = notional / price;
    return raw;
  }
}
