// RUTA: src/common/formula-engine.util.ts
//
// Motor de fórmulas del configurador paso a paso (calc_engine = "formula").
// Completamente independiente del sistema legado (WindowCalculation +
// reglas de texto) — no lo modifica, no lo reemplaza, no interactúa con él.
//
// Una "fórmula" es una cadena de operaciones aritméticas aplicadas en orden
// sobre una medida de origen (ancho o alto del marco). Ej: el usuario arma
// "restar 1" y luego "dividir 2" → 100 → 99 → 49.5.

export type FormulaOp = 'sumar' | 'restar' | 'multiplicar' | 'dividir';

export interface FormulaStep {
  op: FormulaOp;
  value: number;
}

export class FormulaEngineError extends Error {}

// Aplica los pasos en el orden dado sobre `base`. Lanza si algún paso está
// mal formado o si se intenta dividir entre cero (nunca falla en silencio).
export function evaluateFormula(base: number, steps: FormulaStep[]): number {
  if (!Number.isFinite(base)) {
    throw new FormulaEngineError('La medida de origen no es un número válido.');
  }
  let result = base;
  for (const [i, step] of (steps || []).entries()) {
    if (!step || typeof step.value !== 'number' || !Number.isFinite(step.value)) {
      throw new FormulaEngineError(`Operación #${i + 1} inválida: falta la cantidad.`);
    }
    switch (step.op) {
      case 'sumar':
        result += step.value;
        break;
      case 'restar':
        result -= step.value;
        break;
      case 'multiplicar':
        result *= step.value;
        break;
      case 'dividir':
        if (step.value === 0) {
          throw new FormulaEngineError(
            `Operación #${i + 1}: no se puede dividir entre cero.`,
          );
        }
        result /= step.value;
        break;
      default:
        throw new FormulaEngineError(
          `Operación #${i + 1} desconocida: "${step.op}".`,
        );
    }
  }
  return result;
}

// Valida una lista de pasos sin evaluarla (para el paso de "Validaciones"
// del wizard, antes de intentar calcular nada).
export function validateFormulaSteps(steps: FormulaStep[]): string[] {
  const errors: string[] = [];
  (steps || []).forEach((step, i) => {
    if (!step) {
      errors.push(`Operación #${i + 1} está vacía.`);
      return;
    }
    if (!['sumar', 'restar', 'multiplicar', 'dividir'].includes(step.op)) {
      errors.push(`Operación #${i + 1}: tipo de operación inválido.`);
    }
    if (typeof step.value !== 'number' || !Number.isFinite(step.value)) {
      errors.push(`Operación #${i + 1}: falta la cantidad.`);
    }
    if (step.op === 'dividir' && step.value === 0) {
      errors.push(`Operación #${i + 1}: no se puede dividir entre cero.`);
    }
  });
  return errors;
}
