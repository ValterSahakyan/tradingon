import { Module } from '@nestjs/common';
import { PositionManagerService } from './position-manager.service';
import { HyperliquidWsService } from './hyperliquid-ws.service';
import { ExecutionModule } from '../execution/execution.module';
import { LoggingModule } from '../logging/logging.module';
import { SignalModule } from '../signal/signal.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [ExecutionModule, LoggingModule, SignalModule, RiskModule],
  providers: [PositionManagerService, HyperliquidWsService],
  exports: [PositionManagerService, HyperliquidWsService],
})
export class PositionManagerModule {}
