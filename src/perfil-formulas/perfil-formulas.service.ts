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
  // Piezas independientes por dimensión — hay perfiles reales (ej. la
  // Tapajamba de casi toda ventana corrediza) que solo se cortan en un
  // sentido: "SUMAR ALTO Y *2" no genera NINGÚN corte de ancho. Con un solo
  // `piezas` simétrico eso era imposible de representar.
  piezasAncho: number;
  piezasAlto: number;
}

export interface FormulaRow {
  slot: string;
  origen: string;
  piezas: number;
  steps: FormulaStep[];
  // Variante condicional: si están definidos, esta fila SOLO se usa cuando
  // la cotización tiene options[option_group] === option_key. Sin ellos es
  // la fórmula por defecto — debe existir exactamente una por (slot, origen).
  // Equivalente, para el motor nuevo, a WindowCalculation.calculationOverrides
  // del sistema legado (ej. "cantidad_hojas=2 divide distinto que =1").
  option_group?: string | null;
  option_key?: string | null;
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
  // batiente, vidrio) a partir de las medidas exteriores del marco y las
  // opciones elegidas en la cotización (para resolver variantes condicionales).
  async resolveMeasurements(
    windowTypeId: number,
    widthCm: number,
    heightCm: number,
    options: Record<string, string> = {},
  ): Promise<Record<string, SlotMeasurement>> {
    const formulas = await this.findByWindowType(windowTypeId);
    return this.resolveFromFormulas(formulas as any, widthCm, heightCm, options);
  }

  // Elige, entre la fórmula por defecto y sus variantes condicionales para
  // un mismo (slot, origen), la que corresponda según las opciones elegidas.
  // Si ninguna condicional matchea, cae en la fila por defecto (sin condición).
  private pickRow(rows: FormulaRow[], options: Record<string, string>): FormulaRow | undefined {
    const conditional = rows.find(
      (r) => r.option_group && r.option_key && options[r.option_group] === r.option_key,
    );
    if (conditional) return conditional;
    return rows.find((r) => !r.option_group);
  }

  // Misma resolución, pero recibiendo las fórmulas ya cargadas — útil para
  // la vista previa del wizard, donde las fórmulas aún no están guardadas en BD.
  resolveFromFormulas(
    formulas: FormulaRow[],
    widthCm: number,
    heightCm: number,
    options: Record<string, string> = {},
  ): Record<string, SlotMeasurement> {
    const bySlot = new Map<string, { anchoRows: FormulaRow[]; altoRows: FormulaRow[] }>();
    for (const f of formulas) {
      if (!bySlot.has(f.slot)) bySlot.set(f.slot, { anchoRows: [], altoRows: [] });
      const entry = bySlot.get(f.slot)!;
      if (f.origen === 'ancho') entry.anchoRows.push(f);
      else if (f.origen === 'alto') entry.altoRows.push(f);
    }

    const result: Record<string, SlotMeasurement> = {};
    for (const [slot, { anchoRows, altoRows }] of bySlot.entries()) {
      const anchoRow = this.pickRow(anchoRows, options);
      const altoRow = this.pickRow(altoRows, options);
      const ancho = anchoRow ? evaluateFormula(widthCm, anchoRow.steps as FormulaStep[]) : widthCm;
      const alto = altoRow ? evaluateFormula(heightCm, altoRow.steps as FormulaStep[]) : heightCm;
      const piezasAncho = anchoRow?.piezas ?? 0;
      const piezasAlto = altoRow?.piezas ?? 0;
      result[slot] = { ancho: round2(ancho), alto: round2(alto), piezasAncho, piezasAlto };
    }
    return result;
  }

