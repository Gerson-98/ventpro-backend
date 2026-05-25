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
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChecklistsService } from './checklists.service';
import { ChecklistType } from '@prisma/client';

// ─── Valores válidos del enum — validación en runtime ────────────────────────
const VALID_CHECKLIST_TYPES: ChecklistType[] = [
  'carga_camion',
  'verificacion_instalacion',
  'regreso',
];

function parseChecklistType(raw: string): ChecklistType {
  if (!VALID_CHECKLIST_TYPES.includes(raw as ChecklistType)) {
    throw new BadRequestException(
      `Tipo de checklist inválido: "${raw}". Valores válidos: ${VALID_CHECKLIST_TYPES.join(', ')}`,
    );
  }
  return raw as ChecklistType;
}

@UseGuards(JwtAuthGuard)
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @SkipThrottle()
  @Get('templates')
  findAllTemplates() {
    return this.checklistsService.findAllTemplates();
  }

  @Post('templates')
  createTemplate(
    @Body() body: { type: ChecklistType; label: string; sort_order?: number },
  ) {
    parseChecklistType(body.type as string);
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
    @Param('type') rawType: string,
    @Body()
    body: {
      items: { templateId: number; label: string; checked: boolean }[];
      notes?: string;
    },
    @Request() req,
  ) {
    const type = parseChecklistType(rawType);
    return this.checklistsService.complete(orderId, type, body, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('order/:orderId/:type')
  remove(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('type') rawType: string,
  ) {
    const type = parseChecklistType(rawType);
    return this.checklistsService.remove(orderId, type);
  }
}
