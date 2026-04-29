export interface Candle {
  time: number; // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TradeDirection = 'long' | 'short';

export type MarketCondition = 'bull' | 'bear' | 'sideways' | 'btc_crash' | 'paused';

export type ExitReason =
  | 'TP1'
  | 'TP2'
  | 'TP3'
  | 'stop_loss'
  | 'time_stop'
  | 'volatility_stop'
  | 'emergency'
  | 'manual';

export type PatternId = 'volume_spike' | 'bull_bear_flag' | 'fibonacci' | 'accumulation_breakout';

export interface PatternResult {
  fired: boolean;
  direction?: TradeDirection;
  details?: Record<string, any>;
}

export interface TokenScore {
  token: string;
  score: number;
  direction: TradeDirection;
  patternsFired: PatternId[];
  patternDetails: Record<PatternId, PatternResult>;
  candles: Candle[];
  currentPrice: number;
  fundingRate: number;
  marketCap: number;
  tokenAgeDays: number;
  timestamp: number;
}

export interface TradeSignal {
  token: string;
  direction: TradeDirection;
  score: number;
  patternsFired: PatternId[];
  currentPrice: number;
  suggestedMargin: number;
  notional: number;
  marketCondition: MarketCondition;
}

export interface OpenPosition {
  id: string;
  token: string;
  direction: TradeDirection;
  entryPrice: number;
  currentPrice: number;
  margin: number;
  notional: number;
  leverage: number;
  size: number; // contracts/coins
  unrealizedPnl: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  stopPrice: number;
  trailingHighest: number;
  openTime: number; // unix ms
  patternsFired: PatternId[];
  score: number;
  marketCondition: MarketCondition;
  tp1Size: number;
  tp2Size: number;
  tp3Size: number;
}

export interface HyperliquidOrderRequest {
  coin: string;
  isBuy: boolean;
  sz: number;
  limitPx: number;
  orderType: { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' } } | { market: Record<string, never> };
  reduceOnly: boolean;
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;       // signed size (negative = short)
  entryPx: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  positionValue: string;
  marginUsed: string;
  maxLeverage: number;
  liquidationPx: string | null;
  leverage: { type: string; value: number };
}
