import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { WalletSessionGuard } from '../auth/wallet-session.guard';

@Controller('api/dashboard')
@UseGuards(WalletSessionGuard)
export class DashboardController {
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
    return this.dashboard.getBalance();
  }

  @Get('all')
  async getAll() {
    return this.dashboard.getAll();
  }
}
