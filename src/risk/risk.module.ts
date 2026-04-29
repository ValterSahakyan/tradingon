import { Module } from '@nestjs/common';
import { RiskService } from './risk.service';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [LoggingModule],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
