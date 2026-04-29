export default () => ({
  hyperliquid: {
    privateKey: process.env.HYPERLIQUID_PRIVATE_KEY,
    testnet: process.env.HYPERLIQUID_TESTNET === 'true', // default false = mainnet
    apiUrl: process.env.HYPERLIQUID_API_URL ||
      (process.env.HYPERLIQUID_TESTNET === 'true'
        ? 'https://api.hyperliquid-testnet.xyz'
        : 'https://api.hyperliquid.xyz'),
    wsUrl: process.env.HYPERLIQUID_WS_URL ||
      (process.env.HYPERLIQUID_TESTNET === 'true'
        ? 'wss://api.hyperliquid-testnet.xyz/ws'
        : 'wss://api.hyperliquid.xyz/ws'),
  },
  capital: {
    initial: parseFloat(process.env.INITIAL_CAPITAL || '200'),
    maxConcurrentPositions: parseInt(process.env.MAX_CONCURRENT_POSITIONS || '5'),
    leverage: 3, // HARD CODED — NEVER CHANGE
    marginScore2: parseFloat(process.env.MARGIN_SCORE_2 || '4'),
    marginScore3: parseFloat(process.env.MARGIN_SCORE_3 || '5'),
    marginScore4: parseFloat(process.env.MARGIN_SCORE_4 || '6'),
  },
  exits: {
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '7'),
    tp1Percent: parseFloat(process.env.TP1_PERCENT || '10'),
    tp2Percent: parseFloat(process.env.TP2_PERCENT || '20'),
    trailingStopPercent: parseFloat(process.env.TRAILING_STOP_PERCENT || '5'),
    maxHoldHours: parseFloat(process.env.MAX_HOLD_HOURS || '4'),
    volatilityStopPercent: 15, // single-candle rug pull protection
  },
  risk: {
    dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT || '20'),
    weeklyLossLimit: parseFloat(process.env.WEEKLY_LOSS_LIMIT || '40'),
    emergencyCapitalFloor: parseFloat(process.env.EMERGENCY_CAPITAL_FLOOR || '150'),
    consecutiveLossPause2h: 3,
    consecutiveLossPauseDay: 5,
  },
  filters: {
    fundingRateMax: parseFloat(process.env.FUNDING_RATE_MAX || '0.1'),
    minMarketCap: parseFloat(process.env.MIN_MARKET_CAP || '1000000'),
    minTokenAgeDays: parseInt(process.env.MIN_TOKEN_AGE_DAYS || '7'),
    maxPriceChange2h: 30,
    consecutiveLossFilter: 3,
  },
  scan: {
    intervalSeconds: parseInt(process.env.SCAN_INTERVAL_SECONDS || '300'),
    candleLookback: 48,
  },
  patterns: {
    volumeSpikeMultiplier: parseFloat(process.env.VOLUME_SPIKE_MULTIPLIER || '3'),
    volumeSpikeMaxPriceChange: parseFloat(process.env.VOLUME_SPIKE_MAX_PRICE_CHANGE || '5'),
    flagSharpMovePercent: parseFloat(process.env.FLAG_SHARP_MOVE_PERCENT || '20'),
    flagConsolidationSpread: parseFloat(process.env.FLAG_CONSOLIDATION_SPREAD || '3'),
    accumulationRangePercent: parseFloat(process.env.ACCUMULATION_RANGE_PERCENT || '8'),
    accumulationBreakoutVolume: parseFloat(process.env.ACCUMULATION_BREAKOUT_VOLUME || '5'),
    fibLevels: [0.5, 0.618],
    fibTolerancePercent: 2,
  },
  market: {
    solBearThresholdPercent: parseFloat(process.env.SOL_BEAR_THRESHOLD_PERCENT || '5'),
    btcBearThresholdPercent: parseFloat(process.env.BTC_BEAR_THRESHOLD_PERCENT || '8'),
    bullMarketThresholdPercent: parseFloat(process.env.BULL_MARKET_THRESHOLD_PERCENT || '3'),
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/tradingon',
  },
});
