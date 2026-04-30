import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class VolumeSpikePattern {
  constructor(private readonly config: AppConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 21) return { fired: false };

    const current = candles[candles.length - 1];
    // 20-candle baseline (different window than accumulation_breakout's 48-candle avg)
    const prev = candles.slice(-21, -1);

    const avgVolume = prev.reduce((s, c) => s + c.volume, 0) / prev.length;
    const spikeMultiplier = this.config.get<number>('patterns.volumeSpikeMultiplier');
    const volumeRatio = current.volume / avgVolume;

    // Pure volume confirmation — no price cap, which would make it mutually exclusive
    // with accumulation_breakout (breakout candles always have a notable price move).
    // Direction is set by candle color so the caller can align it with the trade direction.
    const fired = volumeRatio >= spikeMultiplier;
    const direction: TradeDirection = current.close >= current.open ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: { avgVolume, volumeRatio: +volumeRatio.toFixed(2) },
    };
  }
}
