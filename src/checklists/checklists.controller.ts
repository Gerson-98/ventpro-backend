// RUTA: src/checklists/checklists.controller.ts

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
  Request,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChecklistsService } from './checklists.service';

@UseGuards(JwtAuthGuard)
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  // ─── Categorías (antes: enum fijo) — configurables desde Admin ───────────
  @SkipThrottle()
  @Get('categories')
  findAllCategories() {
    return this.checklistsService.findAllCategories();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('categories')
  createCategory(
    @Body()
    body: { slug: string; label: string; icon?: string; dynamic?: boolean; sort_order?: number },
  ) {
    return this.checklistsService.createCategory(body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { label?: string; icon?: string; sort_order?: number; active?: boolean },
  ) {
    return this.checklistsService.updateCategory(id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('categories/:id')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.checklistsService.removeCategory(id);
  }

  @SkipThrottle()
  @Get('templates')
  findAllTemplates() {
    return this.checklistsService.findAllTemplates();
  }

  @Post('templates')
  createTemplate(
    @Body() body: { categorySlug: string; label: string; sort_order?: number },
  ) {
    return this.checklistsService.createTemplate(body);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { label?: string; sort_order?: number; active?: boolean },
  ) {
    return this.checklistsService.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.checklistsService.removeTemplate(id);
  }

  @SkipThrottle()
  @Get('order/:orderId')
  findByOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.checklistsService.findByOrder(orderId);
  }

  @Post('order/:orderId/:type')
  complete(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('type') categorySlug: string,
    @Body()
    body: {
      items: { templateId: number; label: string; checked: boolean }[];
      notes?: string;
    },
    @Request() req,
  ) {
    return this.checklistsService.complete(orderId, categorySlug, body, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('order/:orderId/:type')
  remove(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('type') categorySlug: string,
  ) {
    return this.checklistsService.remove(orderId, categorySlug);
  }
}
