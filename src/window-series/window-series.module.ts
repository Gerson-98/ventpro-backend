// RUTA: src/window-series/window-series.module.ts

import { Module } from '@nestjs/common';
import { WindowSeriesService } from './window-series.service';
import { WindowSeriesController } from './window-series.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WindowSeriesController],
  providers: [WindowSeriesService, PrismaService],
  exports: [WindowSeriesService],
})
export class WindowSeriesModule {}
