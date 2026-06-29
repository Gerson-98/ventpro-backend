// RUTA: src/window-categories/window-categories.module.ts

import { Module } from '@nestjs/common';
import { WindowCategoriesService } from './window-categories.service';
import { WindowCategoriesController } from './window-categories.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WindowCategoriesController],
  providers: [WindowCategoriesService, PrismaService],
  exports: [WindowCategoriesService],
})
export class WindowCategoriesModule {}
