import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from './app-config.service';
import { AppSetting } from './entities/app-setting.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
