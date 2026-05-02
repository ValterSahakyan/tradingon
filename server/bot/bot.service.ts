import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { MarketDataService } from '../market-data/market-data.service';
import { SignalService } from '../signal/signal.service';
import { PositionManagerService } from '../position-manager/position-manager.service';
import { RiskService } from '../risk/risk.service';
import { LoggingService } from '../logging/logging.service';
import { ExecutionService } from '../execution/execution.service';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private initialized = false;
  private isRunning = false;
  private lastScanAt: number | null = null;
  private lastScanResult:
    | {
        ok: boolean;
        message: string;
      }
    | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly marketData: MarketDataService,
    private readonly signal: SignalService,
    private readonly positions: PositionManagerService,
    private readonly risk: RiskService,
    private readonly logging: LoggingService,
    private readonly execution: ExecutionService,
    private readonly dashboard: DashboardService,
  ) {}

  onModuleInit() {
    void this.initializeBot();
  }

  @Interval(5_000)
  async runScheduledTick(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    const intervalMs = this.config.get<number>('scan.intervalSeconds') * 1000;
    const lastScanAt = this.lastScanAt ?? 0;
    if (Date.now() - lastScanAt < intervalMs) {
      return;
    }

    await this.runScanCycle('scheduled');
  }

  async runScanCycle(source: 'scheduled' | 'manual' = 'scheduled'): Promise<{ ok: boolean; message: string }> {
    if (this.isRunning) {
      if (source === 'manual') {
        this.logger.warn('Previous scan still running - skipping cycle');
      }
      return { ok: false, message: 'Scan already running' };
    }

    this.isRunning = true;
    try {
      await this.scanCycle();
      this.lastScanAt = Date.now();
      this.lastScanResult = {
        ok: true,
        message: source === 'scheduled' ? 'Scheduled scan completed' : 'Manual scan completed',
      };
    } catch (err) {
      this.lastScanAt = Date.now();
      this.lastScanResult = { ok: false, message: err.message };
      this.logger.error(
        `${source === 'scheduled' ? 'Scheduled' : 'Manual'} scan error: ${err.message}`,
        err.stack,
      );
    } finally {
      this.isRunning = false;
    }

    return this.lastScanResult ?? { ok: true, message: 'Scan completed' };
  }

  @Cron('0 0 * * *')
  async dailySummary(): Promise<void> {
    const summary = await this.logging.generateDailySummary();
    this.logger.log(summary);
  }

  async runManualScan(): Promise<{ ok: boolean; message: string }> {
    if (this.isRunning) {
      return { ok: false, message: 'Scan already running' };
    }

    return this.runScanCycle('manual');
  }

  async closePosition(token: string): Promise<{ ok: boolean; message: string }> {
    const closed = await this.positions.closePositionByToken(token, 'manual');
    return {
      ok: closed,
      message: closed ? `Closed ${token}` : `No open position found for ${token}`,
    };
  }

  async closeAllPositions(): Promise<{ ok: boolean; message: string }> {
    await this.positions.closeAllPositions('manual');
    return {
      ok: true,
      message: 'Close all requested',
    };
  }

  getRuntimeStatus() {
    return {
      isRunning: this.isRunning,
      lastScanAt: this.lastScanAt,
      lastScanResult: this.lastScanResult,
      scanIntervalSeconds: this.config.get<number>('scan.intervalSeconds'),
      liveTradingEnabled: this.config.get<boolean>('execution.enabled'),
      initialized: this.initialized,
      mode: this.config.get<boolean>('hyperliquid.testnet') ? 'testnet' : 'mainnet',
      signalDiagnostics: this.signal.getLastDiagnostics(),
    };
  }

  private async initializeBot(): Promise<void> {
    try {
      this.logger.log('Bot initializing...');
      await this.marketData.refreshTokenUniverse();
      await this.marketData.refreshAll();
      this.initialized = true;
      this.logger.log('Bot ready - waiting for first scan cycle');
    } catch (err) {
      this.logger.error(`Bot initialization failed: ${err.message}`, err.stack);
    }
  }

  private async scanCycle(): Promise<void> {
    await this.marketData.refreshAll();
    await this.positions.checkTimeStops();

    const liveTradingEnabled = this.config.get<boolean>('execution.enabled');
    const maxPositions = this.config.get<number>('capital.maxConcurrentPositions');
    const currentPositions = this.positions.getPositionCount();

    this.logger.log(
      `Scan cycle starting | live=${liveTradingEnabled} | positions=${currentPositions}/${maxPositions} | market=${this.marketData.getMarketCondition()}`,
    );

    const capital = await this.execution.getAccountValue();
    if (capital !== null) {
      this.dashboard.pushAccountValue(capital);
    }

    if (liveTradingEnabled) {
      if (capital === null) {
        throw new Error('Account value unavailable');
      }
      const safeCapital = await this.risk.checkCapital(capital);
      if (!safeCapital) {
        await this.positions.closeAllPositions('emergency');
        return;
      }
    }

    const { allowed, reason } = await this.risk.canTrade();
    if (!allowed) {
      this.logger.log(`Trading paused - ${reason} | state: ${this.risk.getState()}`);
      return;
    }

    const openTokens = this.positions.getOpenTokens();
    const availableSlots = maxPositions - this.positions.getPositionCount();

    if (availableSlots <= 0) {
      this.logger.debug('All position slots filled - skipping signal scan');
      return;
    }

    const signals = await this.signal.scanAll(openTokens);
    const diagnostics = this.signal.getLastDiagnostics();
    const rejectSummary = Object.entries(diagnostics.rejectReasons)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([key, count]) => `${key}:${count}`)
      .join(', ');

    this.logger.log(
      `Scan results | signals=${signals.length} | watched=${diagnostics.candidatesFound} | evaluated=${diagnostics.tokensEvaluated}/${diagnostics.tokensSeen} | rejects=${rejectSummary || 'none'}`,
    );

    if (signals.length > 0) {
      this.dashboard.pushSignals(signals);
    } else {
      this.logger.log('No tradable signals in current scan; dashboard history may still show older confirmed entries.');
    }

    const ranked = signals.sort((a, b) => b.score - a.score).slice(0, availableSlots);
    if (ranked.length > 0) {
      this.logger.log(
        `Ranked entry candidates: ${ranked.map((signal) => `${signal.token}:${signal.direction}:score${signal.score}`).join(', ')}`,
      );
    }

    for (const signal of ranked) {
      const { allowed: canOpen, reason: blockReason } = await this.risk.canTrade();
      if (!canOpen) {
        this.logger.log(`Risk gate blocked mid-scan - ${blockReason}`);
        break;
      }

      this.logger.log(
        `Attempting entry | token=${signal.token} | dir=${signal.direction} | score=${signal.score} | price=${signal.currentPrice} | notional=${signal.notional.toFixed(2)}`,
      );
      const opened = await this.positions.openTrade(signal);
      if (opened) {
        this.logger.log(`Trade opened: ${signal.token} ${signal.direction} score=${signal.score}`);
      } else {
        this.logger.warn(`Entry attempt did not open a position: ${signal.token} ${signal.direction} score=${signal.score}`);
      }
    }
  }
}
