import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { HyperliquidClient } from './hyperliquid.client';

@Module({
  providers: [ExecutionService, HyperliquidClient],
  exports: [ExecutionService, HyperliquidClient],
})
export class ExecutionModule {}
