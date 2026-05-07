import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { RiskService } from '../risk/risk.service';
import { WalletSessionGuard } from '../auth/wallet-session.guard';

@Controller('api/bot')
@UseGuards(WalletSessionGuard)
export class BotController {
  constructor(
    private readonly bot: BotService,
    private readonly risk: RiskService,
  ) {}

  @Get('runtime')
  getRuntime() {
    return this.bot.getRuntimeStatus();
  }

  @Post('scan')
  async runScan() {
    return this.bot.runManualScan();
  }

  @Post('pause')
  pause(@Body() body: { reason?: string; durationMs?: number }) {
    this.risk.pause(body?.reason || 'manual_pause', body?.durationMs);
    return {
      ok: true,
      state: this.risk.getSnapshot(),
    };
  }

  @Post('resume')
  resume() {
    this.risk.resume();
    return {
      ok: true,
      state: this.risk.getSnapshot(),
    };
  }

  @Post('stop')
  stop() {
    this.risk.pause('manual_stop');
    return {
      ok: true,
      state: this.risk.getSnapshot(),
    };
  }

  @Post('start')
  start() {
    this.risk.resume();
    return {
      ok: true,
      state: this.risk.getSnapshot(),
    };
  }

  @Post('close-position')
  async closePosition(@Body() body: { token: string }) {
    return this.bot.closePosition(body.token);
  }

  @Post('close-all-positions')
  async closeAllPositions() {
    return this.bot.closeAllPositions();
  }
}
