import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { MarketDataService } from '../market-data/market-data.service';
import { PositionManagerService } from '../position-manager/position-manager.service';
import { RiskService } from '../risk/risk.service';
import { LoggingService } from '../logging/logging.service';
import { TradeLog } from '../logging/entities/trade-log.entity';
import { TradeSignal } from '../common/types';

type FieldType = 'string' | 'number' | 'boolean';

interface ConfigField {
  key: string;
  env: string | null;
  path: string;
  type: FieldType;
  label: string;
  section: string;
  editable: boolean;
  secret?: boolean;
  help?: string;
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: 'hyperliquidPrivateKey',
    env: 'HYPERLIQUID_PRIVATE_KEY',
    path: 'hyperliquid.privateKey',
    type: 'string',
    label: 'Private Key',
    section: 'Exchange',
    editable: true,
    secret: true,
    help: 'Wallet key used for authenticated trading requests.',
  },
  {
    key: 'hyperliquidTestnet',
    env: 'HYPERLIQUID_TESTNET',
    path: 'hyperliquid.testnet',
    type: 'boolean',
    label: 'Testnet Mode',
    section: 'Exchange',
    editable: true,
    help: 'Switch between testnet and mainnet on next restart.',
  },
  {
    key: 'hyperliquidApiUrl',
    env: 'HYPERLIQUID_API_URL',
    path: 'hyperliquid.apiUrl',
    type: 'string',
    label: 'API URL',
    section: 'Exchange',
    editable: true,
  },
  {
    key: 'hyperliquidWsUrl',
    env: 'HYPERLIQUID_WS_URL',
    path: 'hyperliquid.wsUrl',
    type: 'string',
    label: 'WebSocket URL',
    section: 'Exchange',
    editable: true,
  },
  {
    key: 'initialCapital',
    env: 'INITIAL_CAPITAL',
    path: 'capital.initial',
    type: 'number',
    label: 'Initial Capital',
    section: 'Capital',
    editable: true,
  },
  {
    key: 'maxConcurrentPositions',
    env: 'MAX_CONCURRENT_POSITIONS',
    path: 'capital.maxConcurrentPositions',
    type: 'number',
    label: 'Max Concurrent Positions',
    section: 'Capital',
    editable: true,
  },
  {
    key: 'leverage',
    env: null,
    path: 'capital.leverage',
    type: 'number',
    label: 'Leverage',
    section: 'Capital',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'marginScore2',
    env: 'MARGIN_SCORE_2',
    path: 'capital.marginScore2',
    type: 'number',
    label: 'Margin For Score 2',
    section: 'Capital',
    editable: true,
  },
  {
    key: 'marginScore3',
    env: 'MARGIN_SCORE_3',
    path: 'capital.marginScore3',
    type: 'number',
    label: 'Margin For Score 3',
    section: 'Capital',
    editable: true,
  },
  {
    key: 'marginScore4',
    env: 'MARGIN_SCORE_4',
    path: 'capital.marginScore4',
    type: 'number',
    label: 'Margin For Score 4',
    section: 'Capital',
    editable: true,
  },
  {
    key: 'stopLossPercent',
    env: 'STOP_LOSS_PERCENT',
    path: 'exits.stopLossPercent',
    type: 'number',
    label: 'Stop Loss %',
    section: 'Exits',
    editable: true,
  },
  {
    key: 'tp1Percent',
    env: 'TP1_PERCENT',
    path: 'exits.tp1Percent',
    type: 'number',
    label: 'TP1 %',
    section: 'Exits',
    editable: true,
  },
  {
    key: 'tp2Percent',
    env: 'TP2_PERCENT',
    path: 'exits.tp2Percent',
    type: 'number',
    label: 'TP2 %',
    section: 'Exits',
    editable: true,
  },
  {
    key: 'trailingStopPercent',
    env: 'TRAILING_STOP_PERCENT',
    path: 'exits.trailingStopPercent',
    type: 'number',
    label: 'Trailing Stop %',
    section: 'Exits',
    editable: true,
  },
  {
    key: 'maxHoldHours',
    env: 'MAX_HOLD_HOURS',
    path: 'exits.maxHoldHours',
    type: 'number',
    label: 'Max Hold Hours',
    section: 'Exits',
    editable: true,
  },
  {
    key: 'volatilityStopPercent',
    env: null,
    path: 'exits.volatilityStopPercent',
    type: 'number',
    label: 'Volatility Stop %',
    section: 'Exits',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'dailyLossLimit',
    env: 'DAILY_LOSS_LIMIT',
    path: 'risk.dailyLossLimit',
    type: 'number',
    label: 'Daily Loss Limit',
    section: 'Risk',
    editable: true,
  },
  {
    key: 'weeklyLossLimit',
    env: 'WEEKLY_LOSS_LIMIT',
    path: 'risk.weeklyLossLimit',
    type: 'number',
    label: 'Weekly Loss Limit',
    section: 'Risk',
    editable: true,
  },
  {
    key: 'emergencyCapitalFloor',
    env: 'EMERGENCY_CAPITAL_FLOOR',
    path: 'risk.emergencyCapitalFloor',
    type: 'number',
    label: 'Emergency Capital Floor',
    section: 'Risk',
    editable: true,
  },
  {
    key: 'consecutiveLossPause2h',
    env: null,
    path: 'risk.consecutiveLossPause2h',
    type: 'number',
    label: 'Pause After Losses',
    section: 'Risk',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'consecutiveLossPauseDay',
    env: null,
    path: 'risk.consecutiveLossPauseDay',
    type: 'number',
    label: 'Day Stop After Losses',
    section: 'Risk',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'fundingRateMax',
    env: 'FUNDING_RATE_MAX',
    path: 'filters.fundingRateMax',
    type: 'number',
    label: 'Funding Rate Max',
    section: 'Filters',
    editable: true,
  },
  {
    key: 'minMarketCap',
    env: 'MIN_MARKET_CAP',
    path: 'filters.minMarketCap',
    type: 'number',
    label: 'Min Market Cap',
    section: 'Filters',
    editable: true,
  },
  {
    key: 'minTokenAgeDays',
    env: 'MIN_TOKEN_AGE_DAYS',
    path: 'filters.minTokenAgeDays',
    type: 'number',
    label: 'Min Token Age Days',
    section: 'Filters',
    editable: true,
  },
  {
    key: 'maxPriceChange2h',
    env: null,
    path: 'filters.maxPriceChange2h',
    type: 'number',
    label: 'Max Price Change 2h',
    section: 'Filters',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'consecutiveLossFilter',
    env: null,
    path: 'filters.consecutiveLossFilter',
    type: 'number',
    label: 'Consecutive Loss Filter',
    section: 'Filters',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'scanIntervalSeconds',
    env: 'SCAN_INTERVAL_SECONDS',
    path: 'scan.intervalSeconds',
    type: 'number',
    label: 'Scan Interval Seconds',
    section: 'Scanning',
    editable: true,
  },
  {
    key: 'candleLookback',
    env: null,
    path: 'scan.candleLookback',
    type: 'number',
    label: 'Candle Lookback',
    section: 'Scanning',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'volumeSpikeMultiplier',
    env: 'VOLUME_SPIKE_MULTIPLIER',
    path: 'patterns.volumeSpikeMultiplier',
    type: 'number',
    label: 'Volume Spike Multiplier',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'volumeSpikeMaxPriceChange',
    env: 'VOLUME_SPIKE_MAX_PRICE_CHANGE',
    path: 'patterns.volumeSpikeMaxPriceChange',
    type: 'number',
    label: 'Volume Spike Max Price Change',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'flagSharpMovePercent',
    env: 'FLAG_SHARP_MOVE_PERCENT',
    path: 'patterns.flagSharpMovePercent',
    type: 'number',
    label: 'Flag Sharp Move %',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'flagConsolidationSpread',
    env: 'FLAG_CONSOLIDATION_SPREAD',
    path: 'patterns.flagConsolidationSpread',
    type: 'number',
    label: 'Flag Consolidation Spread',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'accumulationRangePercent',
    env: 'ACCUMULATION_RANGE_PERCENT',
    path: 'patterns.accumulationRangePercent',
    type: 'number',
    label: 'Accumulation Range %',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'accumulationBreakoutVolume',
    env: 'ACCUMULATION_BREAKOUT_VOLUME',
    path: 'patterns.accumulationBreakoutVolume',
    type: 'number',
    label: 'Accumulation Breakout Volume',
    section: 'Patterns',
    editable: true,
  },
  {
    key: 'fibLevels',
    env: null,
    path: 'patterns.fibLevels',
    type: 'string',
    label: 'Fib Levels',
    section: 'Patterns',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'fibTolerancePercent',
    env: null,
    path: 'patterns.fibTolerancePercent',
    type: 'number',
    label: 'Fib Tolerance %',
    section: 'Patterns',
    editable: false,
    help: 'Hardcoded in source.',
  },
  {
    key: 'solBearThresholdPercent',
    env: 'SOL_BEAR_THRESHOLD_PERCENT',
    path: 'market.solBearThresholdPercent',
    type: 'number',
    label: 'SOL Bear Threshold %',
    section: 'Market',
    editable: true,
  },
  {
    key: 'btcBearThresholdPercent',
    env: 'BTC_BEAR_THRESHOLD_PERCENT',
    path: 'market.btcBearThresholdPercent',
    type: 'number',
    label: 'BTC Bear Threshold %',
    section: 'Market',
    editable: true,
  },
  {
    key: 'bullMarketThresholdPercent',
    env: 'BULL_MARKET_THRESHOLD_PERCENT',
    path: 'market.bullMarketThresholdPercent',
    type: 'number',
    label: 'Bull Market Threshold %',
    section: 'Market',
    editable: true,
  },
  {
    key: 'databaseUrl',
    env: 'DATABASE_URL',
    path: 'database.url',
    type: 'string',
    label: 'Database URL',
    section: 'Database',
    editable: true,
    secret: true,
  },
];

