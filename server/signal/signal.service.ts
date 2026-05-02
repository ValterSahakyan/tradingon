import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
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
  PatternResult,
  ScanCandidate,
  ScanDiagnostics,
  TradeDirection,
  TradeSignal,
} from '../common/types';

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);
  private recentLosses: { time: number; loss: boolean }[] = [];
  private lastCandidates: ScanCandidate[] = [];
  private lastDiagnostics: ScanDiagnostics = this.createDiagnostics();

  constructor(
    private readonly config: AppConfigService,
    private readonly marketData: MarketDataService,
    private readonly emitter: EventEmitter2,
    private readonly volumeSpike: VolumeSpikePattern,
    private readonly bullBearFlag: BullBearFlagPattern,
    private readonly fibonacci: FibonacciPattern,
    private readonly accumulationBreakout: AccumulationBreakoutPattern,
  ) {}

  async scanAll(openTokens: Set<string>): Promise<TradeSignal[]> {
    const tokens = this.marketData.getTrackedTokens();
    const diagnostics = this.createDiagnostics();
    const signals: TradeSignal[] = [];
    const candidates: ScanCandidate[] = [];
    const marketCondition = this.marketData.getMarketCondition();

    diagnostics.tokensSeen = tokens.length;
    if (marketCondition === 'btc_crash') {
      this.bumpReject(diagnostics, 'market_btc_crash');
      diagnostics.finishedAt = Date.now();
      this.lastDiagnostics = diagnostics;
      this.logger.warn('BTC crash detected - all trading paused');
      return [];
    }

    for (const token of tokens) {
      if (openTokens.has(token)) {
      diagnostics.openSkipped += 1;
        continue;
      }

      diagnostics.tokensEvaluated += 1;
      try {
        const result = await this.evaluateToken(token, marketCondition, diagnostics);
        if (result.candidate) {
          candidates.push(result.candidate);
        }
        if (result.signal) {
          signals.push(result.signal);
        }
      } catch (err) {
        this.bumpReject(diagnostics, 'evaluation_error');
        this.logger.debug(`Error evaluating ${token}: ${err.message}`);
      }
    }

    diagnostics.signalsFound = signals.length;
    diagnostics.candidatesFound = candidates.length;
    diagnostics.finishedAt = Date.now();
    this.lastCandidates = candidates
      .sort((left, right) => {
        if (Number(right.tradable) !== Number(left.tradable)) {
          return Number(right.tradable) - Number(left.tradable);
        }
        return right.score - left.score;
      })
      .slice(0, 20);
    this.lastDiagnostics = diagnostics;

    if (signals.length > 0) {
      this.logger.log(`Scan complete - ${signals.length} signal(s) found`);
    }

    this.emitter.emit('signals.diagnostics', diagnostics);
    return signals;
  }

  getLastDiagnostics(): ScanDiagnostics {
    return this.lastDiagnostics;
  }

  getLastCandidates(): ScanCandidate[] {
    return this.lastCandidates;
  }

  recordTradeResult(win: boolean): void {
    this.recentLosses.push({ time: Date.now(), loss: !win });
    const cutoff = Date.now() - 2 * 3600_000;
    this.recentLosses = this.recentLosses.filter((result) => result.time >= cutoff);
  }

  private async evaluateToken(
    token: string,
    marketCondition: MarketCondition,
    diagnostics: ScanDiagnostics,
  ): Promise<{ signal: TradeSignal | null; candidate: ScanCandidate | null }> {
    const candles = this.marketData.getCandles(token);
    const requiredCandles = Math.max(this.config.get<number>('scan.candleLookback') + 1, 25);
    if (candles.length < requiredCandles) {
      diagnostics.insufficientCandles += 1;
      this.bumpReject(diagnostics, 'insufficient_candles');
      return { signal: null, candidate: null };
    }
    diagnostics.tokensWithCandles += 1;

    const volumeSpike = this.volumeSpike.detect(candles);
    const bullBearFlag = this.bullBearFlag.detect(candles);
    const fibonacci = this.fibonacci.detect(candles);
    const accumulationBreakout = this.accumulationBreakout.detect(candles);
    const patternMap: Record<PatternId, PatternResult> = {
      volume_spike: volumeSpike,
      bull_bear_flag: bullBearFlag,
      fibonacci,
      accumulation_breakout: accumulationBreakout,
    };

    for (const pattern of Object.keys(patternMap) as PatternId[]) {
      if (patternMap[pattern].fired) {
        diagnostics.patternHits[pattern] += 1;
      }
    }

    const watchPatterns = (Object.entries(patternMap) as [PatternId, PatternResult][])
      .filter(([, result]) => result.fired)
      .map(([pattern]) => pattern);
    const direction =
      accumulationBreakout.direction ??
      bullBearFlag.direction ??
      fibonacci.direction ??
      volumeSpike.direction ??
      null;
    const currentPrice = candles[candles.length - 1].close;
    const fundingRate = this.marketData.getFundingRate(token);
    const marketCap = this.marketData.getMarketCap(token);
    const tokenAgeDays = this.marketData.getTokenAgeDays(token);

    if (watchPatterns.length === 0) {
      this.bumpReject(diagnostics, 'no_pattern_match');
      return { signal: null, candidate: null };
    }

    if (!accumulationBreakout.fired) {
      this.bumpReject(diagnostics, 'missing_accumulation_breakout');
      return {
        signal: null,
        candidate: {
          token,
          direction,
          score: watchPatterns.length,
          currentPrice,
          patternsFired: watchPatterns,
          tradable: false,
          reason: 'Awaiting breakout confirmation',
          marketCondition,
          fundingRate,
          marketCap,
          tokenAgeDays,
          timestamp: Date.now(),
        },
      };
    }

    if (!direction) {
      this.bumpReject(diagnostics, 'missing_direction');
      return {
        signal: null,
        candidate: {
          token,
          direction: null,
          score: watchPatterns.length,
          currentPrice,
          patternsFired: watchPatterns,
          tradable: false,
          reason: 'Direction not confirmed',
          marketCondition,
          fundingRate,
          marketCap,
          tokenAgeDays,
          timestamp: Date.now(),
        },
      };
    }

    const confirmationPatterns: PatternId[] = [];
    if (volumeSpike.fired && volumeSpike.direction === direction) {
      confirmationPatterns.push('volume_spike');
    }
    if (bullBearFlag.fired && bullBearFlag.direction === direction) {
      confirmationPatterns.push('bull_bear_flag');
    }
    if (fibonacci.fired && fibonacci.direction === direction) {
      confirmationPatterns.push('fibonacci');
    }

    const patternsFired: PatternId[] = ['accumulation_breakout', ...confirmationPatterns];
    const baseCandidate: ScanCandidate = {
      token,
      direction,
      score: patternsFired.length,
      currentPrice,
      patternsFired,
      tradable: false,
      reason: null,
      marketCondition,
      fundingRate,
      marketCap,
      tokenAgeDays,
      timestamp: Date.now(),
    };

    if (confirmationPatterns.length === 0) {
      this.bumpReject(diagnostics, 'awaiting_confirmation');
      return {
        signal: null,
        candidate: {
          ...baseCandidate,
          patternsFired: watchPatterns,
          score: watchPatterns.length,
          reason: 'Breakout found, waiting for volume or structure confirmation',
        },
      };
    }

    if (marketCondition === 'bear' && direction === 'long') {
      this.bumpReject(diagnostics, 'macro_bear_blocks_long');
      return {
        signal: null,
        candidate: { ...baseCandidate, reason: 'Blocked by bear market filter' },
      };
    }
    if (marketCondition === 'bull' && direction === 'short') {
      this.bumpReject(diagnostics, 'macro_bull_blocks_short');
      return {
        signal: null,
        candidate: { ...baseCandidate, reason: 'Blocked by bull market filter' },
      };
    }

    const filterResult = this.passesFilters(token, candles);
    if (!filterResult.ok) {
      const reason = 'reason' in filterResult ? filterResult.reason : 'filter_rejected';
      this.bumpReject(diagnostics, reason);
      return {
        signal: null,
        candidate: { ...baseCandidate, reason: this.describeRejectReason(reason) },
      };
    }

    const levels = this.buildTradeLevels(
      direction,
      currentPrice,
      accumulationBreakout.details ?? {},
      bullBearFlag.details ?? {},
    );
    if (!levels) {
      this.bumpReject(diagnostics, 'invalid_trade_levels');
      return {
        signal: null,
        candidate: { ...baseCandidate, reason: 'Invalid stop/target structure' },
      };
    }

    const margin = this.marginForScore(patternsFired.length, marketCondition);
    const leverage = this.config.get<number>('capital.leverage');
    const notional = margin * leverage;

    return {
      signal: {
        token,
        direction,
        score: patternsFired.length,
        patternsFired,
        currentPrice,
        suggestedMargin: margin,
        notional,
        stopPrice: levels.stopPrice,
        tp1Price: levels.tp1Price,
        tp2Price: levels.tp2Price,
        marketCondition,
      },
      candidate: {
        ...baseCandidate,
        tradable: true,
      },
    };
  }

  private passesFilters(token: string, candles: Candle[]): { ok: true } | { ok: false; reason: string } {
    const fundingRate = this.marketData.getFundingRate(token);
    const maxFunding = this.config.get<number>('filters.fundingRateMax');
    if (fundingRate > maxFunding) {
      return { ok: false, reason: 'funding_too_high' };
    }

    const ageDays = this.marketData.getTokenAgeDays(token);
    const minAge = this.config.get<number>('filters.minTokenAgeDays');
    if (ageDays < minAge) {
      return { ok: false, reason: 'token_too_new' };
    }

    const marketCap = this.marketData.getMarketCap(token);
    const minCap = this.config.get<number>('filters.minMarketCap');
    if (marketCap < minCap) {
      return { ok: false, reason: 'market_cap_too_small' };
    }

    const lookbackCandles = candles.slice(-24);
    if (lookbackCandles.length >= 2) {
      const then = lookbackCandles[0].close;
      const now = candles[candles.length - 1].close;
      const changePct = Math.abs(((now - then) / then) * 100);
      const maxPriceChange2h = this.config.get<number>('filters.maxPriceChange2h');
      if (changePct > maxPriceChange2h) {
        return { ok: false, reason: 'already_extended' };
      }
    }

    const cutoff = Date.now() - 2 * 3600_000;
    const recentLosses = this.recentLosses.filter((result) => result.time >= cutoff && result.loss);
    const consecutiveLossFilter = this.config.get<number>('filters.consecutiveLossFilter');
    if (recentLosses.length >= consecutiveLossFilter) {
      return { ok: false, reason: 'recent_loss_streak' };
    }

    return { ok: true };
  }

  private buildTradeLevels(
    direction: TradeDirection,
    currentPrice: number,
    breakoutDetails: Record<string, unknown>,
    flagDetails: Record<string, unknown>,
  ): { stopPrice: number; tp1Price: number; tp2Price: number } | null {
    const rangeHigh = Number(breakoutDetails.rangeHigh ?? 0);
    const rangeLow = Number(breakoutDetails.rangeLow ?? 0);
    if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow) || rangeHigh <= rangeLow) {
      return null;
    }

    const structuralBuffer = 0.0025;
    const stopPrice =
      direction === 'long'
        ? rangeLow * (1 - structuralBuffer)
        : rangeHigh * (1 + structuralBuffer);
    const riskPerUnit = Math.abs(currentPrice - stopPrice);
    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0 || riskPerUnit / currentPrice > 0.25) {
      return null;
    }

    const baseTp1 =
      direction === 'long' ? currentPrice + riskPerUnit : currentPrice - riskPerUnit;
    let baseTp2 =
      direction === 'long' ? currentPrice + riskPerUnit * 2 : currentPrice - riskPerUnit * 2;

    const poleRange = Number(flagDetails.poleRange ?? 0);
    if (Number.isFinite(poleRange) && poleRange > 0) {
      const projectedTarget =
        direction === 'long' ? currentPrice + poleRange : currentPrice - poleRange;
      baseTp2 =
        direction === 'long'
          ? Math.max(baseTp2, projectedTarget)
          : Math.min(baseTp2, projectedTarget);
    }

    return {
      stopPrice: +stopPrice.toFixed(6),
      tp1Price: +baseTp1.toFixed(6),
      tp2Price: +baseTp2.toFixed(6),
    };
  }

  private marginForScore(score: number, condition: MarketCondition): number {
    const base =
      score <= 2
        ? this.config.get<number>('capital.marginScore2')
        : score === 3
          ? this.config.get<number>('capital.marginScore3')
          : this.config.get<number>('capital.marginScore4');

    if (condition === 'bear') {
      return base * 0.5;
    }
    return base;
  }

  private createDiagnostics(): ScanDiagnostics {
    return {
      startedAt: Date.now(),
      finishedAt: null,
      tokensSeen: 0,
      tokensEvaluated: 0,
      tokensWithCandles: 0,
      openSkipped: 0,
      insufficientCandles: 0,
      signalsFound: 0,
      candidatesFound: 0,
      patternHits: {
        volume_spike: 0,
        bull_bear_flag: 0,
        fibonacci: 0,
        accumulation_breakout: 0,
      },
      rejectReasons: {},
    };
  }

  private bumpReject(diagnostics: ScanDiagnostics, reason: string): void {
    diagnostics.rejectReasons[reason] = (diagnostics.rejectReasons[reason] ?? 0) + 1;
  }

  private describeRejectReason(reason: string): string {
    switch (reason) {
      case 'funding_too_high':
        return 'Funding rate too high';
      case 'token_too_new':
        return 'Token too new';
      case 'market_cap_too_small':
        return 'Market cap filter blocked';
      case 'already_extended':
        return 'Price already extended';
      case 'recent_loss_streak':
        return 'Risk cooldown after losses';
      default:
        return reason.replaceAll('_', ' ');
    }
  }
}
