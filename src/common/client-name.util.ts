// ── Nombres "genéricos" que un vendedor usa para no detenerse a pedirle el
// nombre real al cliente (ej. "A quien interese", "Cliente") — el mismo
// registro genérico termina reusándose en TODAS sus cotizaciones, así que
// la información del cliente real nunca queda guardada en ningún pedido.
// No es una lista exhaustiva (no se puede adivinar cada variante), pero
// cubre los casos reales observados — el resto los atrapa el chequeo de
// "muy corto / solo una palabra común".
export const GENERIC_CLIENT_NAMES = new Set([
  'A QUIEN INTERESE',
  'A QUIEN CORRESPONDA',
  'CLIENTE',
  'CLIENTE GENERICO',
  'CLIENTE GENERAL',
  'CONSUMIDOR FINAL',
  'VARIOS',
  'N/A',
  'NA',
  'SIN NOMBRE',
  'PENDIENTE',
  'PRUEBA',
  'TEST',
]);

export function normalizeClientName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita acentos
}

export function isGenericClientName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return true;
  const normalized = normalizeClientName(name);
  return GENERIC_CLIENT_NAMES.has(normalized) || normalized.length < 2;
}
