function readOptionalNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return undefined;
}

function readOptionalString(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }

  return raw;
}

function readOptionalJsonArray(name: string): number[] | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : undefined;
  } catch {
    return undefined;
  }
}

export default () => ({
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
  execution: {
    enabled: readOptionalBoolean('LIVE_TRADING_ENABLED'),
    allowMainnet: readOptionalBoolean('ALLOW_MAINNET_TRADING'),
  },
  hyperliquid: {
    privateKey: readOptionalString('HYPERLIQUID_PRIVATE_KEY'),
    accountAddress: readOptionalString('HYPERLIQUID_ACCOUNT_ADDRESS') ?? null,
    testnet: readOptionalBoolean('HYPERLIQUID_TESTNET'),
    marketOrderSlippage: readOptionalNumber('HYPERLIQUID_MARKET_ORDER_SLIPPAGE') ?? 0.01,
    minOrderBufferPercent: readOptionalNumber('HYPERLIQUID_MIN_ORDER_BUFFER_PERCENT') ?? 2,
    exchangeMinOrderNotional: readOptionalNumber('HYPERLIQUID_EXCHANGE_MIN_ORDER_NOTIONAL') ?? 10,
    apiUrl: readOptionalString('HYPERLIQUID_API_URL'),
    wsUrl: readOptionalString('HYPERLIQUID_WS_URL'),
  },
  capital: {
    initial: readOptionalNumber('INITIAL_CAPITAL'),
    maxConcurrentPositions: readOptionalNumber('MAX_CONCURRENT_POSITIONS'),
    leverage: readOptionalNumber('DEFAULT_LEVERAGE'),
    leverageScore2: readOptionalNumber('LEVERAGE_SCORE_2') ?? readOptionalNumber('DEFAULT_LEVERAGE'),
    leverageScore3: readOptionalNumber('LEVERAGE_SCORE_3') ?? readOptionalNumber('DEFAULT_LEVERAGE'),
    leverageScore4: readOptionalNumber('LEVERAGE_SCORE_4') ?? readOptionalNumber('DEFAULT_LEVERAGE'),
    minOrderNotional: readOptionalNumber('MIN_ORDER_NOTIONAL'),
    marginScore2: readOptionalNumber('MARGIN_SCORE_2'),
    marginScore3: readOptionalNumber('MARGIN_SCORE_3'),
    marginScore4: readOptionalNumber('MARGIN_SCORE_4'),
    freeCollateralBufferUsd: readOptionalNumber('FREE_COLLATERAL_BUFFER_USD') ?? 1,
  },
  exits: {
    stopLossPercent: readOptionalNumber('STOP_LOSS_PERCENT'),
    tp1Percent: readOptionalNumber('TP1_PERCENT'),
    tp2Percent: readOptionalNumber('TP2_PERCENT'),
    tp1ClosePercent: readOptionalNumber('TP1_CLOSE_PERCENT') ?? 50,
    tp2ClosePercent: readOptionalNumber('TP2_CLOSE_PERCENT') ?? 35,
    tp3ClosePercent: readOptionalNumber('TP3_CLOSE_PERCENT') ?? 15,
    trailingStopPercent: readOptionalNumber('TRAILING_STOP_PERCENT'),
    maxHoldHours: readOptionalNumber('MAX_HOLD_HOURS'),
    volatilityStopPercent: readOptionalNumber('VOLATILITY_STOP_PERCENT'),
  },
  risk: {
    dailyLossLimit: readOptionalNumber('DAILY_LOSS_LIMIT'),
    weeklyLossLimit: readOptionalNumber('WEEKLY_LOSS_LIMIT'),
    emergencyCapitalFloor: readOptionalNumber('EMERGENCY_CAPITAL_FLOOR'),
    consecutiveLossPause2h: readOptionalNumber('CONSECUTIVE_LOSS_PAUSE_2H'),
    consecutiveLossPauseDay: readOptionalNumber('CONSECUTIVE_LOSS_PAUSE_DAY'),
  },
  filters: {
    fundingRateMax: readOptionalNumber('FUNDING_RATE_MAX'),
    minMarketCap: readOptionalNumber('MIN_MARKET_CAP'),
    minTokenAgeDays: readOptionalNumber('MIN_TOKEN_AGE_DAYS'),
    maxPriceChange2h: readOptionalNumber('MAX_PRICE_CHANGE_2H'),
    consecutiveLossFilter: readOptionalNumber('CONSECUTIVE_LOSS_FILTER'),
  },
  scan: {
    intervalSeconds: readOptionalNumber('SCAN_INTERVAL_SECONDS'),
    candleLookback: readOptionalNumber('CANDLE_LOOKBACK'),
    maxTrackedTokens: readOptionalNumber('MAX_TRACKED_TOKENS'),
  },
  patterns: {
    volumeSpikeMultiplier: readOptionalNumber('VOLUME_SPIKE_MULTIPLIER'),
    volumeSpikeMaxPriceChange: readOptionalNumber('VOLUME_SPIKE_MAX_PRICE_CHANGE'),
    flagSharpMovePercent: readOptionalNumber('FLAG_SHARP_MOVE_PERCENT'),
    flagConsolidationSpread: readOptionalNumber('FLAG_CONSOLIDATION_SPREAD'),
    accumulationRangePercent: readOptionalNumber('ACCUMULATION_RANGE_PERCENT'),
    accumulationBreakoutVolume: readOptionalNumber('ACCUMULATION_BREAKOUT_VOLUME'),
    fibLevels: readOptionalJsonArray('FIB_LEVELS'),
    fibTolerancePercent: readOptionalNumber('FIB_TOLERANCE_PERCENT'),
  },
  market: {
    solBearThresholdPercent: readOptionalNumber('SOL_BEAR_THRESHOLD_PERCENT'),
    btcBearThresholdPercent: readOptionalNumber('BTC_BEAR_THRESHOLD_PERCENT'),
    bullMarketThresholdPercent: readOptionalNumber('BULL_MARKET_THRESHOLD_PERCENT'),
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
    synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  },
  auth: {
    allowedWallet: process.env.DASHBOARD_ALLOWED_WALLET || null,
    sessionSecret: process.env.DASHBOARD_AUTH_SECRET || null,
    sessionTtlHours: parseInt(process.env.DASHBOARD_SESSION_TTL_HOURS || '12'),
  },
  dashboard: {
    voiceAlertsEnabled: readOptionalBoolean('VOICE_ALERTS_ENABLED') ?? false,
  },
});
