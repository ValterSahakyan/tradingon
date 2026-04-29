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

function validatePrivateKey(value: EnvValue): void {
  if (!value) {
    return;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value.trim())) {
    throw new Error('HYPERLIQUID_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
  }
}

export function validateRuntimeEnv(): void {
  readRequired('DATABASE_URL');

  const liveTrading = readBoolean('LIVE_TRADING_ENABLED', false);
  const allowMainnetTrading = readBoolean('ALLOW_MAINNET_TRADING', false);
  const testnet = readBoolean('HYPERLIQUID_TESTNET', true);
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY?.trim();

  validatePrivateKey(privateKey);

  if (liveTrading && !privateKey) {
    throw new Error('HYPERLIQUID_PRIVATE_KEY is required when LIVE_TRADING_ENABLED=true');
  }

  if (liveTrading && !testnet && !allowMainnetTrading) {
    throw new Error(
      'ALLOW_MAINNET_TRADING=true is required when live trading is enabled on mainnet',
    );
  }

  readBoolean('DATABASE_SSL', false);
  readBoolean('TYPEORM_SYNCHRONIZE', false);

  readNumber('PORT', 3000, 1);
  readNumber('INITIAL_CAPITAL', 200, 0);
  readNumber('MAX_CONCURRENT_POSITIONS', 5, 1);
  readNumber('DEFAULT_LEVERAGE', 3, 1);
  readNumber('STOP_LOSS_PERCENT', 7, 0);
  readNumber('TP1_PERCENT', 10, 0);
  readNumber('TP2_PERCENT', 20, 0);
  readNumber('TRAILING_STOP_PERCENT', 5, 0);
  readNumber('MAX_HOLD_HOURS', 4, 0);
  readNumber('DAILY_LOSS_LIMIT', 20, 0);
  readNumber('WEEKLY_LOSS_LIMIT', 40, 0);
  readNumber('EMERGENCY_CAPITAL_FLOOR', 150, 0);
  readNumber('FUNDING_RATE_MAX', 0.1, 0);
  readNumber('MIN_MARKET_CAP', 1000000, 0);
  readNumber('MIN_TOKEN_AGE_DAYS', 7, 0);
  readNumber('SCAN_INTERVAL_SECONDS', 300, 1);
  readNumber('MAX_TRACKED_TOKENS', 150, 1);
  readNumber('VOLUME_SPIKE_MULTIPLIER', 3, 0);
  readNumber('VOLUME_SPIKE_MAX_PRICE_CHANGE', 5, 0);
  readNumber('FLAG_SHARP_MOVE_PERCENT', 20, 0);
  readNumber('FLAG_CONSOLIDATION_SPREAD', 3, 0);
  readNumber('ACCUMULATION_RANGE_PERCENT', 8, 0);
  readNumber('ACCUMULATION_BREAKOUT_VOLUME', 5, 0);
  readNumber('SOL_BEAR_THRESHOLD_PERCENT', 5, 0);
  readNumber('BTC_BEAR_THRESHOLD_PERCENT', 8, 0);
  readNumber('BULL_MARKET_THRESHOLD_PERCENT', 3, 0);
}
