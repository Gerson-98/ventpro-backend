// RUTA: src/reports/reports.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('order/:orderId/profiles')
  generateProfilesReport(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.generateProfilesReport(orderId);
  }

  @Get('quotation/:quotationId/profiles')
  generateQuotationProfilesReport(
    @Param('quotationId', ParseIntPipe) quotationId: number,
  ) {
    return this.reportsService.generateProfilesReportByQuotation(quotationId);
  }

  @Get('order/:orderId/optimize-cuts')
  generateCutOptimizationReport(
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.reportsService.generateCutOptimizationReport(orderId);
  }

  // ─── NUEVO: Optimización de corte de vidrio ─────────────────────────────────
  @Get('order/:orderId/glass-cuts')
  generateGlassCutReport(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.generateGlassCutReport(orderId);
  }

  // ─── NUEVO: Resumen financiero de un pedido específico ──────────────────
  @Get('order/:orderId/financial')
  getOrderFinancialSummary(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.reportsService.getOrderFinancialSummary(orderId);
  }

  // ─── NUEVO: Dashboard de ganancias con filtros opcionales ───────────────
  // GET /reports/dashboard/profits?fromDate=2025-01-01&toDate=2025-12-31&status=completado
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
