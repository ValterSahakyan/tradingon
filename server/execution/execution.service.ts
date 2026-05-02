import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { HyperliquidClient } from './hyperliquid.client';
import { OpenPosition, TradeSignal } from '../common/types';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly hl: HyperliquidClient,
  ) {}

  async openPosition(signal: TradeSignal): Promise<OpenPosition | null> {
    if (!this.isExecutionAllowed('open', signal.token)) {
      return null;
    }

    const { token, direction, currentPrice, notional } = signal;
    const leverage = this.config.get<number>('capital.leverage');
    const minOrderNotional = this.config.get<number>('capital.minOrderNotional');
    const effectiveNotional = Math.max(notional, minOrderNotional);
    const effectiveMargin = effectiveNotional / leverage;

    // Always set isolated margin + leverage before entering
    await this.hl.setLeverage(token, leverage);

    const isBuy = direction === 'long';
    const sz = this.calculateSize(effectiveNotional, currentPrice);

    if (sz <= 0) {
      this.logger.warn(`Zero size for ${token} — skipping`);
      return null;
    }

    if (effectiveNotional > notional) {
      this.logger.log(
        `Bumping ${token} order size from $${notional.toFixed(2)} to $${effectiveNotional.toFixed(2)} to satisfy minimum order notional`,
      );
    }

    this.logger.log(
      `Opening ${direction} ${token} | targetNotional=$${effectiveNotional.toFixed(2)} | leverage=${leverage}x | size=${sz}`,
    );
    const result = await this.hl.placeMarketOrder(token, isBuy, sz);
    if (!result) {
      this.logger.error(`Order failed for ${token} - no exchange result returned`);
      return null;
    }

    if (result.status === 'rejected') {
      this.logger.error(`Order rejected for ${token}`);
      return null;
    }

    this.logger.log(
      `Exchange order result | token=${token} | status=${result.status} | avgPx=${result.avgPx ?? 0} | totalSz=${result.totalSz ?? 0}`,
    );

    // Use actual fill price from the exchange response.
    // Fall back to mid-price only if avgPx is missing (resting IOC edge case).
    const fillPrice = result.avgPx && result.avgPx > 0
      ? result.avgPx
      : await this.hl.getMidPrice(token);

    if (fillPrice <= 0) {
      this.logger.error(`Could not determine fill price for ${token}`);
      return null;
    }

    // Use actual filled size if available (partial fills on IOC)
    const filledSz = result.totalSz && result.totalSz > 0 ? result.totalSz : sz;

    const position: OpenPosition = {
      id: `${token}-${Date.now()}`,
      token,
      direction,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      margin: effectiveMargin,
      notional: filledSz * fillPrice,
      leverage,
      size: filledSz,
      unrealizedPnl: 0,
      realizedPnl: 0,
      tp1Hit: false,
      tp2Hit: false,
      stopPrice: signal.stopPrice,
      tp1Price: signal.tp1Price,
      tp2Price: signal.tp2Price,
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
      `Opened ${direction} ${token} @ ${fillPrice} | sz: ${filledSz} | stop: ${signal.stopPrice}`,
    );
    return position;
  }

  async closePosition(
    position: OpenPosition,
    sizeToClose: number,
    reason: string,
  ): Promise<number | null> {
    if (!this.isExecutionAllowed('close', `${position.token} (${reason})`)) {
      return null;
    }

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

  async getAccountValue(): Promise<number | null> {
    return this.hl.getAccountValue();
  }

  async getSpotUsdcBalance(): Promise<number | null> {
    return this.hl.getSpotUsdcBalance();
  }

  getWalletAddress(): string | null {
    return this.hl.getWalletAddress();
  }

  getAccountAddress(): string | null {
    return this.hl.getAccountAddress();
  }

  private calculateSize(notional: number, price: number): number {
    if (price <= 0) return 0;
    // Round down to exchange precision using szDecimals
    const raw = notional / price;
    return raw;
  }

  private isExecutionAllowed(action: 'open' | 'close', target: string): boolean {
    if (!this.config.get<boolean>('execution.enabled')) {
      this.logger.warn(`Execution disabled - refusing to ${action} ${target}`);
      return false;
    }

    const isTestnet = this.config.get<boolean>('hyperliquid.testnet');
    const allowMainnet = this.config.get<boolean>('execution.allowMainnet');
    if (!isTestnet && !allowMainnet) {
      this.logger.error(`Mainnet execution blocked - ALLOW_MAINNET_TRADING is off; refusing to ${action} ${target}`);
      return false;
    }

    return true;
  }
}
