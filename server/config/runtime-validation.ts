type EnvValue = string | undefined;

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === '') {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be "true" or "false"`);
}

function readNumber(name: string, defaultValue: number, min?: number): number {
  const raw = process.env[name];
  const value = raw == null || raw === '' ? defaultValue : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (min != null && value < min) {
    throw new Error(`${name} must be >= ${min}`);
  }

  return value;
}

function validateOptionalBoolean(name: string): void {
  const value = process.env[name];
  if (value == null || value === '') {
    return;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be "true" or "false"`);
  }
}

function validateOptionalNumber(name: string, min?: number): void {
  const raw = process.env[name];
  if (raw == null || raw === '') {
    return;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (min != null && value < min) {
    throw new Error(`${name} must be >= ${min}`);
  }
}

function validateOptionalJsonArray(name: string): void {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isFinite(Number(value)))) {
      throw new Error();
    }
  } catch {
    throw new Error(`${name} must be a JSON array of numbers`);
  }
}

function validatePrivateKey(value: EnvValue): void {
  if (!value) {
    return;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value.trim())) {
    // Don't crash — the client will log a clear error and disable execution
    console.warn('[WARNING] HYPERLIQUID_PRIVATE_KEY looks invalid — must be a 0x-prefixed 64-hex-char private key, not a wallet address. Update it in the Config panel.');
  }
}

function validateWalletAddress(name: string, value: EnvValue): void {
  if (!value) {
    return;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value.trim())) {
    throw new Error(`${name} must be a valid 0x-prefixed wallet address`);
  }
}

export function validateRuntimeEnv(): void {
  readRequired('DATABASE_URL');

  // DB-managed settings may be provided as seed/override env vars, but they are
  // not required for startup and should never be defaulted here.
  validatePrivateKey(process.env.HYPERLIQUID_PRIVATE_KEY?.trim());
  validateOptionalBoolean('LIVE_TRADING_ENABLED');
  validateOptionalBoolean('ALLOW_MAINNET_TRADING');
  validateOptionalBoolean('HYPERLIQUID_TESTNET');
  validateOptionalBoolean('VOICE_ALERTS_ENABLED');

  readBoolean('DATABASE_SSL', false);
  readBoolean('TYPEORM_SYNCHRONIZE', false);

  const allowedWallet = process.env.DASHBOARD_ALLOWED_WALLET?.trim();
  validateWalletAddress('DASHBOARD_ALLOWED_WALLET', allowedWallet);

  readNumber('PORT', 3002, 1);
  readNumber('DASHBOARD_SESSION_TTL_HOURS', 12, 1);
  validateOptionalNumber('HYPERLIQUID_MARKET_ORDER_SLIPPAGE', 0);
  validateOptionalNumber('INITIAL_CAPITAL', 0);
  validateOptionalNumber('MAX_CONCURRENT_POSITIONS', 1);
  validateOptionalNumber('DEFAULT_LEVERAGE', 1);
  validateOptionalNumber('MIN_ORDER_NOTIONAL', 1);
  validateOptionalNumber('MARGIN_SCORE_2', 0);
  validateOptionalNumber('MARGIN_SCORE_3', 0);
  validateOptionalNumber('MARGIN_SCORE_4', 0);
  validateOptionalNumber('STOP_LOSS_PERCENT', 0);
  validateOptionalNumber('TP1_PERCENT', 0);
  validateOptionalNumber('TP2_PERCENT', 0);
  validateOptionalNumber('TRAILING_STOP_PERCENT', 0);
  validateOptionalNumber('MAX_HOLD_HOURS', 0);
  validateOptionalNumber('VOLATILITY_STOP_PERCENT', 0);
  validateOptionalNumber('DAILY_LOSS_LIMIT', 0);
  validateOptionalNumber('WEEKLY_LOSS_LIMIT', 0);
  validateOptionalNumber('EMERGENCY_CAPITAL_FLOOR', 0);
  validateOptionalNumber('CONSECUTIVE_LOSS_PAUSE_2H', 0);
  validateOptionalNumber('CONSECUTIVE_LOSS_PAUSE_DAY', 0);
  validateOptionalNumber('FUNDING_RATE_MAX', 0);
  validateOptionalNumber('MIN_MARKET_CAP', 0);
  validateOptionalNumber('MIN_TOKEN_AGE_DAYS', 0);
  validateOptionalNumber('MAX_PRICE_CHANGE_2H', 0);
  validateOptionalNumber('CONSECUTIVE_LOSS_FILTER', 0);
  validateOptionalNumber('SCAN_INTERVAL_SECONDS', 1);
  validateOptionalNumber('CANDLE_LOOKBACK', 1);
  validateOptionalNumber('MAX_TRACKED_TOKENS', 1);
  validateOptionalNumber('VOLUME_SPIKE_MULTIPLIER', 0);
  validateOptionalNumber('VOLUME_SPIKE_MAX_PRICE_CHANGE', 0);
  validateOptionalNumber('FLAG_SHARP_MOVE_PERCENT', 0);
  validateOptionalNumber('FLAG_CONSOLIDATION_SPREAD', 0);
  validateOptionalNumber('ACCUMULATION_RANGE_PERCENT', 0);
  validateOptionalNumber('ACCUMULATION_BREAKOUT_VOLUME', 0);
  validateOptionalJsonArray('FIB_LEVELS');
  validateOptionalNumber('FIB_TOLERANCE_PERCENT', 0);
  validateOptionalNumber('SOL_BEAR_THRESHOLD_PERCENT', 0);
  validateOptionalNumber('BTC_BEAR_THRESHOLD_PERCENT', 0);
  validateOptionalNumber('BULL_MARKET_THRESHOLD_PERCENT', 0);
}
