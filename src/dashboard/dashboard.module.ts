import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MarketDataModule } from '../market-data/market-data.module';
import { PositionManagerModule } from '../position-manager/position-manager.module';
import { RiskModule } from '../risk/risk.module';
import { LoggingModule } from '../logging/logging.module';
import { TradeLog } from '../logging/entities/trade-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeLog]),
    MarketDataModule,
    PositionManagerModule,
    RiskModule,
    LoggingModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
