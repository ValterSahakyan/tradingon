import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class VolumeSpikePattern {
  constructor(private readonly config: AppConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 21) return { fired: false };

    const current = candles[candles.length - 1];
    const prev = candles.slice(-21, -1); // last 20 completed candles

    const avgVolume = prev.reduce((s, c) => s + c.volume, 0) / prev.length;
    const spikeMultiplier = this.config.get<number>('patterns.volumeSpikeMultiplier');
    const maxPriceChange = this.config.get<number>('patterns.volumeSpikeMaxPriceChange');

    const priceChangePct = Math.abs(((current.close - current.open) / current.open) * 100);
    const volumeRatio = current.volume / avgVolume;

    const fired = volumeRatio >= spikeMultiplier && priceChangePct < maxPriceChange;

    // Direction is ambiguous at this stage — determined by Pattern 4 (breakout direction).
    // Volume spike is direction-neutral but we note the candle bias.
    const direction: TradeDirection = current.close >= current.open ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: { avgVolume, volumeRatio: +volumeRatio.toFixed(2), priceChangePct: +priceChangePct.toFixed(2) },
    };
  }
}
