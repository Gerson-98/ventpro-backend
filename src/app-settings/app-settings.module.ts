// RUTA: src/app-settings/app-settings.module.ts

import { Module } from '@nestjs/common';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AppSettingsController],
  providers: [AppSettingsService, PrismaService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
