import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MarketDataService } from '../market-data/market-data.service';
import { PositionManagerService } from '../position-manager/position-manager.service';
import { RiskService } from '../risk/risk.service';
import { LoggingService } from '../logging/logging.service';
import { ExecutionService } from '../execution/execution.service';
import { TradeLog } from '../logging/entities/trade-log.entity';
import { TradeSignal } from '../common/types';
import { SettingField } from '../config/app-settings.definitions';
import { repoRoot } from '../config/paths';
import { SignalService } from '../signal/signal.service';

@Injectable()
export class DashboardService {
  private recentSignals: (TradeSignal & { timestamp: number })[] = [];
  private accountValue: number | null = null;
  private accountValueAt: number | null = null;
  private readonly balanceRequestTimeoutMs = 30000;
  private readonly appVersion = this.readAppVersion();

  constructor(
    private readonly config: AppConfigService,
    private readonly marketData: MarketDataService,
    private readonly positions: PositionManagerService,
    private readonly risk: RiskService,
    private readonly logging: LoggingService,
    private readonly signal: SignalService,
    private readonly execution: ExecutionService,
    @InjectRepository(TradeLog)
    private readonly tradeRepo: Repository<TradeLog>,
  ) {}

  pushAccountValue(value: number) {
    this.accountValue = value;
    this.accountValueAt = Date.now();
  }

