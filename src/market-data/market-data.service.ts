import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Candle, MarketCondition } from '../common/types';

interface TokenMeta {
  name: string;
  marketCap: number;
  launchTime: number; // unix ms
  ageDays: number;
}

interface CandleCache {
  candles: Candle[];
  lastUpdated: number;
}

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly http: AxiosInstance;
  private readonly apiUrl: string;

  // token → candle cache (last 48 5m candles)
  private candleCache = new Map<string, CandleCache>();
  // token → funding rate cache
  private fundingRates = new Map<string, number>();
  // token → meta
  private tokenMeta = new Map<string, TokenMeta>();
  // tracked token universe (populated from Hyperliquid perp listings)
  private trackedTokens: string[] = [];

  // market condition inputs
  private solPriceHistory: { price: number; time: number }[] = [];
  private btcPriceHistory: { price: number; time: number }[] = [];

  private currentMarketCondition: MarketCondition = 'sideways';

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('hyperliquid.apiUrl');
    this.http = axios.create({ baseURL: this.apiUrl, timeout: 10_000 });
  }

  async onModuleInit() {
    // Small delay so HyperliquidClient initialises first and we don't burst the API
    await new Promise(r => setTimeout(r, 2000));
    await this.refreshTokenUniverse();
    this.logger.log(`Tracking ${this.trackedTokens.length} tokens`);
  }

  // ─── Public API ────────────────────────────────────────────────

  getTrackedTokens(): string[] {
    return this.trackedTokens;
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
    await Promise.all([
      this.refreshMarketCondition(),
      this.refreshFundingRates(),
      this.refreshAllCandles(),
    ]);
    this.evaluateMarketCondition();
  }

  // ─── Token Universe ────────────────────────────────────────────

  async refreshTokenUniverse(): Promise<void> {
    try {
      const res = await this.http.post('/info', { type: 'meta' });
      const universe: any[] = res.data?.universe ?? [];

      const minMarketCap = this.config.get<number>('filters.minMarketCap');
      const minAgeDays = this.config.get<number>('filters.minTokenAgeDays');

      const tokens: string[] = [];
      for (const asset of universe) {
        const name: string = asset.name;
        // Hyperliquid meta doesn't include market cap or launch time directly —
        // we seed meta with defaults and rely on the candle data quality filter.
        // Production: enrich via GMGN or CoinGecko API.
        if (!this.tokenMeta.has(name)) {
          this.tokenMeta.set(name, {
            name,
            marketCap: minMarketCap + 1, // default pass until enriched
            launchTime: Date.now() - minAgeDays * 2 * 86400_000,
            ageDays: minAgeDays * 2,
          });
        }
        tokens.push(name);
      }

      this.trackedTokens = tokens.slice(0, 100); // cap at 100
    } catch (err) {
      this.logger.error('Failed to refresh token universe', err.message);
    }
  }

  // ─── OHLCV Candles ─────────────────────────────────────────────

  async refreshAllCandles(): Promise<void> {
    const batchSize = 5; // stay under HL rate limit
    for (let i = 0; i < this.trackedTokens.length; i += batchSize) {
      const batch = this.trackedTokens.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((t) => this.refreshCandles(t)));
      if (i + batchSize < this.trackedTokens.length) {
        await new Promise(r => setTimeout(r, 500)); // 500ms between batches
      }
    }
  }

  async refreshCandles(token: string): Promise<void> {
    try {
      const now = Date.now();
      const startTime = now - 48 * 5 * 60 * 1000; // 48 × 5min candles

      const res = await this.http.post('/info', {
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
    } catch (err) {
      // silently skip — stale cache will be used
    }
  }

  // ─── Funding Rates ─────────────────────────────────────────────

  async refreshFundingRates(): Promise<void> {
    try {
      const res = await this.http.post('/info', { type: 'metaAndAssetCtxs' });
      const [meta, ctxs]: [any, any[]] = res.data ?? [null, []];
      if (!meta || !ctxs) return;

      meta.universe.forEach((asset: any, idx: number) => {
        const ctx = ctxs[idx];
        if (ctx?.funding != null) {
          // HL funding field is the 8-hour rate as a fraction (e.g. 0.0001 = 0.01% per 8h)
          // Convert to hourly percentage: (rate * 100) / 8
          const rate8h = parseFloat(ctx.funding);
          const perHourPct = (Math.abs(rate8h) * 100) / 8;
          this.fundingRates.set(asset.name, perHourPct);
        }
      });
    } catch (err) {
      this.logger.warn('Failed to refresh funding rates', err.message);
    }
  }

  // ─── Market Condition ──────────────────────────────────────────

  async refreshMarketCondition(): Promise<void> {
    await Promise.allSettled([
      this.updatePriceHistory('SOL', this.solPriceHistory),
      this.updatePriceHistory('BTC', this.btcPriceHistory),
    ]);
  }

  private async updatePriceHistory(
    token: string,
    history: { price: number; time: number }[],
  ): Promise<void> {
    try {
      // Use candle cache if available, else fetch
      const candles = this.getCandles(token);
      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        history.push({ price: latest.close, time: latest.time });
        // keep last 50 points
        if (history.length > 50) history.splice(0, history.length - 50);
      } else {
        await this.refreshCandles(token);
      }
    } catch {
      // ignore
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

  // ─── Helpers ───────────────────────────────────────────────────

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
    if (history.length < 2) return 0;
    const now = Date.now();
    const cutoff = now - lookbackMs;
    const baseline = history.find((p) => p.time >= cutoff);
    if (!baseline) return 0;
    const latest = history[history.length - 1];
    return ((latest.price - baseline.price) / baseline.price) * 100;
  }

  getCurrentPrice(token: string): number {
    const candles = this.getCandles(token);
    if (candles.length === 0) return 0;
    return candles[candles.length - 1].close;
  }

  getTokenAgeDays(token: string): number {
    return this.tokenMeta.get(token)?.ageDays ?? 999;
  }

  getMarketCap(token: string): number {
    return this.tokenMeta.get(token)?.marketCap ?? 0;
  }

  // Enrich a token's meta from an external source (GMGN or similar).
  // Called lazily — production should batch-enrich on startup.
  setTokenMeta(token: string, meta: Partial<TokenMeta>): void {
    const existing = this.tokenMeta.get(token) ?? { name: token, marketCap: 0, launchTime: 0, ageDays: 0 };
    this.tokenMeta.set(token, { ...existing, ...meta });
  }
}
