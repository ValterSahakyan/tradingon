import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class FibonacciPattern {
  constructor(private readonly config: AppConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 20) {
      return { fired: false };
    }

    const lookback = this.config.get<number>('scan.candleLookback');
    const fibLevels: number[] = this.config.get('patterns.fibLevels');
    const tolerance = this.config.get<number>('patterns.fibTolerancePercent');
    const minImpulseMove = this.config.get<number>('patterns.flagSharpMovePercent');
    const window = candles.slice(-lookback);
    const current = window[window.length - 1];

    let swingLowIdx = 0;
    let swingHighIdx = 0;
    for (let i = 1; i < window.length; i += 1) {
      if (window[i].low < window[swingLowIdx].low) {
        swingLowIdx = i;
      }
      if (window[i].high > window[swingHighIdx].high) {
        swingHighIdx = i;
      }
    }

    if (swingLowIdx === swingHighIdx) {
      return { fired: false };
    }

    const bullishSwing = swingLowIdx < swingHighIdx;
    const swingLow = window[swingLowIdx].low;
    const swingHigh = window[swingHighIdx].high;
    const range = swingHigh - swingLow;
    if (range <= 0) {
      return { fired: false };
    }

    const impulseMovePct = (range / swingLow) * 100;
    if (impulseMovePct < minImpulseMove) {
      return { fired: false };
    }

    const impulseCandles = bullishSwing
      ? window.slice(swingLowIdx, swingHighIdx + 1)
      : window.slice(swingHighIdx, swingLowIdx + 1);
    if (impulseCandles.length < 2) {
      return { fired: false };
    }

    const retracementZone = bullishSwing
      ? window.slice(swingHighIdx + 1)
      : window.slice(swingLowIdx + 1);
    if (retracementZone.length === 0) {
      return { fired: false };
    }

    const impulseAvgVolume =
      impulseCandles.reduce((sum, candle) => sum + candle.volume, 0) / impulseCandles.length;
    const retraceAvgVolume =
      retracementZone.reduce((sum, candle) => sum + candle.volume, 0) / retracementZone.length;
    const volumeLower = retraceAvgVolume < impulseAvgVolume;

    const targets = fibLevels.map((level) =>
      bullishSwing ? swingHigh - range * level : swingLow + range * level,
    );
    const nearestLevel = targets.reduce((nearest, candidate) =>
      Math.abs(candidate - current.close) < Math.abs(nearest - current.close) ? candidate : nearest,
    );
    const diffPct = Math.abs((current.close - nearestLevel) / nearestLevel) * 100;
    const nearFib = diffPct <= tolerance;

    const fired = nearFib && volumeLower;
    const direction: TradeDirection = bullishSwing ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        swingLow: +swingLow.toFixed(6),
        swingHigh: +swingHigh.toFixed(6),
        impulseMovePct: +impulseMovePct.toFixed(2),
        nearestFib: +nearestLevel.toFixed(6),
        diffPct: +diffPct.toFixed(2),
        volumeLower,
        bullishSwing,
      },
    };
  }
}
