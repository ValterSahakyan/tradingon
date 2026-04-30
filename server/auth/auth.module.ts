import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletSessionGuard } from './wallet-session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, WalletSessionGuard],
  exports: [AuthService, WalletSessionGuard],
})
export class AuthModule {}
