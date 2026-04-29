import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MarketDataService } from '../market-data/market-data.service';
import { VolumeSpikePattern } from './patterns/volume-spike.pattern';
import { BullBearFlagPattern } from './patterns/bull-bear-flag.pattern';
import { FibonacciPattern } from './patterns/fibonacci.pattern';
import { AccumulationBreakoutPattern } from './patterns/accumulation-breakout.pattern';
import {
  Candle,
  MarketCondition,
  PatternId,
  TokenScore,
  TradeDirection,
  TradeSignal,
} from '../common/types';

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  // Rolling loss tracker for the choppy-market filter (last 2 hours)
  private recentLosses: { time: number; loss: boolean }[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly marketData: MarketDataService,
    private readonly emitter: EventEmitter2,
    private readonly volumeSpike: VolumeSpikePattern,
    private readonly bullBearFlag: BullBearFlagPattern,
    private readonly fibonacci: FibonacciPattern,
    private readonly accumulationBreakout: AccumulationBreakoutPattern,
  ) {}

  // Called by the scan scheduler every 5 minutes
  async scanAll(openTokens: Set<string>): Promise<TradeSignal[]> {
    const tokens = this.marketData.getTrackedTokens();
    const signals: TradeSignal[] = [];

    const marketCondition = this.marketData.getMarketCondition();
    if (marketCondition === 'btc_crash') {
      this.logger.warn('BTC crash detected — all trading paused');
      return [];
    }

    for (const token of tokens) {
      if (openTokens.has(token)) continue;
      try {
        const signal = await this.evaluateToken(token, marketCondition);
        if (signal) signals.push(signal);
      } catch (err) {
        this.logger.debug(`Error evaluating ${token}: ${err.message}`);
      }
    }

    if (signals.length > 0) {
      this.logger.log(`Scan complete — ${signals.length} signal(s) found`);
    }
    return signals;
  }

  recordTradeResult(win: boolean): void {
    this.recentLosses.push({ time: Date.now(), loss: !win });
    // keep only last 2 hours
    const cutoff = Date.now() - 2 * 3600_000;
    this.recentLosses = this.recentLosses.filter((r) => r.time >= cutoff);
  }

  // ─── Private ──────────────────────────────────────────────────

  private async evaluateToken(
    token: string,
    marketCondition: MarketCondition,
  ): Promise<TradeSignal | null> {
    const candles = this.marketData.getCandles(token);
    if (candles.length < 49) return null;

    // ── Run all 4 patterns ──────────────────────────────────────
    const p1 = this.volumeSpike.detect(candles);
    const p2 = this.bullBearFlag.detect(candles);
    const p3 = this.fibonacci.detect(candles);
    const p4 = this.accumulationBreakout.detect(candles);

    // Patterns 1 and 4 are REQUIRED
    if (!p1.fired || !p4.fired) return null;

    const patternsFired: PatternId[] = ['volume_spike', 'accumulation_breakout'];
    if (p2.fired) patternsFired.push('bull_bear_flag');
    if (p3.fired) patternsFired.push('fibonacci');

    const score = patternsFired.length; // min 2 (p1+p4), max 4
    if (score < 2) return null;

    // ── Resolve direction ───────────────────────────────────────
    // Pattern 4 (accumulation breakout) is the authoritative direction signal
    const direction = p4.direction!;

    // Market condition override — skip signals that oppose the macro bias
    if (marketCondition === 'bear' && direction === 'long') return null;
    if (marketCondition === 'bull' && direction === 'short') return null;

    // Optional bonus patterns must agree with direction
    if (p2.fired && p2.direction !== direction) patternsFired.splice(patternsFired.indexOf('bull_bear_flag'), 1);
    if (p3.fired && p3.direction !== direction) patternsFired.splice(patternsFired.indexOf('fibonacci'), 1);

    const finalScore = patternsFired.length;
    if (finalScore < 2) return null;

    // ── Trade filters ────────────────────────────────────────────
    if (!this.passesFilters(token, candles)) return null;

    // ── Wait-for-confirmation: next candle must hold breakout ────
    const confirmed = this.isBreakoutConfirmed(candles, direction, p4.details!);
    if (!confirmed) return null;

    const currentPrice = candles[candles.length - 1].close;
    const margin = this.marginForScore(finalScore, marketCondition);
    const leverage = this.config.get<number>('capital.leverage'); // always 3
    const notional = margin * leverage;

    return {
      token,
      direction,
      score: finalScore,
      patternsFired,
      currentPrice,
      suggestedMargin: margin,
      notional,
      marketCondition,
    };
  }

  private passesFilters(token: string, candles: Candle[]): boolean {
    const fundingRate = this.marketData.getFundingRate(token);
    const maxFunding = this.config.get<number>('filters.fundingRateMax');
    if (fundingRate > maxFunding) return false;

    const ageDays = this.marketData.getTokenAgeDays(token);
    const minAge = this.config.get<number>('filters.minTokenAgeDays');
    if (ageDays < minAge) return false;

    const marketCap = this.marketData.getMarketCap(token);
    const minCap = this.config.get<number>('filters.minMarketCap');
    if (marketCap < minCap) return false;

    // Price not already up/down > 30% in last 2 hours (chasing filter)
    const twoHoursAgo = candles.slice(-24); // 24 × 5min = 2h
    if (twoHoursAgo.length >= 2) {
      const then = twoHoursAgo[0].close;
      const now = candles[candles.length - 1].close;
      const changePct = Math.abs(((now - then) / then) * 100);
      if (changePct > 30) return false;
    }

    // 3 consecutive losses in last 2 hours
    const cutoff = Date.now() - 2 * 3600_000;
    const recentLosses = this.recentLosses.filter((r) => r.time >= cutoff && r.loss);
    const consecutiveLossFilter = this.config.get<number>('filters.consecutiveLossFilter');
    if (recentLosses.length >= consecutiveLossFilter) return false;

    return true;
  }

  private isBreakoutConfirmed(
    candles: Candle[],
    direction: TradeDirection,
    p4Details: Record<string, any>,
  ): boolean {
    if (candles.length < 2) return false;

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const { rangeHigh, rangeLow } = p4Details;

    // The previous candle must be the breakout candle
    // The current candle must continue to hold the breakout level
    if (direction === 'long') {
      const prevBrokeOut = previous.close > rangeHigh;
      const currentHolds = current.open > rangeHigh && current.close > rangeHigh;
      return prevBrokeOut && currentHolds;
    } else {
      const prevBrokeOut = previous.close < rangeLow;
      const currentHolds = current.open < rangeLow && current.close < rangeLow;
      return prevBrokeOut && currentHolds;
    }
  }

  private marginForScore(score: number, condition: MarketCondition): number {
    const base =
      score === 2
        ? this.config.get<number>('capital.marginScore2')
        : score === 3
        ? this.config.get<number>('capital.marginScore3')
        : this.config.get<number>('capital.marginScore4');

    // Bear market override: reduce all sizes by 50%
    if (condition === 'bear') return base * 0.5;
    return base;
  }
}
