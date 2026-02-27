import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// ✅ IMPORTAR LOS DOS TIPOS
import {
  CostCalculatorService,
  WindowCostResult,
  QuotationCostResult,
} from './cost-calculator.service';

@UseGuards(JwtAuthGuard)
@Controller('cost-calculator')
export class CostCalculatorController {
  constructor(private readonly costCalculatorService: CostCalculatorService) {}

  // Calcular costo de UNA ventana
  @Post('window')
  calcularVentana(
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
  ): Promise<WindowCostResult> {
    // ✅ RETORNO EXPLÍCITO AÑADIDO
    return this.costCalculatorService.calcularCostoVentana(data);
  }

  // Calcular costo de una cotización completa
  @Post('quotation')
  calcularCotizacion(
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
  ): Promise<QuotationCostResult> {
    // ✅ RETORNO EXPLÍCITO AÑADIDO
    return this.costCalculatorService.calcularCostoCotizacion(data.windows);
  }
}
