import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { LoggingService } from '../logging/logging.service';

export type BotState =
  | 'active'
  | 'paused_consecutive_loss'
  | 'paused_daily_limit'
  | 'paused_bear_market'
  | 'stopped_weekly_limit'
  | 'stopped_emergency'
  | 'stopped_btc_crash';

interface PauseTimer {
  until: number;
  reason: string;
}

export interface RiskSnapshot {
  state: BotState;
  pauseTimer: PauseTimer | null;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private state: BotState = 'active';
  private pauseTimer: PauseTimer | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly logging: LoggingService,
  ) {}

  // ─── Primary gate — called before every trade ─────────────────

  async canTrade(): Promise<{ allowed: boolean; reason?: string }> {
    this.checkPauseExpiry();

    if (this.state !== 'active') {
      return { allowed: false, reason: this.state };
    }

    // Daily loss limit
    const todayPnl = await this.logging.getTodayPnl();
    const dailyLimit = this.config.get<number>('risk.dailyLossLimit');
    if (todayPnl <= -dailyLimit) {
      await this.triggerCircuitBreaker('daily_loss_limit', `Daily PnL: $${todayPnl.toFixed(2)}`);
      return { allowed: false, reason: 'daily_loss_limit' };
    }

    // Weekly loss limit
    const weekPnl = await this.logging.getWeekPnl();
    const weeklyLimit = this.config.get<number>('risk.weeklyLossLimit');
    if (weekPnl <= -weeklyLimit) {
      await this.triggerWeeklyStop(`Weekly PnL: $${weekPnl.toFixed(2)}`);
      return { allowed: false, reason: 'weekly_loss_limit' };
    }

    // Consecutive losses
    const consecutive = await this.logging.getConsecutiveLosses();
    const pause2h = this.config.get<number>('risk.consecutiveLossPause2h');
    const pauseDay = this.config.get<number>('risk.consecutiveLossPauseDay');

    if (consecutive >= pauseDay) {
      this.pauseUntilTomorrow('5_consecutive_losses', 'paused_consecutive_loss');
      return { allowed: false, reason: 'consecutive_loss_pause_day' };
    }

    if (consecutive >= pause2h) {
      this.pauseFor(2 * 3600_000, '3_consecutive_losses', 'paused_consecutive_loss');
      return { allowed: false, reason: 'consecutive_loss_pause_2h' };
    }

    return { allowed: true };
  }

  // ─── Emergency capital check ───────────────────────────────────

  async checkCapital(currentCapital: number): Promise<boolean> {
    const floor = this.config.get<number>('risk.emergencyCapitalFloor');
    if (currentCapital < floor) {
      this.state = 'stopped_emergency';
      await this.logging.markCircuitBreaker(
        `Emergency stop: capital $${currentCapital.toFixed(2)} < floor $${floor}`,
      );
      this.logger.error(
        `EMERGENCY STOP — capital $${currentCapital.toFixed(2)} below floor $${floor}`,
      );
      return false;
    }
    return true;
  }

  // ─── Manual controls ───────────────────────────────────────────

  pause(reason: string, durationMs?: number): void {
    if (durationMs) {
      this.pauseFor(durationMs, reason, 'paused_bear_market');
    } else {
      this.state = 'paused_bear_market';
      this.logger.warn(`Bot paused — ${reason}`);
    }
  }

  resume(): void {
    if (this.state === 'stopped_emergency' || this.state === 'stopped_weekly_limit') {
      this.logger.warn('Cannot auto-resume from emergency/weekly stop — manual restart required');
      return;
    }
    this.state = 'active';
    this.pauseTimer = null;
    this.logger.log('Bot resumed');
  }

  getState(): BotState {
    this.checkPauseExpiry();
    return this.state;
  }

  getSnapshot(): RiskSnapshot {
    this.checkPauseExpiry();
    return {
      state: this.state,
      pauseTimer: this.pauseTimer,
    };
  }

  isHardStopped(): boolean {
    return this.state === 'stopped_emergency' || this.state === 'stopped_weekly_limit';
  }

  // ─── Internal ──────────────────────────────────────────────────

  private pauseFor(ms: number, reason: string, state: BotState): void {
    const until = Date.now() + ms;
    this.pauseTimer = { until, reason };
    this.state = state;
    this.logger.warn(`Bot paused for ${Math.round(ms / 60_000)} min — ${reason}`);
  }

  private pauseUntilTomorrow(reason: string, state: BotState): void {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const ms = tomorrow.getTime() - Date.now();
    this.pauseFor(ms, reason, state);
  }

  private checkPauseExpiry(): void {
    if (
      this.pauseTimer &&
      Date.now() >= this.pauseTimer.until &&
      (this.state === 'paused_consecutive_loss' ||
        this.state === 'paused_daily_limit' ||
        this.state === 'paused_bear_market')
    ) {
      this.state = 'active';
      this.pauseTimer = null;
      this.logger.log('Pause expired — bot resumed');
    }
  }

  private async triggerCircuitBreaker(code: string, detail: string): Promise<void> {
    this.pauseUntilTomorrow(code, 'paused_daily_limit');
    await this.logging.markCircuitBreaker(`${code}: ${detail}`);
    this.logger.error(`Circuit breaker: ${code} — ${detail}`);
  }

  private async triggerWeeklyStop(detail: string): Promise<void> {
    this.state = 'stopped_weekly_limit';
    await this.logging.markCircuitBreaker(`weekly_loss_limit: ${detail}`);
    this.logger.error(`WEEKLY STOP — ${detail} — manual review required`);
  }
}
