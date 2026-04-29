import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class AccumulationBreakoutPattern {
  constructor(private readonly config: ConfigService) {}

  detect(candles: Candle[]): PatternResult {
    // Need at least 49 candles: 48 for range + current breakout candle
    if (candles.length < 49) return { fired: false };

    const rangeCandles = candles.slice(-49, -1); // 48 candles = 4 hours
    const current = candles[candles.length - 1];

    const accumulationRange = this.config.get<number>('patterns.accumulationRangePercent');
    const breakoutVolumeMultiplier = this.config.get<number>('patterns.accumulationBreakoutVolume');

    const rangeHigh = Math.max(...rangeCandles.map((c) => c.high));
    const rangeLow = Math.min(...rangeCandles.map((c) => c.low));
    const rangePct = ((rangeHigh - rangeLow) / rangeLow) * 100;

    // Range must be tight (< 8%)
    if (rangePct >= accumulationRange) return { fired: false };

    const avgVolume = rangeCandles.reduce((s, c) => s + c.volume, 0) / rangeCandles.length;
    const volumeRatio = current.volume / avgVolume;

    const breakoutUp = current.close > rangeHigh && volumeRatio >= breakoutVolumeMultiplier;
    const breakoutDown = current.close < rangeLow && volumeRatio >= breakoutVolumeMultiplier;

    const fired = breakoutUp || breakoutDown;
    const direction: TradeDirection = breakoutUp ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        rangeHigh: +rangeHigh.toFixed(6),
        rangeLow: +rangeLow.toFixed(6),
        rangePct: +rangePct.toFixed(2),
        avgVolume: +avgVolume.toFixed(2),
        volumeRatio: +volumeRatio.toFixed(2),
        breakoutUp,
        breakoutDown,
      },
    };
  }
}