@Injectable()
export class DashboardService {
  private recentSignals: (TradeSignal & { timestamp: number })[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly marketData: MarketDataService,
    private readonly positions: PositionManagerService,
    private readonly risk: RiskService,
    private readonly logging: LoggingService,
    @InjectRepository(TradeLog)
    private readonly tradeRepo: Repository<TradeLog>,
  ) {}

  pushSignals(signals: TradeSignal[]) {
    const now = Date.now();
    for (const signal of signals) {
      this.recentSignals.unshift({ ...signal, timestamp: now });
    }
    if (this.recentSignals.length > 50) {
      this.recentSignals = this.recentSignals.slice(0, 50);
    }
  }

  getStatus() {
    const marketCondition = this.marketData.getMarketCondition();
    const riskSnapshot = this.risk.getSnapshot();
    const trackedTokens = this.marketData.getTrackedTokens().length;
    const openPositions = this.positions.getPositionCount();

    return {
      state: riskSnapshot.state,
      marketCondition,
      trackedTokens,
      openPositions,
      maxPositions: this.config.get<number>('capital.maxConcurrentPositions'),
      pauseUntil: riskSnapshot.pauseTimer?.until ?? null,
      pauseReason: riskSnapshot.pauseTimer?.reason ?? null,
      timestamp: Date.now(),
      marketMoves: {
        sol1h: +this.marketData.getSolPriceChangePct(3600_000).toFixed(2),
        btc4h: +this.marketData.getBtcPriceChangePct(4 * 3600_000).toFixed(2),
      },
    };
  }

