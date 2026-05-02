export default () => ({
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
  execution: {
    enabled: process.env.LIVE_TRADING_ENABLED === 'true',
    allowMainnet: process.env.ALLOW_MAINNET_TRADING === 'true',
  },
  hyperliquid: {
    privateKey: process.env.HYPERLIQUID_PRIVATE_KEY,
    accountAddress: process.env.HYPERLIQUID_ACCOUNT_ADDRESS || null,
    testnet: process.env.HYPERLIQUID_TESTNET === 'true',
    marketOrderSlippage: 0.005,
    apiUrl:
      process.env.HYPERLIQUID_API_URL ||
      (process.env.HYPERLIQUID_TESTNET === 'true'
        ? 'https://api.hyperliquid-testnet.xyz'
        : 'https://api.hyperliquid.xyz'),
    wsUrl:
      process.env.HYPERLIQUID_WS_URL ||
      (process.env.HYPERLIQUID_TESTNET === 'true'
        ? 'wss://api.hyperliquid-testnet.xyz/ws'
        : 'wss://api.hyperliquid.xyz/ws'),
  },
  capital: {
    initial: parseFloat(process.env.INITIAL_CAPITAL || '200'),
    maxConcurrentPositions: parseInt(process.env.MAX_CONCURRENT_POSITIONS || '5'),
    leverage: parseFloat(process.env.DEFAULT_LEVERAGE || '3'),
    minOrderNotional: parseFloat(process.env.MIN_ORDER_NOTIONAL || '10'),
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
    volatilityStopPercent: 15,
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
    maxTrackedTokens: parseInt(process.env.MAX_TRACKED_TOKENS || '150'),
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
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
    synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  },
  auth: {
    allowedWallet: process.env.DASHBOARD_ALLOWED_WALLET || null,
    sessionSecret: process.env.DASHBOARD_AUTH_SECRET || null,
    sessionTtlHours: parseInt(process.env.DASHBOARD_SESSION_TTL_HOURS || '12'),
  },
});
