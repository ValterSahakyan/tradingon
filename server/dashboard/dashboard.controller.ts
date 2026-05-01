import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { WalletSessionGuard } from '../auth/wallet-session.guard';

@Controller('api/dashboard')
@UseGuards(WalletSessionGuard)
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);
  constructor(private readonly dashboard: DashboardService) {}

  @Get('status')
  getStatus() {
    return this.dashboard.getStatus();
  }

  @Get('positions')
  getPositions() {
    return this.dashboard.getPositions();
  }

  @Get('signals')
  getSignals() {
    return this.dashboard.getRecentSignals();
  }

  @Get('stats')
  async getStats() {
    return this.dashboard.getDailyStats();
  }

  @Get('trades')
  async getTrades() {
    return this.dashboard.getRecentTrades();
  }

  @Get('pnl-chart')
  async getPnlChart() {
    return this.dashboard.getPnlChartData();
  }

  @Get('config')
  async getConfig() {
    return this.dashboard.getConfig();
  }

  @Post('config')
  async updateConfig(@Body() body: { values?: Record<string, unknown> }) {
    return this.dashboard.updateConfig(body?.values ?? {});
  }

  @Get('balance')
  async getBalance() {
    this.logger.log('GET /api/dashboard/balance called');
    try {
      const result = await this.dashboard.getBalance();
      this.logger.log(`GET /api/dashboard/balance returning: ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      this.logger.error(`GET /api/dashboard/balance threw: ${err.message}`);
      throw err;
    }
  }

  @Get('all')
  async getAll() {
    return this.dashboard.getAll();
  }
}