  getPositions() {
    const positions = this.positions.getOpenPositions();
    const tp1Percent = this.config.get<number>('exits.tp1Percent') / 100;
    const tp2Percent = this.config.get<number>('exits.tp2Percent') / 100;
    const maxHoldMinutes = this.config.get<number>('exits.maxHoldHours') * 60;

    return Array.from(positions.values()).map((position) => {
      const priceDiff =
        position.direction === 'long'
          ? position.currentPrice - position.entryPrice
          : position.entryPrice - position.currentPrice;
      const pnlPct = (priceDiff / position.entryPrice) * 100;
      const holdMins = Math.round((Date.now() - position.openTime) / 60_000);
      const timeLeftMins = Math.max(0, maxHoldMinutes - holdMins);

      const tp1Price =
        position.direction === 'long'
          ? position.entryPrice * (1 + tp1Percent)
          : position.entryPrice * (1 - tp1Percent);
      const tp2Price =
        position.direction === 'long'
          ? position.entryPrice * (1 + tp2Percent)
          : position.entryPrice * (1 - tp2Percent);

      return {
        token: position.token,
        direction: position.direction,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        stopPrice: position.stopPrice,
        tp1Price,
        tp2Price,
        pnlUsd: +position.unrealizedPnl.toFixed(4),
        pnlPct: +pnlPct.toFixed(2),
        margin: position.margin,
        notional: position.notional,
        leverage: position.leverage,
        tp1Hit: position.tp1Hit,
        tp2Hit: position.tp2Hit,
        patternsFired: position.patternsFired,
        score: position.score,
        holdMins,
        timeLeftMins,
        marketCondition: position.marketCondition,
      };
    });
  }

  getRecentSignals() {
    return this.recentSignals.slice(0, 20);
  }

  async getDailyStats() {
    const stats = await this.logging.getDailyStats();
    const todayPnl = await this.logging.getTodayPnl();
    const weekPnl = await this.logging.getWeekPnl();
    return {
      date: new Date().toISOString().split('T')[0],
      totalTrades: stats?.totalTrades ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      winRatePct: stats?.winRatePct ?? 0,
      todayPnl: +todayPnl.toFixed(4),
      weekPnl: +weekPnl.toFixed(4),
      avgWinUsd: stats?.avgWinUsd ?? 0,
      avgLossUsd: stats?.avgLossUsd ?? 0,
      circuitBreakerTriggered: stats?.circuitBreakerTriggered ?? false,
      circuitBreakerReason: stats?.circuitBreakerReason ?? null,
    };
  }

