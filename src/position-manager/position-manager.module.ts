import { Module } from '@nestjs/common';
import { PositionManagerService } from './position-manager.service';
import { HyperliquidWsService } from './hyperliquid-ws.service';
import { ExecutionModule } from '../execution/execution.module';
import { LoggingModule } from '../logging/logging.module';
import { SignalModule } from '../signal/signal.module';

@Module({
  imports: [ExecutionModule, LoggingModule, SignalModule],
  providers: [PositionManagerService, HyperliquidWsService],
  exports: [PositionManagerService],
})
export class PositionManagerModule {}
