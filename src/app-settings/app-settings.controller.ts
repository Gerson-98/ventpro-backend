// RUTA: src/app-settings/app-settings.controller.ts

import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AppSettingsService, SETTINGS_KEYS } from './app-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('app-settings')
export class AppSettingsController {
  constructor(private readonly service: AppSettingsService) {}

  // ── GET /app-settings/profit-margin ──────────────────────────────────────
  // Público para usuarios autenticados — vendedor solo lee, no puede cambiar.
  @Get('profit-margin')
  @UseGuards(JwtAuthGuard)
  async getProfitMargin() {
    const margin = await this.service.getProfitMargin();
    return { profit_margin: margin };
  }

  // ── PATCH /app-settings/profit-margin ────────────────────────────────────
  // Solo ADMIN puede cambiar el margen.
  @Patch('profit-margin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async setProfitMargin(@Body() body: { profit_margin: number }) {
    const margin = Number(body.profit_margin);
    if (!Number.isFinite(margin) || margin <= 0 || margin >= 100) {
      throw new Error('El margen debe ser un número entre 1 y 99.');
    }
    await this.service.set(SETTINGS_KEYS.PROFIT_MARGIN, String(margin));
    return { profit_margin: margin };
  }

  // ── GET /app-settings (todas las configs) ─────────────────────────────────
  // Solo ADMIN puede ver todas las configuraciones.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAll() {
    return this.service.getAll();
  }
}
