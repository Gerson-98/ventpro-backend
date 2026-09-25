// RUTA: src/product-wizard/product-wizard.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductWizardService } from './product-wizard.service';
import { CreateProductWizardDto } from './dto/create-product-wizard.dto';

@UseGuards(JwtAuthGuard)
@Controller('product-wizard')
export class ProductWizardController {
  constructor(private readonly service: ProductWizardService) {}

  @Post()
  create(@Body() dto: CreateProductWizardDto) {
    return this.service.createProduct(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateProductWizardDto) {
    return this.service.updateProduct(id, dto);
  }

  @Get(':id')
  getForEdit(@Param('id', ParseIntPipe) id: number) {
    return this.service.getProductForEdit(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number, @Body() body: { name: string }) {
    if (!body?.name?.trim()) {
      throw new BadRequestException('Debes indicar el nombre del producto duplicado.');
    }
    return this.service.duplicateProduct(id, body.name.trim());
  }

  @Patch(':id/active')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() body: { active: boolean }) {
    if (typeof body?.active !== 'boolean') {
      throw new BadRequestException('Falta indicar el nuevo estado (activo/inactivo).');
    }
    return this.service.setActive(id, body.active);
  }

  // Vista previa en vivo — calcula con el DTO completo aún sin guardar,
  // usando una medida de ejemplo (Paso 5/6 del wizard).
  @Post('preview')
  async preview(
    @Body() body: { dto: CreateProductWizardDto; width: number; height: number },
  ) {
    if (!body?.dto) throw new BadRequestException('Falta la configuración a previsualizar.');
    if (!Number.isFinite(body.width) || !Number.isFinite(body.height)) {
      throw new BadRequestException('Ancho y alto de ejemplo son requeridos.');
    }
    return this.service.previewMeasurements(body.dto, body.width, body.height);
  }
}
