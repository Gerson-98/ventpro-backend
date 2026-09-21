// RUTA: src/common/override-rules.util.ts
//
// Normaliza el JSON `calculationOverrides` (guardado en WindowCalculation) a
// una lista de reglas, cada una con VARIAS opciones (`keys`) que disparan el
// mismo descuento. Antes cada excepción solo podía tener una opción — para
// cubrir "2 chapas" (5 variantes de manija distintas) había que crear 5 filas
// idénticas. Ahora una sola regla puede listar las 5 opciones juntas.
//
// Soporta AMBOS formatos sin migración de datos:
//   · Legado:  { "tres_iguales": { hojaMargen: 5, ... } }        — 1 opción = 1 regla
//   · Nuevo:   [ { keys: ["a","b"], hojaMargen: 5, ... } ]        — N opciones = 1 regla
// Los tipos de ventana ya configurados con el formato legado siguen
// funcionando exactamente igual; solo al volver a guardarse pasan al nuevo.

export interface OverrideRule {
  keys: string[];
  hojaDivision?: string;
  hojaMargen?: number;
  hojaDescuento?: number;
  vidrioDescuento?: number;
}

export function normalizeOverrideRules(raw: unknown): OverrideRule[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .filter(
        (r): r is OverrideRule =>
          !!r &&
          typeof r === 'object' &&
          Array.isArray((r as any).keys) &&
          (r as any).keys.length > 0,
      )
      .map((r) => ({ ...r }));
  }

  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, any>)
      .filter(([, val]) => val && typeof val === 'object')
      .map(([key, val]) => ({ keys: [key], ...val }));
  }

  return [];
}

// Primera regla cuyo arreglo `keys` contiene el valor de opción dado.
export function findOverrideRule(
  rules: OverrideRule[],
  optionValue: string,
): OverrideRule | undefined {
  return rules.find((r) => r.keys.includes(optionValue));
}