  async getRecentTrades() {
    const trades = await this.tradeRepo.find({
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return trades.map((trade) => ({
      id: trade.id,
      token: trade.token,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnlUsd: trade.pnlUsd,
      pnlPercent: trade.pnlPercent,
      exitReason: trade.exitReason,
      patternsFired: trade.patternsFired,
      score: trade.score,
      durationMinutes: trade.durationMinutes,
      tp1Hit: trade.tp1Hit,
      tp2Hit: trade.tp2Hit,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
    }));
  }

  async getPnlChartData() {
    const cutoff = Date.now() - 7 * 86400_000;
    const trades = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime >= :cutoff', { cutoff })
      .andWhere('t.pnlUsd IS NOT NULL')
      .orderBy('t.exitTime', 'ASC')
      .getMany();

    let cumulative = 0;
    return trades.map((trade) => {
      cumulative += +trade.pnlUsd;
      return { time: Number(trade.exitTime), cumPnl: +cumulative.toFixed(4) };
    });
  }

  async getConfig() {
    return {
      sections: this.groupConfigFields(),
      meta: {
        file: '.env',
        restartRequired: true,
      },
    };
  }

  async updateConfig(values: Record<string, unknown>) {
    const editableFields = CONFIG_FIELDS.filter((field) => field.editable && field.env);
    const envUpdates = new Map<string, string>();

    for (const field of editableFields) {
      if (!(field.key in values)) {
        continue;
      }

      const rawValue = values[field.key];
      if (field.secret && rawValue === '') {
        continue;
      }
      const serialized = this.serializeFieldValue(field, rawValue);
      envUpdates.set(field.env as string, serialized);
    }

    if (envUpdates.size > 0) {
      await this.writeEnvFile(envUpdates);
    }

    return {
      updatedKeys: editableFields
        .filter((field) => values[field.key] !== undefined)
        .map((field) => field.key),
      restartRequired: true,
    };
  }

  async getAll() {
    const [stats, trades, pnlChart] = await Promise.all([
      this.getDailyStats(),
      this.getRecentTrades(),
      this.getPnlChartData(),
    ]);

    return {
      status: this.getStatus(),
      positions: this.getPositions(),
      signals: this.getRecentSignals(),
      stats,
      trades,
      pnlChart,
    };
  }

  private groupConfigFields() {
    const grouped = new Map<string, unknown[]>();

    for (const field of CONFIG_FIELDS) {
      const currentValue = this.config.get(field.path);
      const item = {
        key: field.key,
        env: field.env,
        label: field.label,
        type: field.type,
        editable: field.editable,
        help: field.help ?? null,
        value: field.secret ? this.maskValue(currentValue) : currentValue,
        rawValue: field.secret ? '' : currentValue,
      };

      const section = grouped.get(field.section) ?? [];
      section.push(item);
      grouped.set(field.section, section);
    }

    return Array.from(grouped.entries()).map(([section, fields]) => ({
      section,
      fields,
    }));
  }

  private serializeFieldValue(field: ConfigField, rawValue: unknown) {
    if (field.type === 'number') {
      const value = Number(rawValue);
      if (Number.isNaN(value)) {
        throw new Error(`Invalid number for ${field.key}`);
      }
      return String(value);
    }

    if (field.type === 'boolean') {
      if (rawValue === true || rawValue === 'true') {
        return 'true';
      }
      if (rawValue === false || rawValue === 'false') {
        return 'false';
      }
      throw new Error(`Invalid boolean for ${field.key}`);
    }

    if (typeof rawValue !== 'string') {
      throw new Error(`Invalid string for ${field.key}`);
    }

    return rawValue;
  }

  private async writeEnvFile(updates: Map<string, string>) {
    const envPath = join(process.cwd(), '.env');
    const existing = await fs.readFile(envPath, 'utf8').catch(() => '');
    const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
    const seen = new Set<string>();

    const nextLines = lines.map((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (!match) {
        return line;
      }

      const key = match[1];
      if (!updates.has(key)) {
        return line;
      }

      seen.add(key);
      return `${key}=${updates.get(key)}`;
    });

    for (const [key, value] of updates.entries()) {
      if (!seen.has(key)) {
        nextLines.push(`${key}=${value}`);
      }
    }

    await fs.writeFile(envPath, `${nextLines.join('\n').trimEnd()}\n`, 'utf8');
  }

  private maskValue(value: unknown) {
    if (typeof value !== 'string' || value.length === 0) {
      return '';
    }
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
}
