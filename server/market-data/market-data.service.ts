import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from '../config/app-config.service';
import { Candle, MarketCondition } from '../common/types';

interface TokenMeta {
  name: string;
  marketCap: number;
  launchTime: number;
  ageDays: number;
  dayVolume: number;
  openInterest: number;
}

interface CandleCache {
  candles: Candle[];
  lastUpdated: number;
}

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataService.name);
  private http: AxiosInstance | null = null;
  private configReady = false;
  private candleCache = new Map<string, CandleCache>();
  private fundingRates = new Map<string, number>();
  private tokenMeta = new Map<string, TokenMeta>();
  private trackedTokens: string[] = [];
  private lastUniverseRefreshAt = 0;
  private solPriceHistory: { price: number; time: number }[] = [];
  private btcPriceHistory: { price: number; time: number }[] = [];
  private currentMarketCondition: MarketCondition = 'sideways';

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    void this.initializeMarketData();
  }

  getTrackedTokens(): string[] {
    return [...this.trackedTokens];
  }

  getCandles(token: string): Candle[] {
    return this.candleCache.get(token)?.candles ?? [];
  }

  getFundingRate(token: string): number {
    return this.fundingRates.get(token) ?? 0;
  }

  getTokenMeta(token: string): TokenMeta | undefined {
    return this.tokenMeta.get(token);
  }

  getMarketCondition(): MarketCondition {
    return this.currentMarketCondition;
  }

  getSolPriceChangePct(lookbackMs: number): number {
    return this.priceChangePct(this.solPriceHistory, lookbackMs);
  }

  getBtcPriceChangePct(lookbackMs: number): number {
    return this.priceChangePct(this.btcPriceHistory, lookbackMs);
  }

  async refreshAll(): Promise<void> {
    const refreshDue = Date.now() - this.lastUniverseRefreshAt > 15 * 60_000;
    if (refreshDue) {
      await this.refreshTokenUniverse();
    }

    await Promise.all([
      this.refreshMarketCondition(),
      this.refreshFundingRates(),
      this.refreshAllCandles(),
    ]);
    this.evaluateMarketCondition();
  }

  async refreshTokenUniverse(): Promise<void> {
    const http = await this.getHttp();
    if (!http) {
      return;
    }

    try {
      const res = await http.post('/info', { type: 'metaAndAssetCtxs' });
      const payload = Array.isArray(res.data) ? res.data : [res.data, []];
      const meta = payload[0];
      const ctxs: any[] = Array.isArray(payload[1]) ? payload[1] : [];
      const universe: any[] = meta?.universe ?? [];
      const minMarketCap = this.config.get<number>('filters.minMarketCap');
      const minAgeDays = this.config.get<number>('filters.minTokenAgeDays');
      const maxTrackedTokens = this.config.get<number>('scan.maxTrackedTokens');

      const rankedTokens = universe.map((asset, index) => {
        const ctx = ctxs[index] ?? {};
        const dayVolume = this.readPositiveNumber(ctx.dayNtlVlm ?? ctx.dayBaseVlm ?? 0);
        const openInterest = this.readPositiveNumber(ctx.openInterest ?? 0);
        return {
          name: String(asset.name),
          dayVolume,
          openInterest,
        };
      });

      rankedTokens.sort((left, right) => {
        if (right.dayVolume !== left.dayVolume) {
          return right.dayVolume - left.dayVolume;
        }
        return right.openInterest - left.openInterest;
      });

      const tokens: string[] = [];
      const seen = new Set<string>();
      for (const asset of rankedTokens) {
        const name = asset.name;
        if (!name || seen.has(name)) {
          continue;
        }
        seen.add(name);
        this.tokenMeta.set(name, {
          name,
          marketCap: minMarketCap + 1,
          launchTime: Date.now() - minAgeDays * 2 * 86400_000,
          ageDays: minAgeDays * 2,
          dayVolume: asset.dayVolume,
          openInterest: asset.openInterest,
        });
        tokens.push(name);
      }

      this.trackedTokens = tokens.slice(0, Math.max(1, maxTrackedTokens));
      this.lastUniverseRefreshAt = Date.now();
    } catch (err) {
      this.logger.error(`Failed to refresh token universe: ${err.message}`);
    }
  }

  async refreshAllCandles(): Promise<void> {
    const batchSize = 3;
    for (let i = 0; i < this.trackedTokens.length; i += batchSize) {
      const batch = this.trackedTokens.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((token) => this.refreshCandles(token)));
      if (i + batchSize < this.trackedTokens.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  async refreshCandles(token: string): Promise<void> {
    const http = await this.getHttp();
    if (!http) {
      return;
    }

    try {
      const now = Date.now();
      const candleLookback = this.config.get<number>('scan.candleLookback');
      const requiredCandles = Math.max(candleLookback + 1, 25);
      const startTime = now - requiredCandles * 5 * 60 * 1000;
      const res = await http.post('/info', {
        type: 'candleSnapshot',
        req: {
          coin: token,
          interval: '5m',
          startTime,
          endTime: now,
        },
      });

      const raw: any[] = res.data ?? [];
      const candles: Candle[] = raw.map((c) => ({
        time: c.t,
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }));

      this.candleCache.set(token, { candles, lastUpdated: now });
    } catch {
      return;
    }
  }

  async refreshFundingRates(): Promise<void> {
    const http = await this.getHttp();
    if (!http) {
      return;
    }

    try {
      const res = await http.post('/info', { type: 'metaAndAssetCtxs' });
      const [meta, ctxs]: [any, any[]] = res.data ?? [null, []];
      if (!meta || !ctxs) {
        return;
      }

      meta.universe.forEach((asset: any, idx: number) => {
        const ctx = ctxs[idx];
        if (ctx?.funding != null) {
          const rate8h = parseFloat(ctx.funding);
          const perHourPct = (Math.abs(rate8h) * 100) / 8;
          this.fundingRates.set(asset.name, perHourPct);
        }
      });
    } catch (err) {
      this.logger.warn(`Failed to refresh funding rates: ${err.message}`);
    }
  }

  async refreshMarketCondition(): Promise<void> {
    await Promise.allSettled([
      this.updatePriceHistory('SOL', this.solPriceHistory),
      this.updatePriceHistory('BTC', this.btcPriceHistory),
    ]);
  }

  getCurrentPrice(token: string): number {
    const candles = this.getCandles(token);
    if (candles.length === 0) {
      return 0;
    }
    return candles[candles.length - 1].close;
  }

  getTokenAgeDays(token: string): number {
    return this.tokenMeta.get(token)?.ageDays ?? 999;
  }

  getMarketCap(token: string): number {
    return this.tokenMeta.get(token)?.marketCap ?? 0;
  }

  setTokenMeta(token: string, meta: Partial<TokenMeta>): void {
    const existing = this.tokenMeta.get(token) ?? {
      name: token,
      marketCap: 0,
      launchTime: 0,
      ageDays: 0,
      dayVolume: 0,
      openInterest: 0,
    };
    this.tokenMeta.set(token, { ...existing, ...meta });
  }

  private async initializeMarketData(): Promise<void> {
    await this.ensureConfigured();
    if (!this.configReady) {
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.refreshTokenUniverse();
      this.logger.log(`Tracking ${this.trackedTokens.length} tokens`);
    } catch (err) {
      this.logger.error(`Initial market data load failed: ${err.message}`);
    }
  }

  private async updatePriceHistory(
    token: string,
    history: { price: number; time: number }[],
  ): Promise<void> {
    try {
      const candles = this.getCandles(token);
      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        history.push({ price: latest.close, time: latest.time });
        if (history.length > 50) {
          history.splice(0, history.length - 50);
        }
      } else {
        await this.refreshCandles(token);
      }
    } catch {
      return;
    }
  }

  private evaluateMarketCondition(): void {
    const btcChange4h = this.getBtcPriceChangePct(4 * 3600_000);
    const solChange1h = this.getSolPriceChangePct(3600_000);
    const marketUp1h = this.priceChangePctFromIndex(this.solPriceHistory, 3600_000);
    const btcBear = this.config.get<number>('market.btcBearThresholdPercent');
    const solBear = this.config.get<number>('market.solBearThresholdPercent');
    const bull = this.config.get<number>('market.bullMarketThresholdPercent');

    if (btcChange4h < -btcBear) {
      this.currentMarketCondition = 'btc_crash';
    } else if (solChange1h < -solBear) {
      this.currentMarketCondition = 'bear';
    } else if (marketUp1h > bull) {
      this.currentMarketCondition = 'bull';
    } else {
      this.currentMarketCondition = 'sideways';
    }
  }

  private priceChangePct(
    history: { price: number; time: number }[],
    lookbackMs: number,
  ): number {
    return this.priceChangePctFromIndex(history, lookbackMs);
  }

  private priceChangePctFromIndex(
    history: { price: number; time: number }[],
    lookbackMs: number,
  ): number {
    if (history.length < 2) {
      return 0;
    }

    const cutoff = Date.now() - lookbackMs;
    const baseline = history.find((point) => point.time >= cutoff);
    if (!baseline) {
      return 0;
    }

    const latest = history[history.length - 1];
    return ((latest.price - baseline.price) / baseline.price) * 100;
  }

  private async ensureConfigured(): Promise<void> {
    if (this.configReady) {
      return;
    }

    await this.config.waitUntilReady();
    const apiUrl = this.config.get<string>('hyperliquid.apiUrl');
    if (!apiUrl) {
      this.logger.error('Hyperliquid API URL not configured');
      return;
    }

    this.http = axios.create({ baseURL: apiUrl, timeout: 10_000 });
    this.configReady = true;
  }

  private async getHttp(): Promise<AxiosInstance | null> {
    await this.ensureConfigured();
    return this.http;
  }

  private readPositiveNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
}
