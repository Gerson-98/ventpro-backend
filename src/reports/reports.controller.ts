// RUTA: src/reports/reports.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @SkipThrottle()
  @Get('order/:orderId/profiles')
  generateProfilesReport(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.generateProfilesReport(orderId);
  }

  @SkipThrottle()
  @Get('quotation/:quotationId/profiles')
  generateQuotationProfilesReport(
    @Param('quotationId', ParseIntPipe) quotationId: number,
  ) {
    return this.reportsService.generateProfilesReportByQuotation(quotationId);
  }

  @SkipThrottle()
  @Get('order/:orderId/optimize-cuts')
  generateCutOptimizationReport(
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.reportsService.generateCutOptimizationReport(orderId);
  }

  // ─── NUEVO: Optimización de corte global para múltiples pedidos ──────────
  // Ejecuta el algoritmo FFD sobre todas las ventanas de los pedidos
  // seleccionados tratadas como un solo lote, minimizando desperdicio.
  // Retorna además la lista de ventanas con su proyecto para identificación.
  @Post('orders/optimize-cuts')
  generateMultiOrderCutOptimization(
    @Body() body: { orderIds: number[] },
  ) {
    if (!body?.orderIds || !Array.isArray(body.orderIds) || body.orderIds.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un orderId');
    }
    const ids = body.orderIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    if (ids.length === 0) {
      throw new BadRequestException('orderIds inválidos');
    }
    return this.reportsService.generateMultiOrderCutOptimization(ids);
  }

  // ─── NUEVO: Optimización de corte de vidrio ─────────────────────────────────
  @SkipThrottle()
  @Get('order/:orderId/glass-cuts')
  generateGlassCutReport(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.generateGlassCutReport(orderId);
  }

  // ─── NUEVO: Glass cut para cotizaciones ─────────────────────────────────────
  @SkipThrottle()
  @Get('quotation/:quotationId/glass-cuts')
  generateGlassCutByQuotation(
    @Param('quotationId', ParseIntPipe) quotationId: number,
  ) {
    return this.reportsService.generateGlassCutByQuotation(quotationId);
  }

  // ─── NUEVO: Resumen financiero de un pedido específico ──────────────────
  @SkipThrottle()
  @Get('order/:orderId/financial')
  getOrderFinancialSummary(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.getOrderFinancialSummary(orderId);
  }

  // ─── NUEVO: Dashboard de ganancias con filtros opcionales ───────────────
  // GET /reports/dashboard/profits?fromDate=2025-01-01&toDate=2025-12-31&status=completado
  @SkipThrottle()
  @Get('dashboard/profits')
  getDashboardProfits(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.reportsService.getDashboardProfits({
      fromDate,
      toDate,
      status,
      userId: userId ? Number(userId) : undefined,
    });
  }
}
