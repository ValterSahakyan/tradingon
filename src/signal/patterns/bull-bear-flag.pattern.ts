import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class BullBearFlagPattern {
  constructor(private readonly config: ConfigService) {}

  detect(candles: Candle[]): PatternResult {
    if (candles.length < 6) return { fired: false };

    const sharpMove = this.config.get<number>('patterns.flagSharpMovePercent');
    const consolidationSpread = this.config.get<number>('patterns.flagConsolidationSpread');

    // Last 2 candles before consolidation phase = flagpole
    const polePrev = candles[candles.length - 6];
    const poleEnd = candles[candles.length - 4];
    const poleMove = ((poleEnd.close - polePrev.close) / polePrev.close) * 100;

    // Last 3 candles = consolidation
    const consolidationCandles = candles.slice(-3);
    const conHigh = Math.max(...consolidationCandles.map((c) => c.high));
    const conLow = Math.min(...consolidationCandles.map((c) => c.low));
    const spreadPct = ((conHigh - conLow) / conLow) * 100;

    // Volume declining during consolidation
    const poleAvgVolume =
      (candles[candles.length - 6].volume + candles[candles.length - 5].volume) / 2;
    const conAvgVolume =
      consolidationCandles.reduce((s, c) => s + c.volume, 0) / consolidationCandles.length;
    const volumeDeclining = conAvgVolume < poleAvgVolume;

    const isBullFlag =
      poleMove > sharpMove && spreadPct < consolidationSpread && volumeDeclining;
    const isBearFlag =
      poleMove < -sharpMove && spreadPct < consolidationSpread && volumeDeclining;

    const fired = isBullFlag || isBearFlag;
    const direction: TradeDirection = isBullFlag ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        poleMove: +poleMove.toFixed(2),
        spreadPct: +spreadPct.toFixed(2),
        volumeDeclining,
        type: isBullFlag ? 'bull' : isBearFlag ? 'bear' : 'none',
      },
    };
  }
}
