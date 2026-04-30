import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { MarketDataModule } from '../market-data/market-data.module';
import { VolumeSpikePattern } from './patterns/volume-spike.pattern';
import { BullBearFlagPattern } from './patterns/bull-bear-flag.pattern';
import { FibonacciPattern } from './patterns/fibonacci.pattern';
import { AccumulationBreakoutPattern } from './patterns/accumulation-breakout.pattern';

@Module({
  imports: [MarketDataModule],
  providers: [
    SignalService,
    VolumeSpikePattern,
    BullBearFlagPattern,
    FibonacciPattern,
    AccumulationBreakoutPattern,
  ],
  exports: [SignalService],
})
export class SignalModule {}
