import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { MarketDataModule } from '../market-data/market-data.module';
import { SignalModule } from '../signal/signal.module';
import { PositionManagerModule } from '../position-manager/position-manager.module';
import { RiskModule } from '../risk/risk.module';
import { LoggingModule } from '../logging/logging.module';
import { ExecutionModule } from '../execution/execution.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MarketDataModule,
    SignalModule,
    PositionManagerModule,
    RiskModule,
    LoggingModule,
    ExecutionModule,
    DashboardModule,
    AuthModule,
  ],
  controllers: [BotController],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
