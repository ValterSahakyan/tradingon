import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggingService } from './logging.service';
import { TradeLog } from './entities/trade-log.entity';
import { DailyStats } from './entities/daily-stats.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TradeLog, DailyStats])],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
