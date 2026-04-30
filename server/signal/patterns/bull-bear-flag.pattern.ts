import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { Candle, PatternResult, TradeDirection } from '../../common/types';

@Injectable()
export class BullBearFlagPattern {
  constructor(private readonly config: AppConfigService) {}

  detect(candles: Candle[]): PatternResult {
    // Needs 20 pole + 4 consolidation + 1 current = 25 minimum
    if (candles.length < 25) {
      return { fired: false };
    }

    const current = candles[candles.length - 1];
    // Pole: 20 candles (~100 min) — enough for a realistic directional move
    const poleCandles = candles.slice(-25, -5);
    // Consolidation: 4 candles immediately before the breakout candle
    const consolidationCandles = candles.slice(-5, -1);
    const sharpMove = this.config.get<number>('patterns.flagSharpMovePercent');
    const consolidationSpread = this.config.get<number>('patterns.flagConsolidationSpread');

    const poleStart = poleCandles[0].open;
    const poleEnd = poleCandles[poleCandles.length - 1].close;
    const poleMove = ((poleEnd - poleStart) / poleStart) * 100;
    const poleRange = Math.abs(poleEnd - poleStart);

    const conHigh = Math.max(...consolidationCandles.map((c) => c.high));
    const conLow = Math.min(...consolidationCandles.map((c) => c.low));
    const spreadPct = ((conHigh - conLow) / conLow) * 100;

    const poleAvgVolume = poleCandles.reduce((sum, candle) => sum + candle.volume, 0) / poleCandles.length;
    const conAvgVolume =
      consolidationCandles.reduce((sum, candle) => sum + candle.volume, 0) / consolidationCandles.length;
    const volumeDeclining = conAvgVolume < poleAvgVolume;
    const breakoutVolume = current.volume > conAvgVolume;

    const breakoutUp = current.close > conHigh && breakoutVolume;
    const breakoutDown = current.close < conLow && breakoutVolume;

    const isBullFlag =
      poleMove >= sharpMove &&
      spreadPct <= consolidationSpread &&
      volumeDeclining &&
      breakoutUp;
    const isBearFlag =
      poleMove <= -sharpMove &&
      spreadPct <= consolidationSpread &&
      volumeDeclining &&
      breakoutDown;

    const fired = isBullFlag || isBearFlag;
    const direction: TradeDirection = isBullFlag ? 'long' : 'short';

    return {
      fired,
      direction: fired ? direction : undefined,
      details: {
        poleMove: +poleMove.toFixed(2),
        poleRange: +poleRange.toFixed(6),
        spreadPct: +spreadPct.toFixed(2),
        volumeDeclining,
        breakoutVolume,
        breakoutLevel: +(isBullFlag ? conHigh : conLow).toFixed(6),
        type: isBullFlag ? 'bull' : isBearFlag ? 'bear' : 'none',
      },
    };
  }
}
