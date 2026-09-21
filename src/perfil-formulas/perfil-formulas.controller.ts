// RUTA: src/perfil-formulas/perfil-formulas.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PerfilFormulasService } from './perfil-formulas.service';
import { FormulaStep } from '../common/formula-engine.util';

interface FormulaInput {
  slot: string;
  origen: string;
  piezas: number;
  steps: FormulaStep[];
}

@UseGuards(JwtAuthGuard)
@Controller('perfil-formulas')
export class PerfilFormulasController {
  constructor(private readonly service: PerfilFormulasService) {}

  @Get()
  findByWindowType(@Query('windowTypeId', ParseIntPipe) windowTypeId: number) {
    return this.service.findByWindowType(windowTypeId);
  }

  // Vista previa en vivo del wizard — calcula con fórmulas AÚN NO guardadas.
  @Post('preview')
  preview(
    @Body()
    body: {
      formulas: FormulaInput[];
      width: number;
      height: number;
    },
  ) {
    if (!body?.formulas || !Array.isArray(body.formulas)) {
      throw new BadRequestException('Debe enviar la lista de fórmulas.');
    }
    if (!Number.isFinite(body.width) || !Number.isFinite(body.height)) {
      throw new BadRequestException('Ancho y alto de ejemplo son requeridos.');
    }
    const errors = this.service.validateFormulaSet(body.formulas);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    const result = this.service.resolveFromFormulas(
      body.formulas,
      body.width,
      body.height,
    );
    return { measurements: result };
  }

  @Post()
  save(
    @Body() body: { windowTypeId: number; formulas: FormulaInput[] },
  ) {
    if (!body?.windowTypeId) {
      throw new BadRequestException('windowTypeId es requerido.');
    }
    return this.service.saveFormulaSet(body.windowTypeId, body.formulas || []);
  }
}
