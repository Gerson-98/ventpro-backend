// RUTA: src/perfil-formulas/perfil-formulas.service.ts
//
// Resuelve las medidas de corte de un tipo de ventana que usa el motor de
// fórmulas nuevo (calc_engine = "formula"). No toca ni depende del sistema
// legado (WindowCalculation) — son dos caminos completamente separados que
// conviven en la misma base de datos.

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateFormula,
  validateFormulaSteps,
  FormulaStep,
} from '../common/formula-engine.util';

export interface SlotMeasurement {
  ancho: number;
  alto: number;
  piezas: number;
}

const round2 = (n: number) => Number(n.toFixed(2));

@Injectable()
export class PerfilFormulasService {
  constructor(private prisma: PrismaService) {}

  // Trae todas las fórmulas configuradas para un tipo de ventana.
  async findByWindowType(windowTypeId: number) {
    return this.prisma.perfilFormula.findMany({
      where: { window_type_id: windowTypeId },
      orderBy: [{ slot: 'asc' }, { origen: 'asc' }],
    });
  }

  // Calcula ancho/alto/piezas de cada perfil (marco, hoja, tapajamba,
  // batiente, vidrio) a partir de las medidas exteriores del marco.
  // Si un slot no tiene fórmula configurada para una dimensión, esa
  // dimensión pasa tal cual (sin restar/dividir nada) — comportamiento
  // predecible por defecto, nunca lanza un valor inesperado.
  async resolveMeasurements(
    windowTypeId: number,
    widthCm: number,
    heightCm: number,
  ): Promise<Record<string, SlotMeasurement>> {
    const formulas = await this.findByWindowType(windowTypeId);
    return this.resolveFromFormulas(formulas, widthCm, heightCm);
  }

  // Misma resolución, pero recibiendo las fórmulas ya cargadas — útil para
  // la vista previa del wizard, donde las fórmulas aún no están guardadas en BD.
  resolveFromFormulas(
    formulas: { slot: string; origen: string; piezas: number; steps: any }[],
    widthCm: number,
    heightCm: number,
  ): Record<string, SlotMeasurement> {
    const bySlot = new Map<
      string,
      { anchoRow?: (typeof formulas)[number]; altoRow?: (typeof formulas)[number] }
    >();
    for (const f of formulas) {
      if (!bySlot.has(f.slot)) bySlot.set(f.slot, {});
      const entry = bySlot.get(f.slot)!;
      if (f.origen === 'ancho') entry.anchoRow = f;
      else if (f.origen === 'alto') entry.altoRow = f;
    }

    const result: Record<string, SlotMeasurement> = {};
    for (const [slot, { anchoRow, altoRow }] of bySlot.entries()) {
      const ancho = anchoRow
        ? evaluateFormula(widthCm, anchoRow.steps as FormulaStep[])
        : widthCm;
      const alto = altoRow
        ? evaluateFormula(heightCm, altoRow.steps as FormulaStep[])
        : heightCm;
      const piezas = anchoRow?.piezas ?? altoRow?.piezas ?? 2;
      result[slot] = { ancho: round2(ancho), alto: round2(alto), piezas };
    }
    return result;
  }

  // Valida un conjunto de fórmulas (paso "Validaciones" del wizard) antes de
  // guardarlas o de intentar calcular con ellas. No escribe nada en BD.
  validateFormulaSet(
    formulas: { slot: string; origen: string; piezas: number; steps: FormulaStep[] }[],
  ): string[] {
    const errors: string[] = [];
    formulas.forEach((f, i) => {
      if (!f.slot) errors.push(`Fórmula #${i + 1}: falta indicar a qué perfil pertenece.`);
      if (f.origen !== 'ancho' && f.origen !== 'alto') {
        errors.push(`Fórmula #${i + 1} (${f.slot}): la medida de origen debe ser "ancho" o "alto".`);
      }
      if (!f.piezas || f.piezas <= 0) {
        errors.push(`Fórmula #${i + 1} (${f.slot}): la cantidad de piezas debe ser mayor a 0.`);
      }
      const stepErrors = validateFormulaSteps(f.steps || []);
      stepErrors.forEach((e) => errors.push(`Fórmula #${i + 1} (${f.slot}): ${e}`));
    });
    return errors;
  }

  // Guarda (crea o reemplaza) el set completo de fórmulas de un tipo de
  // ventana. Reemplaza siempre todo el set para evitar fórmulas huérfanas
  // de una configuración anterior a medio editar.
  async saveFormulaSet(
    windowTypeId: number,
    formulas: { slot: string; origen: string; piezas: number; steps: FormulaStep[] }[],
  ) {
    const errors = this.validateFormulaSet(formulas);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.perfilFormula.deleteMany({ where: { window_type_id: windowTypeId } });
      if (formulas.length === 0) return [];
      await tx.perfilFormula.createMany({
        data: formulas.map((f) => ({
          window_type_id: windowTypeId,
          slot: f.slot,
          origen: f.origen,
          piezas: f.piezas,
          steps: f.steps as any,
        })),
      });
      return tx.perfilFormula.findMany({ where: { window_type_id: windowTypeId } });
    });
  }
}
