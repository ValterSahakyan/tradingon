import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { HyperliquidClient } from './hyperliquid.client';
import { OpenPosition, TradeSignal } from '../common/types';
import { HyperliquidActionStatus } from './hyperliquid.client';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private mainnetSessionArmed = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly hl: HyperliquidClient,
  ) {}

  async openPosition(signal: TradeSignal): Promise<OpenPosition | null> {
    if (!this.isExecutionAllowed('open', signal.token)) {
      return null;
    }

    const actionStatus = this.hl.getActionStatus();
    if (actionStatus.rateLimited) {
      this.logger.warn(
        `Refusing to open ${signal.direction} ${signal.token}: Hyperliquid action cooldown active for ${Math.ceil(actionStatus.cooldownMs / 1000)}s`,
      );
      return null;
    }

    const { token, direction, currentPrice, notional } = signal;
    const leverage = signal.leverage ?? this.config.get<number>('capital.leverage');
    const minOrderNotional = this.config.get<number>('capital.minOrderNotional');
    const freeCollateralBufferUsd = this.config.get<number>('capital.freeCollateralBufferUsd');
    const exchangeMinOrderNotional = this.config.get<number>('hyperliquid.exchangeMinOrderNotional');
    const maxEntrySpreadBps = this.config.get<number>('hyperliquid.maxEntrySpreadBps');
    const maxEntrySlippageBps = this.config.get<number>('hyperliquid.maxEntrySlippageBps');
    const effectiveNotional = Math.max(notional, minOrderNotional, exchangeMinOrderNotional);
    const effectiveMargin = effectiveNotional / leverage;

    const leverageReady = await this.hl.setLeverage(token, leverage);
    if (!leverageReady) {
      this.logger.error(`Refusing to open ${direction} ${token}: leverage setup failed`);
      return null;
    }

    const isBuy = direction === 'long';
    const bookLiquidity = await this.hl.getBookLiquidity(token);
    const referencePrice = bookLiquidity?.midPrice && bookLiquidity.midPrice > 0
      ? bookLiquidity.midPrice
      : currentPrice;
    const sz = this.calculateSize(effectiveNotional, referencePrice);
    const availableCollateral = await this.hl.getAvailableCollateral();

    if (sz <= 0) {
      this.logger.warn(`Zero size for ${token} - skipping`);
      return null;
    }

    if (availableCollateral !== null) {
      const requiredCollateral = effectiveMargin + freeCollateralBufferUsd;
      if (availableCollateral < requiredCollateral) {
        this.logger.warn(
          `Skipping ${token} ${direction}: available collateral $${availableCollateral.toFixed(2)} ` +
          `is below required $${requiredCollateral.toFixed(2)} ` +
          `(entryMargin=$${effectiveMargin.toFixed(2)}, buffer=$${freeCollateralBufferUsd.toFixed(2)})`,
        );
        return null;
      }
    }

    const takerEstimate = await this.hl.estimateTakerFill(token, isBuy, sz);
    if (!takerEstimate) {
      this.logger.warn(`Skipping ${token} ${direction}: live order book unavailable`);
      return null;
    }
    if (!takerEstimate.sufficientDepth) {
      this.logger.warn(
        `Skipping ${token} ${direction}: insufficient visible depth for ${sz.toFixed(6)} contracts ` +
        `(fillable=${takerEstimate.filledSize.toFixed(6)})`,
      );
      return null;
    }
    if (takerEstimate.spreadBps > maxEntrySpreadBps) {
      this.logger.warn(
        `Skipping ${token} ${direction}: spread ${takerEstimate.spreadBps.toFixed(1)}bps exceeds max ${maxEntrySpreadBps}bps`,
      );
      return null;
    }
    if (takerEstimate.slippageBps > maxEntrySlippageBps) {
      this.logger.warn(
        `Skipping ${token} ${direction}: estimated taker slippage ${takerEstimate.slippageBps.toFixed(1)}bps exceeds max ${maxEntrySlippageBps}bps`,
      );
      return null;
    }

    if (effectiveNotional > notional) {
      this.logger.log(
        `Bumping ${token} order size from $${notional.toFixed(2)} to $${effectiveNotional.toFixed(2)} to satisfy minimum order notional (config=$${minOrderNotional.toFixed(2)}, exchange=$${exchangeMinOrderNotional.toFixed(2)})`,
      );
    }

    this.logger.log(
      `Opening ${direction} ${token} | targetNotional=$${effectiveNotional.toFixed(2)} | leverage=${leverage}x | size=${sz} | liveMid=${referencePrice.toFixed(6)} | spread=${takerEstimate.spreadBps.toFixed(1)}bps | estSlip=${takerEstimate.slippageBps.toFixed(1)}bps`,
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

    const fillPrice = result.avgPx && result.avgPx > 0
      ? result.avgPx
      : await this.hl.getMidPrice(token);

    if (fillPrice <= 0) {
      this.logger.error(`Could not determine fill price for ${token}`);
      return null;
    }

    const filledSz = result.totalSz && result.totalSz > 0 ? result.totalSz : sz;
    const { tp1Size, tp2Size, tp3Size } = this.buildTakeProfitSizes(filledSz);

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
      initialSize: filledSz,
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
      tp1Size,
      tp2Size,
      tp3Size,
      stopOrderId: null,
      tp1OrderId: null,
      tp2OrderId: null,
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

    const isBuy = position.direction === 'short';
    const result = await this.hl.placeMarketOrder(position.token, isBuy, sizeToClose, true);

    if (!result || result.status === 'rejected') {
      this.logger.error(`Close failed for ${position.token} - ${reason}`);
      return null;
    }

    const exitPrice = result.avgPx && result.avgPx > 0
      ? result.avgPx
      : await this.hl.getMidPrice(position.token);

    this.logger.log(`Closed ${sizeToClose} of ${position.token} @ ${exitPrice} - ${reason}`);
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

  async getAvailableCollateral(): Promise<number | null> {
    return this.hl.getAvailableCollateral();
  }

  async getPortfolio(): Promise<Record<string, { accountValueHistory: Array<[number, string]>; pnlHistory: Array<[number, string]>; vlm: string }> | null> {
    return this.hl.getPortfolio();
  }

  getWalletAddress(): string | null {
    return this.hl.getWalletAddress();
  }

  getAccountAddress(): string | null {
    return this.hl.getAccountAddress();
  }

  getActionStatus(): HyperliquidActionStatus {
    return this.hl.getActionStatus();
  }

  armMainnetSession(): { armed: boolean; reason: string } {
    const isTestnet = this.config.get<boolean>('hyperliquid.testnet');
    if (isTestnet) {
      this.mainnetSessionArmed = true;
      return { armed: true, reason: 'testnet_mode' };
    }

    if (!this.config.get<boolean>('execution.enabled')) {
      return { armed: false, reason: 'live_trading_disabled' };
    }

    if (!this.config.get<boolean>('execution.allowMainnet')) {
      return { armed: false, reason: 'allow_mainnet_disabled' };
    }

    this.mainnetSessionArmed = true;
    this.logger.warn('Mainnet execution session armed by operator');
    return { armed: true, reason: 'armed' };
  }

  disarmMainnetSession(): { armed: boolean } {
    this.mainnetSessionArmed = false;
    this.logger.warn('Mainnet execution session disarmed by operator');
    return { armed: false };
  }

  isMainnetSessionArmed(): boolean {
    return this.config.get<boolean>('hyperliquid.testnet') ? true : this.mainnetSessionArmed;
  }

  private calculateSize(notional: number, price: number): number {
    if (price <= 0) return 0;
    return notional / price;
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

    if (action === 'open' && !isTestnet && !this.mainnetSessionArmed) {
      this.logger.error(`Mainnet execution blocked - operator session is not armed; refusing to ${action} ${target}`);
      return false;
    }

    return true;
  }

  private buildTakeProfitSizes(totalSize: number): { tp1Size: number; tp2Size: number; tp3Size: number } {
    const tp1Ratio = this.config.get<number>('exits.tp1ClosePercent') / 100;
    const tp2Ratio = this.config.get<number>('exits.tp2ClosePercent') / 100;
    const tp1Size = totalSize * tp1Ratio;
    const tp2Size = totalSize * tp2Ratio;
    const tp3Size = Math.max(0, totalSize - tp1Size - tp2Size);

    return { tp1Size, tp2Size, tp3Size };
  }
}
