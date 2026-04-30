import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class AccumulationBreakoutPattern {
  constructor(private readonly config: AppConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 49) {
      return { fired: false };
    }

    const rangeCandles = candles.slice(-49, -1);
    const current = candles[candles.length - 1];
    const accumulationRange = this.config.get<number>('patterns.accumulationRangePercent');
    const breakoutVolumeMultiplier = this.config.get<number>('patterns.accumulationBreakoutVolume');

    const rangeHigh = Math.max(...rangeCandles.map((c) => c.high));
    const rangeLow = Math.min(...rangeCandles.map((c) => c.low));
    const rangePct = ((rangeHigh - rangeLow) / rangeLow) * 100;
    if (rangePct >= accumulationRange) {
      return { fired: false };
    }

    const avgVolume = rangeCandles.reduce((sum, candle) => sum + candle.volume, 0) / rangeCandles.length;
    const firstHalf = rangeCandles.slice(0, 24);
    const secondHalf = rangeCandles.slice(24);
    const earlyAvgVolume = firstHalf.reduce((sum, candle) => sum + candle.volume, 0) / firstHalf.length;
    const lateAvgVolume = secondHalf.reduce((sum, candle) => sum + candle.volume, 0) / secondHalf.length;
    const volumeDeclining = lateAvgVolume < earlyAvgVolume;
    const volumeRatio = current.volume / avgVolume;

    const breakoutUp = current.close > rangeHigh && volumeRatio >= breakoutVolumeMultiplier;
    const breakoutDown = current.close < rangeLow && volumeRatio >= breakoutVolumeMultiplier;
    const fired = volumeDeclining && (breakoutUp || breakoutDown);
    const direction: TradeDirection = breakoutUp ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        rangeHigh: +rangeHigh.toFixed(6),
        rangeLow: +rangeLow.toFixed(6),
        rangePct: +rangePct.toFixed(2),
        avgVolume: +avgVolume.toFixed(2),
        earlyAvgVolume: +earlyAvgVolume.toFixed(2),
        lateAvgVolume: +lateAvgVolume.toFixed(2),
        volumeRatio: +volumeRatio.toFixed(2),
        volumeDeclining,
        breakoutUp,
        breakoutDown,
      },
    };
  }
}