  // Valida un conjunto de fórmulas (paso "Validaciones" del wizard) antes de
  // guardarlas o de intentar calcular con ellas. No escribe nada en BD.
  validateFormulaSet(formulas: FormulaRow[], exampleWidth = 100, exampleHeight = 100): string[] {
    const errors: string[] = [];
    formulas.forEach((f, i) => {
      if (!f.slot) errors.push(`Fórmula #${i + 1}: falta indicar a qué perfil pertenece.`);
      if (f.origen !== 'ancho' && f.origen !== 'alto') {
        errors.push(`Fórmula #${i + 1} (${f.slot}): la medida de origen debe ser "ancho" o "alto".`);
      }
      // 0 piezas es válido: significa que este perfil no se corta en este
      // sentido (ej. Tapajamba "SUMAR ALTO Y *2" no tiene corte de ancho).
      if (f.piezas == null || f.piezas < 0 || !Number.isInteger(f.piezas)) {
        errors.push(`Fórmula #${i + 1} (${f.slot}): la cantidad de piezas debe ser un número entero (0 o más).`);
      }
      if (!!f.option_group !== !!f.option_key) {
        errors.push(`Fórmula #${i + 1} (${f.slot}): una variante condicional necesita el grupo y el valor de opción, los dos juntos.`);
      }
      const stepErrors = validateFormulaSteps(f.steps || []);
      stepErrors.forEach((e) => errors.push(`Fórmula #${i + 1} (${f.slot}): ${e}`));

      // Sanity check con una medida de ejemplo: si con una medida típica el
      // resultado ya da cero o negativo, la fórmula está mal armada (ej. restar
      // más de lo que mide la pieza) — mejor avisar ahora que dejar que el
      // taller reciba una orden de corte con una medida imposible. Solo
      // aplica si este lado realmente produce cortes (piezas > 0).
      if (stepErrors.length === 0 && f.piezas > 0 && (f.origen === 'ancho' || f.origen === 'alto')) {
        const base = f.origen === 'ancho' ? exampleWidth : exampleHeight;
        try {
          const result = evaluateFormula(base, f.steps || []);
          if (result <= 0) {
            errors.push(
              `Fórmula #${i + 1} (${f.slot}): con una medida de ejemplo de ${base} cm da como resultado ${result.toFixed(2)} cm — revisa las operaciones, una pieza no puede medir cero o menos.`,
            );
          }
        } catch {
          // El error de evaluación (ej. división entre cero) ya lo reportó validateFormulaSteps arriba.
        }
      }
    });

    // Por cada (slot, origen) debe haber EXACTAMENTE una fila por defecto
    // (sin condición), y ninguna condición repetida entre variantes.
    const bySlotOrigen = new Map<string, FormulaRow[]>();
    for (const f of formulas) {
      const key = `${f.slot}|${f.origen}`;
      if (!bySlotOrigen.has(key)) bySlotOrigen.set(key, []);
      bySlotOrigen.get(key)!.push(f);
    }
    for (const [key, rows] of bySlotOrigen.entries()) {
      const defaults = rows.filter((r) => !r.option_group);
      if (defaults.length > 1) {
        errors.push(`"${key.replace('|', ' / ')}": hay más de una fórmula por defecto — solo puede haber una.`);
      }
      const seenConditions = new Set<string>();
      for (const r of rows) {
        if (!r.option_group) continue;
        const condKey = `${r.option_group}=${r.option_key}`;
        if (seenConditions.has(condKey)) {
          errors.push(`"${key.replace('|', ' / ')}": la variante "${condKey}" está duplicada.`);
        }
        seenConditions.add(condKey);
      }
    }

    return errors;
  }

  // Guarda (crea o reemplaza) el set completo de fórmulas de un tipo de
  // ventana. Reemplaza siempre todo el set para evitar fórmulas huérfanas
  // de una configuración anterior a medio editar.
  async saveFormulaSet(windowTypeId: number, formulas: FormulaRow[]) {
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
          option_group: f.option_group || null,
          option_key: f.option_key || null,
        })),
      });
      return tx.perfilFormula.findMany({ where: { window_type_id: windowTypeId } });
    });
  }
}
