import { Body, Controller, Get, Post } from '@nestjs/common';
import { BotService } from './bot.service';
import { RiskService } from '../risk/risk.service';

@Controller('api/bot')
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
}
