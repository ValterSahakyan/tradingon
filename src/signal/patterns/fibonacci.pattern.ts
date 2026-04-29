import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class FibonacciPattern {
  constructor(private readonly config: ConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 10) return { fired: false };

    const lookback = this.config.get<number>('scan.candleLookback');
    const fibLevels: number[] = this.config.get('patterns.fibLevels');
    const tolerance = this.config.get<number>('patterns.fibTolerancePercent');

    const window = candles.slice(-lookback);
    const current = candles[candles.length - 1];

    const swingHigh = Math.max(...window.map((c) => c.high));
    const swingLow = Math.min(...window.map((c) => c.low));
    const range = swingHigh - swingLow;

    if (range === 0) return { fired: false };

    // Pump volume = highest single-candle volume in swing
    const maxVolume = Math.max(...window.map((c) => c.volume));
    const currentVolume = current.volume;
    const volumeLower = currentVolume < maxVolume;

    const fib50 = swingHigh - range * 0.5;
    const fib618 = swingHigh - range * 0.618;

    const price = current.close;

    const nearFib = fibLevels.some((level) => {
      const fibPrice = swingHigh - range * level;
      const diffPct = Math.abs((price - fibPrice) / fibPrice) * 100;
      return diffPct <= tolerance;
    });

    const fired = nearFib && volumeLower;

    // If price is near support (lower fib) = long; near resistance (higher fib) = short
    const distToFib50 = Math.abs(price - fib50);
    const distToFib618 = Math.abs(price - fib618);
    const nearestFib = distToFib50 < distToFib618 ? fib50 : fib618;
    const direction: TradeDirection = price < nearestFib * 1.01 ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        swingHigh,
        swingLow,
        fib50: +fib50.toFixed(6),
        fib618: +fib618.toFixed(6),
        currentPrice: price,
        volumeLower,
        nearFib,
      },
    };
  }
}