  async getBalance(): Promise<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null; needsAccountAddress: boolean }> {
    const [perp, spot] = await Promise.all([
      this.withTimeout(this.execution.getAccountValue(), this.balanceRequestTimeoutMs, this.accountValue),
      this.withTimeout(this.execution.getSpotUsdcBalance(), this.balanceRequestTimeoutMs, null),
    ]);

    const perpBalance = perp ?? this.accountValue;
    if (perpBalance !== null) {
      this.accountValue = perpBalance;
      this.accountValueAt = Date.now();
    }

    const walletAddr = this.execution.getWalletAddress();
    const accountAddr = this.execution.getAccountAddress();
    const needsAccountAddress = !!walletAddr && walletAddr.toLowerCase() === accountAddr?.toLowerCase();

    return {
      perpBalance,
      spotBalance: spot,
      updatedAt: this.accountValueAt,
      needsAccountAddress,
    };
  }

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
      accountValue: this.accountValue,
      accountValueAt: this.accountValueAt,
      timestamp: Date.now(),
      marketMoves: {
        sol1h: +this.marketData.getSolPriceChangePct(3600_000).toFixed(2),
        btc4h: +this.marketData.getBtcPriceChangePct(4 * 3600_000).toFixed(2),
      },
      scanDiagnostics: this.signal.getLastDiagnostics(),
    };
  }

  getPositions() {
    const positions = this.positions.getOpenPositions();
    const maxHoldMinutes = this.config.get<number>('exits.maxHoldHours') * 60;

    return Array.from(positions.values()).map((position) => {
      const priceDiff =
        position.direction === 'long'
          ? position.currentPrice - position.entryPrice
          : position.entryPrice - position.currentPrice;
      const pnlPct = (priceDiff / position.entryPrice) * 100;
      const holdMins = Math.round((Date.now() - position.openTime) / 60_000);
      const timeLeftMins = Math.max(0, maxHoldMinutes - holdMins);

      return {
        token: position.token,
        direction: position.direction,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        stopPrice: position.stopPrice,
        tp1Price: position.tp1Price,
        tp2Price: position.tp2Price,
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
    const persisted = this.recentSignals.slice(0, 20);
    const fallbackFromCurrentScan = this.signal
      .getLastCandidates()
      .filter((candidate) => candidate.tradable && candidate.direction !== null)
      .map((candidate) => ({
        token: candidate.token,
        direction: candidate.direction!,
        score: candidate.score,
        patternsFired: candidate.patternsFired,
        currentPrice: candidate.currentPrice,
        suggestedMargin: 0,
        notional: 0,
        stopPrice: 0,
        tp1Price: 0,
        tp2Price: 0,
        marketCondition: candidate.marketCondition,
        timestamp: candidate.timestamp,
      }));

    const merged = [...persisted];
    const seen = new Set(merged.map((signal) => `${signal.token}:${signal.direction}`));

    for (const signal of fallbackFromCurrentScan) {
      const key = `${signal.token}:${signal.direction}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(signal);
    }

    return merged
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 20);
  }

  getWatchlist() {
    return this.signal.getLastCandidates();
  }

  async getDailyStats() {
    const stats = await this.logging.getDailyStats();
    const todayPnl = this.toNumber(await this.logging.getTodayPnl());
    const weekPnl = this.toNumber(await this.logging.getWeekPnl());
    return {
      date: new Date().toISOString().split('T')[0],
      totalTrades: stats?.totalTrades ?? 0,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      winRatePct: this.toNumber(stats?.winRatePct),
      todayPnl: +todayPnl.toFixed(4),
      weekPnl: +weekPnl.toFixed(4),
      avgWinUsd: this.toNumber(stats?.avgWinUsd),
      avgLossUsd: this.toNumber(stats?.avgLossUsd),
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
      entryPrice: this.toNumber(trade.entryPrice),
      exitPrice: trade.exitPrice == null ? null : this.toNumber(trade.exitPrice),
      pnlUsd: trade.pnlUsd == null ? null : this.toNumber(trade.pnlUsd),
      pnlPercent: trade.pnlPercent == null ? null : this.toNumber(trade.pnlPercent),
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
    const trades = await this.tradeRepo
      .createQueryBuilder('t')
      .where('t.exitTime IS NOT NULL')
      .andWhere('t.pnlUsd IS NOT NULL')
      .orderBy('t.exitTime', 'ASC')
      .limit(200)
      .getMany();

    let cumulative = 0;
    const chart = trades.map((trade) => {
      cumulative += +trade.pnlUsd;
      return { time: Number(trade.exitTime), cumPnl: +cumulative.toFixed(4) };
    });

    const openPositions = Array.from(this.positions.getOpenPositions().values());
    const unrealized = openPositions.reduce(
      (sum, position) => sum + this.toNumber(position.unrealizedPnl),
      0,
    );

    if (chart.length === 0 && openPositions.length > 0) {
      const firstOpenAt = Math.min(...openPositions.map((position) => Number(position.openTime)));
      return [
        { time: firstOpenAt, cumPnl: 0 },
        { time: Date.now(), cumPnl: +unrealized.toFixed(4) },
      ];
    }

    if (chart.length > 0 && openPositions.length > 0) {
      chart.push({
        time: Date.now(),
        cumPnl: +(cumulative + unrealized).toFixed(4),
      });
    }

    return chart;
  }

  async getConfig() {
    return {
      sections: this.groupConfigFields(),
      meta: {
        storage: 'database',
        restartRequired: true,
      },
    };
  }

  async updateConfig(values: Record<string, unknown>) {
    const updatedKeys = await this.config.updateSettings(values);
    return {
      updatedKeys,
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
      meta: {
        version: this.appVersion,
      },
      status: this.getStatus(),
      positions: this.getPositions(),
      signals: this.getRecentSignals(),
      watchlist: this.getWatchlist(),
      stats,
      trades,
      pnlChart,
    };
  }

  private groupConfigFields() {
    const grouped = new Map<string, unknown[]>();

    for (const field of this.config.getSettingFields()) {
      if (!field.editable) {
        continue;
      }

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

  private maskValue(value: unknown) {
    if (typeof value !== 'string' || value.length === 0) {
      return '';
    }
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private toNumber(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private readAppVersion(): string {
    try {
      const packageJsonPath = resolve(repoRoot, 'package.json');
      const raw = readFileSync(packageJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version?.trim() || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
