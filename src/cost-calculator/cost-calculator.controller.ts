// RUTA: src/cost-calculator/cost-calculator.controller.ts

import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CostCalculatorService,
  WindowCostResult,
  QuotationCostResult,
} from './cost-calculator.service';

// ── Tipo público (VENDEDOR): solo precio sugerido, sin costos internos ─────────
export interface WindowCostPublicResult {
  precio_sugerido_minimo: number;
}

export interface QuotationCostPublicResult {
  precio_sugerido_minimo: number;
}

// ── Helper: filtra el resultado según el rol ───────────────────────────────────
function sanitizarParaVendedor(
  result: WindowCostResult,
): WindowCostPublicResult {
  return {
    precio_sugerido_minimo: result.precio_sugerido_minimo,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('cost-calculator')
export class CostCalculatorController {
  constructor(private readonly costCalculatorService: CostCalculatorService) {}

  // ── Calcular costo de UNA ventana ──────────────────────────────────────────
  @Post('window')
  async calcularVentana(
    @Request() req,
    @Body()
    data: {
      window_type_id: number;
      width_cm: number;
      height_cm: number;
      color_id: number;
      glass_color_id?: number;
      options?: Record<string, string>;
      quantity?: number;
    },
  ): Promise<WindowCostResult | WindowCostPublicResult> {
    const resultado =
      await this.costCalculatorService.calcularCostoVentana(data);

    // Si el usuario es VENDEDOR → omitir costos internos
    if (req.user.role === 'VENDEDOR') {
      return sanitizarParaVendedor(resultado);
    }

    // Si es ADMIN → devolver todo
    return resultado;
  }

  // ── Calcular costo de una cotización completa ──────────────────────────────
  @Post('quotation')
  async calcularCotizacion(
    @Request() req,
    @Body()
    data: {
      windows: Array<{
        window_type_id: number;
        width_cm: number;
        height_cm: number;
        color_id: number;
        glass_color_id?: number;
        options?: Record<string, string>;
        quantity?: number;
      }>;
    },
  ): Promise<QuotationCostResult | QuotationCostPublicResult> {
    const resultado = await this.costCalculatorService.calcularCostoCotizacion(
      data.windows,
    );

    // Si el usuario es VENDEDOR → devolver solo precio sugerido total
    if (req.user.role === 'VENDEDOR') {
      return {
        precio_sugerido_minimo: resultado.precio_sugerido_minimo,
      };
    }

    // Si es ADMIN → devolver todo
    return resultado;
  }
}
