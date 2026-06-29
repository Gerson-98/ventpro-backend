// RUTA: src/window-categories/window-categories.controller.ts

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
import { WindowCategoriesService } from './window-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('window-categories')
export class WindowCategoriesController {
  constructor(private readonly windowCategoriesService: WindowCategoriesService) {}

  @SkipThrottle()
  @Get()
  findAll() {
    return this.windowCategoriesService.findAll();
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
    return this.windowCategoriesService.create(data);
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
    return this.windowCategoriesService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.windowCategoriesService.remove(id);
  }
}
