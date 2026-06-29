// RUTA: src/window-series/window-series.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WindowSeriesService } from './window-series.service';

@UseGuards(JwtAuthGuard)
@Controller('window-series')
export class WindowSeriesController {
  constructor(private readonly windowSeriesService: WindowSeriesService) {}

  @SkipThrottle()
  @Get()
  findAll() {
    return this.windowSeriesService.findAll();
  }

  @Post()
  create(
    @Body()
    data: {
      name: string;
      displayName?: string;
      sort_order?: number;
      active?: boolean;
    },
  ) {
    return this.windowSeriesService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      name?: string;
      displayName?: string | null;
      sort_order?: number;
      active?: boolean;
    },
  ) {
    return this.windowSeriesService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.windowSeriesService.remove(id);
  }

  // ─── Vínculos Serie ↔ Categoría ─────────────────────────────────────────

  @Post(':seriesId/categories/:categoryId')
  linkCategory(
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() body: { sort_order?: number },
  ) {
    return this.windowSeriesService.linkCategory(seriesId, categoryId, body?.sort_order ?? 0);
  }

  @Delete(':seriesId/categories/:categoryId')
  unlinkCategory(
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return this.windowSeriesService.unlinkCategory(seriesId, categoryId);
  }
}
