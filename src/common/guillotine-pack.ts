// ── Optimizador 2D de corte de vidrio (columnas/shelf guillotina + meta-solver) ─
//
// El vidrio se corta SIEMPRE con cortes guillotina (de borde a borde): no se
// puede hacer un corte en "L". Por eso la versión anterior basada en MaxRects,
// aunque minimizaba área, generaba layouts:
//   1) físicamente NO cortables (piezas encajadas en escalón),
//   2) visualmente desordenados (cada pieza rotada a su antojo).
//
// Esta versión empaca por COLUMNAS (franjas verticales) o por FILAS (franjas
// horizontales): agrupa piezas de ancho similar en una misma columna y las
// apila. El resultado es una cuadrícula ordenada, 100% cortable con guillotina,
// y con poco desperdicio. Un meta-solver prueba varias combinaciones de
// (orden × eje × rotación) y se queda con la mejor (menos planchas; desempate:
// menor área desperdiciada).
//
// Complejidad: ~50 piezas × ~40 combinaciones × O(n·columnas) ≈ pocos ms.

interface InputPiece {
  width: number;
  height: number;
  label: string;
}
interface PlacedPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}
interface WasteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedSheet {
  pieces: PlacedPiece[];
  wasteRects: WasteRect[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const EPS = 0.5;
// Dos piezas se consideran de "mismo ancho" (apilables en la misma columna sin
// generar desperdicio horizontal apreciable) si difieren ≤ WIDTH_TOL cm.
const WIDTH_TOL = 2.0;

type Axis = 'col' | 'row';

// ── Estructuras internas del empaque por columnas ─────────────────────────────
interface Column {
  x: number; // posición horizontal de la franja
  width: number; // ancho de la franja (lo fija la 1ª pieza, la más ancha)
  usedH: number; // altura ya consumida apilando desde arriba
}
interface WorkSheet {
  columns: Column[];
  placed: PlacedPiece[];
}

function placeInCol(
  sheet: WorkSheet,
  col: Column,
  w: number,
  h: number,
  label: string,
): void {
  sheet.placed.push({
    x: round1(col.x),
    y: round1(col.usedH),
    width: round1(w),
    height: round1(h),
    label,
  });
  col.usedH += h;
}

function colFits(col: Column, w: number, h: number, H: number): boolean {
  return w <= col.width + EPS && col.usedH + h <= H + EPS;
}

// Coloca UNA pieza respetando el orden de planchas (llena la más temprana antes
// de abrir una nueva → minimiza # de planchas). Dentro de una plancha:
//   1) columna existente del mismo ancho (apila, máxima prolijidad),
//   2) columna nueva (franja propia, ancho exacto, sin desperdicio horizontal),
//   3) cualquier columna existente donde quepa (último recurso),
//   4) plancha nueva.
function placePiece(
  sheets: WorkSheet[],
  pw: number,
  ph: number,
  label: string,
  W: number,
  H: number,
  allowRotate: boolean,
): void {
  const orients: Array<[number, number]> = allowRotate
    ? [
        [pw, ph],
        [ph, pw],
      ]
    : [[pw, ph]];

  for (const sheet of sheets) {
    const totalW = sheet.columns.reduce((a, c) => a + c.width, 0);

    let bestTight: { col: Column; w: number; h: number; score: number } | null =
      null;
    let bestAny: { col: Column; w: number; h: number; score: number } | null =
      null;
    let newCol: { w: number; h: number; x: number } | null = null;

    for (const [w, h] of orients) {
      if (w > W + EPS || h > H + EPS) continue;
      for (const col of sheet.columns) {
        if (!colFits(col, w, h, H)) continue;
        const ww = col.width - w; // desperdicio horizontal
        const lh = H - col.usedH - h; // hueco vertical restante
        const score = ww * 1000 + lh; // prioriza ajuste de ancho, luego de alto
        if (!bestAny || score < bestAny.score) bestAny = { col, w, h, score };
        if (ww <= WIDTH_TOL && (!bestTight || score < bestTight.score)) {
          bestTight = { col, w, h, score };
        }
      }
      // Opción de columna nueva en esta plancha (preferir la orientación de
      // menor ancho → consume menos espacio horizontal).
      if (totalW + w <= W + EPS && h <= H + EPS) {
        if (!newCol || w < newCol.w) newCol = { w, h, x: totalW };
      }
    }

    if (bestTight) {
      placeInCol(sheet, bestTight.col, bestTight.w, bestTight.h, label);
      return;
    }
    if (newCol) {
      const col: Column = { x: newCol.x, width: newCol.w, usedH: 0 };
      sheet.columns.push(col);
      placeInCol(sheet, col, newCol.w, newCol.h, label);
      return;
    }
    if (bestAny) {
      placeInCol(sheet, bestAny.col, bestAny.w, bestAny.h, label);
      return;
    }
    // Esta plancha no admite la pieza → probar la siguiente.
  }

  // Ninguna plancha existente la admite → abrir plancha nueva.
  const sheet: WorkSheet = { columns: [], placed: [] };
  let chosen: [number, number] | null = null;
  for (const [w, h] of orients) {
    if (w <= W + EPS && h <= H + EPS) {
      chosen = [w, h];
      break;
    }
  }
  if (!chosen) {
    // Pieza más grande que la plancha en ambas orientaciones: colocarla sola
    // para no perderla (caso excepcional, p.ej. medidas mal cargadas).
    sheet.placed.push({
      x: 0,
      y: 0,
      width: round1(pw),
      height: round1(ph),
      label,
    });
    sheet.columns.push({ x: 0, width: pw, usedH: ph });
    sheets.push(sheet);
    return;
  }
  const col: Column = { x: 0, width: chosen[0], usedH: 0 };
  sheet.columns.push(col);
  placeInCol(sheet, col, chosen[0], chosen[1], label);
  sheets.push(sheet);
}

// Calcula los rectángulos de desperdicio que teselan exactamente la plancha:
//   · hueco al pie de cada columna,
//   · sliver horizontal a la derecha de cada pieza (ancho columna − ancho pieza),
//   · margen derecho no usado por ninguna columna.
function buildWaste(sheet: WorkSheet, W: number, H: number): WasteRect[] {
  const rects: WasteRect[] = [];
  const totalW = sheet.columns.reduce((a, c) => a + c.width, 0);

  for (const col of sheet.columns) {
    if (H - col.usedH > EPS) {
      rects.push({ x: col.x, y: col.usedH, width: col.width, height: H - col.usedH });
    }
  }
  for (const p of sheet.placed) {
    const col = sheet.columns.find((c) => Math.abs(c.x - p.x) < EPS);
    if (col && col.width - p.width > EPS) {
      rects.push({
        x: p.x + p.width,
        y: p.y,
        width: col.width - p.width,
        height: p.height,
      });
    }
  }
  if (W - totalW > EPS) {
    rects.push({ x: totalW, y: 0, width: W - totalW, height: H });
  }

  return rects
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => ({
      x: round1(r.x),
      y: round1(r.y),
      width: round1(r.width),
      height: round1(r.height),
    }));
}

// Transpone una plancha (intercambia ejes X↔Y, ancho↔alto). Se usa para el
// empaque por FILAS: se resuelve como columnas en el espacio transpuesto y se
// devuelve al espacio original.
function transpose(sheet: PackedSheet): PackedSheet {
  return {
    pieces: sheet.pieces.map((p) => ({
      x: p.y,
      y: p.x,
      width: p.height,
      height: p.width,
      label: p.label,
    })),
    wasteRects: sheet.wasteRects.map((w) => ({
      x: w.y,
      y: w.x,
      width: w.height,
      height: w.width,
    })),
  };
}

// Empaque por columnas para un orden de piezas ya dado.
function packColumns(
  pieces: InputPiece[],
  W: number,
  H: number,
  allowRotate: boolean,
): PackedSheet[] {
  const sheets: WorkSheet[] = [];
  for (const piece of pieces) {
    placePiece(sheets, piece.width, piece.height, piece.label, W, H, allowRotate);
  }
  return sheets.map((s) => ({
    pieces: s.placed,
    wasteRects: buildWaste(s, W, H),
  }));
}

// Empaque según eje: 'col' = franjas verticales, 'row' = franjas horizontales.
function packAxis(
  pieces: InputPiece[],
  W: number,
  H: number,
  axis: Axis,
  allowRotate: boolean,
): PackedSheet[] {
  if (axis === 'col') return packColumns(pieces, W, H, allowRotate);
  // FILAS: resolver transpuesto y volver.
  const swapped = pieces.map((p) => ({
    width: p.height,
    height: p.width,
    label: p.label,
  }));
  return packColumns(swapped, H, W, allowRotate).map(transpose);
}

function solutionScore(
  sheets: PackedSheet[],
  W: number,
  H: number,
): number {
  // Menor es mejor: penaliza # planchas primero, luego desperdicio total.
  const used = sheets.reduce(
    (sum, s) => sum + s.pieces.reduce((a, p) => a + p.width * p.height, 0),
    0,
  );
  const waste = sheets.length * W * H - used;
  return sheets.length * 1e9 + waste;
}

export function guillotinePack(
  pieces: InputPiece[],
  sheetW: number,
  sheetH: number,
): PackedSheet[] {
  if (pieces.length === 0) return [];

  const orderings: Array<{
    name: string;
    cmp: (a: InputPiece, b: InputPiece) => number;
  }> = [
    // width-desc agrupa columnas de mismo ancho (clave para layouts prolijos).
    { name: 'width-desc', cmp: (a, b) => b.width - a.width },
    { name: 'height-desc', cmp: (a, b) => b.height - a.height },
    { name: 'area-desc', cmp: (a, b) => b.width * b.height - a.width * a.height },
    {
      name: 'longSide-desc',
      cmp: (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height),
    },
    {
      name: 'maxDim-then-width',
      cmp: (a, b) =>
        Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
        b.width - a.width,
    },
  ];
  const axes: Axis[] = ['col', 'row'];
  const rotateOpts = [true, false];

  let best: PackedSheet[] | null = null;
  let bestScore = Infinity;

  for (const ord of orderings) {
    const sorted = [...pieces].sort(ord.cmp);
    for (const axis of axes) {
      for (const rot of rotateOpts) {
        const sheets = packAxis(sorted, sheetW, sheetH, axis, rot);
        const score = solutionScore(sheets, sheetW, sheetH);
        if (score < bestScore) {
          bestScore = score;
          best = sheets;
        }
      }
    }
  }

  return (best ?? []).filter((s) => s.pieces.length > 0);
}

// Versión simplificada que solo retorna el número de planchas necesarias.
export function guillotinePackCount(
  pieces: { width: number; height: number }[],
  sheetW: number,
  sheetH: number,
): number {
  return guillotinePack(
    pieces.map((p, i) => ({ ...p, label: String(i) })),
    sheetW,
    sheetH,
  ).length;
}

// ═════════════════════════════════════════════════════════════════════════════
// Optimizador "a fondo" para el REPORTE de corte de vidrio
// ═════════════════════════════════════════════════════════════════════════════
//
// El empaque por columnas de arriba es rápido y prolijo, pero NO siempre aprovecha
// bien las planchas: puede dejar piezas sueltas en una plancha que casi no se usa
// mientras las otras tienen huecos (ej.: dos vidrios de 21×80 cm en una 3ª plancha
// que habrían cabido en las anteriores). Este optimizador busca más a fondo:
//
//   1) Mismo número de planchas que el mínimo que se logre (nunca más que el
//      empaque por columnas — de hecho lo incluye como candidato).
//   2) A igual número de planchas, CONCENTRA el desperdicio: llena a tope las
//      primeras planchas y deja la última lo más vacía posible, de modo que quede
//      un retazo grande y reutilizable (en vez de huecos pequeños repartidos).
//
// Empaca con "rectángulos libres guillotina": cada pieza se pone en la esquina de un
// hueco libre y el hueco restante se parte con un corte de borde a borde, así que
// TODO resultado es cortable con guillotina (corte recto de lado a lado). Se prueban
// muchas combinaciones de orden, regla de ajuste, regla de partición y rotación, con
// un generador pseudoaleatorio de semilla fija (mismo pedido → mismo resultado).
//
// NO se usa para el costo (guillotinePackCount sigue siendo el rápido): este es solo
// para el reporte de corte, donde se calcula una vez por consulta.

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface FRSheet {
  free: FreeRect[];
  placed: PlacedPiece[];
  used: number;
}

type FitRule = 'baf' | 'bssf' | 'blsf';
type SplitRule = 'sas' | 'las' | 'maxas' | 'minas' | 'horiz' | 'vert';
type SheetPolicy = 'first' | 'best';

interface FROptions {
  rule: FitRule;
  split: SplitRule;
  policy: SheetPolicy;
  rotate: boolean;
}

// Tolerancia ESTRICTA para el optimizador a fondo: solo ruido de redondeo. (El empaque
// por columnas acepta hasta EPS=0.5 cm de más; aquí una pieza solo entra si cabe de verdad.)
const FIT_EPS = 0.05;

const FIT_RULES: FitRule[] = ['baf', 'bssf', 'blsf'];
const SPLIT_RULES: SplitRule[] = ['sas', 'las', 'maxas', 'minas', 'horiz', 'vert'];

function fitScore(rule: FitRule, f: FreeRect, w: number, h: number): number {
  const dw = f.w - w;
  const dh = f.h - h;
  switch (rule) {
    case 'baf':
      return (f.w * f.h - w * h) * 1000 + Math.min(dw, dh);
    case 'bssf':
      return Math.min(dw, dh) * 1000 + Math.max(dw, dh);
    case 'blsf':
      return Math.max(dw, dh) * 1000 + Math.min(dw, dh);
  }
}

// Parte el hueco `f` tras colocar una pieza w×h en su esquina superior-izquierda.
function splitFree(f: FreeRect, w: number, h: number, rule: SplitRule): FreeRect[] {
  const rw = f.w - w;
  const rh = f.h - h;
  // Opción A (corte horizontal primero): abajo = ancho completo; derecha = solo la
  // altura de la pieza.
  const A = (): FreeRect[] => [
    { x: f.x, y: f.y + h, w: f.w, h: rh },
    { x: f.x + w, y: f.y, w: rw, h },
  ];
  // Opción B (corte vertical primero): derecha = alto completo; abajo = solo el
  // ancho de la pieza.
  const B = (): FreeRect[] => [
    { x: f.x + w, y: f.y, w: rw, h: f.h },
    { x: f.x, y: f.y + h, w, h: rh },
  ];
  let useA: boolean;
  switch (rule) {
    case 'sas': // eje más corto sobrante → partir por ahí
      useA = rw < rh;
      break;
    case 'las':
      useA = !(rw < rh);
      break;
    case 'maxas': {
      // maximizar el área del hueco mayor
      const aMax = Math.max(f.w * rh, rw * h);
      const bMax = Math.max(rw * f.h, w * rh);
      useA = aMax >= bMax;
      break;
    }
    case 'minas': {
      const aMax = Math.max(f.w * rh, rw * h);
      const bMax = Math.max(rw * f.h, w * rh);
      useA = aMax < bMax;
      break;
    }
    case 'horiz':
      useA = true;
      break;
    default:
      useA = false;
  }
  return (useA ? A() : B()).filter((r) => r.w > EPS && r.h > EPS);
}

// Empaca `order` (ya ordenadas) en planchas W×H. Devuelve null si alguna pieza no
// cabe en la plancha ni rotada (el llamador cae al empaque clásico).
function frPack(
  order: InputPiece[],
  W: number,
  H: number,
  opt: FROptions,
): FRSheet[] | null {
  const sheets: FRSheet[] = [];

  const bestInSheet = (s: FRSheet, pw: number, ph: number) => {
    let best: { fi: number; w: number; h: number; score: number } | null = null;
    const orients: Array<[number, number]> = opt.rotate
      ? [
          [pw, ph],
          [ph, pw],
        ]
      : [[pw, ph]];
    for (let fi = 0; fi < s.free.length; fi++) {
      const f = s.free[fi];
      for (const [w, h] of orients) {
        if (w > f.w + FIT_EPS || h > f.h + FIT_EPS) continue;
        const score = fitScore(opt.rule, f, w, h);
        if (!best || score < best.score) best = { fi, w, h, score };
      }
    }
    return best;
  };

  const place = (s: FRSheet, b: { fi: number; w: number; h: number }, label: string) => {
    const f = s.free[b.fi];
    s.placed.push({
      x: round1(f.x),
      y: round1(f.y),
      width: round1(b.w),
      height: round1(b.h),
      label,
    });
    s.used += b.w * b.h;
    s.free.splice(b.fi, 1, ...splitFree(f, b.w, b.h, opt.split));
  };

  for (const p of order) {
    let chosen: { s: FRSheet; b: { fi: number; w: number; h: number; score: number } } | null =
      null;
    for (const s of sheets) {
      const b = bestInSheet(s, p.width, p.height);
      if (!b) continue;
      if (opt.policy === 'first') {
        chosen = { s, b };
        break;
      }
      if (!chosen || b.score < chosen.b.score) chosen = { s, b };
    }
    if (!chosen) {
      const s: FRSheet = { free: [{ x: 0, y: 0, w: W, h: H }], placed: [], used: 0 };
      const b = bestInSheet(s, p.width, p.height);
      if (!b) return null; // la pieza no cabe en una plancha vacía
      sheets.push(s);
      chosen = { s, b };
    }
    place(chosen.s, chosen.b, p.label);
  }
  return sheets;
}

// Une huecos libres contiguos que forman un rectángulo (para mostrar retazos más
// grandes y claros en vez de celdas diminutas).
function mergeFree(rects: FreeRect[]): FreeRect[] {
  const list = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const sameX = Math.abs(a.x - b.x) < 0.05 && Math.abs(a.w - b.w) < 0.05;
        const sameY = Math.abs(a.y - b.y) < 0.05 && Math.abs(a.h - b.h) < 0.05;
        if (sameX && Math.abs(a.y + a.h - b.y) < 0.05) {
          list[i] = { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
        } else if (sameX && Math.abs(b.y + b.h - a.y) < 0.05) {
          list[i] = { x: b.x, y: b.y, w: b.w, h: a.h + b.h };
        } else if (sameY && Math.abs(a.x + a.w - b.x) < 0.05) {
          list[i] = { x: a.x, y: a.y, w: a.w + b.w, h: a.h };
        } else if (sameY && Math.abs(b.x + b.w - a.x) < 0.05) {
          list[i] = { x: b.x, y: b.y, w: a.w + b.w, h: a.h };
        } else {
          continue;
        }
        list.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return list;
}

function toPacked(s: FRSheet): PackedSheet {
  return {
    pieces: s.placed,
    wasteRects: mergeFree(s.free)
      .filter((r) => r.w > 1 && r.h > 1)
      .map((r) => ({ x: round1(r.x), y: round1(r.y), width: round1(r.w), height: round1(r.h) })),
  };
}

// Mayor rectángulo vacío (alineado a los ejes) de una plancha: es el "retazo" más
// grande que se podría reutilizar. Compresión de coordenadas + barrido.
function largestEmptyRect(pieces: PlacedPiece[], W: number, H: number): number {
  const xs = new Set<number>([0, W]);
  const ys = new Set<number>([0, H]);
  for (const p of pieces) {
    xs.add(Math.min(W, Math.max(0, p.x)));
    xs.add(Math.min(W, Math.max(0, p.x + p.width)));
    ys.add(Math.min(H, Math.max(0, p.y)));
    ys.add(Math.min(H, Math.max(0, p.y + p.height)));
  }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const nx = X.length - 1;
  const ny = Y.length - 1;
  // celda ocupada si algún pedazo la cubre
  const occ: boolean[][] = Array.from({ length: ny }, () => new Array(nx).fill(false));
  for (const p of pieces) {
    for (let j = 0; j < ny; j++) {
      if (Y[j + 1] <= p.y + 0.01 || Y[j] >= p.y + p.height - 0.01) continue;
      for (let i = 0; i < nx; i++) {
        if (X[i + 1] <= p.x + 0.01 || X[i] >= p.x + p.width - 0.01) continue;
        occ[j][i] = true;
      }
    }
  }
  let best = 0;
  for (let j0 = 0; j0 < ny; j0++) {
    // ancho libre acumulado por columna al ir bajando filas desde j0
    const colFree = new Array(nx).fill(true);
    for (let j1 = j0; j1 < ny; j1++) {
      for (let i = 0; i < nx; i++) if (occ[j1][i]) colFree[i] = false;
      const hgt = Y[j1 + 1] - Y[j0];
      let runStart = -1;
      for (let i = 0; i <= nx; i++) {
        if (i < nx && colFree[i]) {
          if (runStart < 0) runStart = i;
        } else if (runStart >= 0) {
          const area = (X[i] - X[runStart]) * hgt;
          if (area > best) best = area;
          runStart = -1;
        }
      }
    }
  }
  return best;
}

// Generador pseudoaleatorio determinista (mulberry32).
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Puntaje de búsqueda (menor = mejor): primero menos planchas; luego concentrar el
// uso en las primeras (suma de cuadrados de lo usado: más alta = más concentrado).
function frSearchScore(sheets: FRSheet[]): number {
  return sheets.length * 1e13 - sheets.reduce((a, s) => a + s.used * s.used, 0);
}

// ¿El acomodo es físicamente posible? (nada se sale de la plancha ni se encima).
// El empaque por columnas tolera hasta 0.5 cm de más al encajar piezas, y en casos
// límite puede dejar dos vidrios encimados por décimas de cm: ese resultado no se
// puede cortar tal cual, así que el optimizador a fondo lo descarta.
function layoutValid(sheets: PackedSheet[], W: number, H: number): boolean {
  const TOL = 0.2;
  for (const s of sheets) {
    const ps = s.pieces;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.x < -TOL || a.y < -TOL || a.x + a.width > W + TOL || a.y + a.height > H + TOL) {
        return false;
      }
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (
          a.x < b.x + b.width - TOL &&
          b.x < a.x + a.width - TOL &&
          a.y < b.y + b.height - TOL &&
          b.y < a.y + a.height - TOL
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

export function guillotinePackBest(
  pieces: InputPiece[],
  sheetW: number,
  sheetH: number,
): PackedSheet[] {
  if (pieces.length === 0) return [];

  // Base: el empaque por columnas de siempre (prolijo y rápido).
  const baseline = guillotinePack(pieces, sheetW, sheetH);

  // ¿Alguna pieza no cabe en una plancha? Caso excepcional: dejar el resultado base.
  const fits = pieces.every(
    (p) =>
      (p.width <= sheetW + FIT_EPS && p.height <= sheetH + FIT_EPS) ||
      (p.height <= sheetW + FIT_EPS && p.width <= sheetH + FIT_EPS),
  );
  if (!fits) return baseline;

  const n = pieces.length;
  const seed = pieces.reduce(
    (h, p) => (Math.imul(h ^ Math.round(p.width * 10 + p.height * 1000), 16777619) >>> 0),
    2166136261,
  );
  const rng = makeRng(seed);

  type Cand = { sheets: FRSheet[]; score: number };
  const keep: Cand[] = []; // mejores candidatos (se afinan después)
  const KEEP = 14;
  const seen = new Set<string>();
  const consider = (sheets: FRSheet[] | null) => {
    if (!sheets) return;
    const score = frSearchScore(sheets);
    if (keep.length >= KEEP && score >= keep[keep.length - 1].score) return;
    const sig = sheets
      .map((s) => s.placed.map((p) => `${p.label}${p.x},${p.y},${p.width}`).join(';'))
      .join('|');
    if (seen.has(sig)) return;
    seen.add(sig);
    keep.push({ sheets, score });
    keep.sort((a, b) => a.score - b.score);
    if (keep.length > KEEP) keep.length = KEEP;
  };

  const sorters: Array<(a: InputPiece, b: InputPiece) => number> = [
    (a, b) => b.width * b.height - a.width * a.height,
    (a, b) => b.height - a.height || b.width - a.width,
    (a, b) => b.width - a.width || b.height - a.height,
    (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height),
    (a, b) => b.width + b.height - (a.width + a.height),
    (a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height),
  ];

  // 1) Combinaciones deterministas (orden × ajuste × partición × plancha × rotación)
  for (const cmp of sorters) {
    const sorted = [...pieces].sort(cmp);
    for (const rule of FIT_RULES)
      for (const split of SPLIT_RULES)
        for (const policy of ['first', 'best'] as SheetPolicy[])
          for (const rotate of [true, false])
            consider(frPack(sorted, sheetW, sheetH, { rule, split, policy, rotate }));
  }

  // 2) Búsqueda aleatoria con orden perturbado (iteraciones acotadas por tamaño)
  const iters = Math.max(150, Math.min(2500, Math.floor(90000 / Math.max(10, n))));
  const t0 = Date.now();
  for (let it = 0; it < iters; it++) {
    if (it % 50 === 0 && Date.now() - t0 > 1800) break; // tope de tiempo
    const noise = 0.05 + rng() * 0.5;
    const keyed = pieces.map((p) => {
      const base =
        it % 3 === 0
          ? p.width * p.height
          : it % 3 === 1
            ? Math.max(p.width, p.height) * 100 + Math.min(p.width, p.height)
            : p.height * 100 + p.width;
      return { p, k: base * (1 + (rng() - 0.5) * noise) };
    });
    keyed.sort((a, b) => b.k - a.k);
    consider(
      frPack(
        keyed.map((x) => x.p),
        sheetW,
        sheetH,
        {
          rule: FIT_RULES[Math.floor(rng() * FIT_RULES.length)],
          split: SPLIT_RULES[Math.floor(rng() * SPLIT_RULES.length)],
          policy: rng() < 0.7 ? 'first' : 'best',
          rotate: rng() < 0.85,
        },
      ),
    );
  }

  // 3) Elegir: menos planchas; luego el retazo reutilizable más grande
  type Final = { packed: PackedSheet[]; sheetsN: number; remnant: number; usedSq: number };
  const evaluate = (packed: PackedSheet[]): Final => {
    const remnant = packed.reduce((a, s) => {
      const m = largestEmptyRect(s.pieces, sheetW, sheetH);
      return a + m * m;
    }, 0);
    const usedSq = packed.reduce(
      (a, s) => a + Math.pow(s.pieces.reduce((x, p) => x + p.width * p.height, 0), 2),
      0,
    );
    return { packed, sheetsN: packed.length, remnant, usedSq };
  };

  const baselineOk = layoutValid(baseline, sheetW, sheetH);
  let best: Final | null = baselineOk ? evaluate(baseline) : null;
  for (const c of keep) {
    const packed = c.sheets.map(toPacked);
    if (!layoutValid(packed, sheetW, sheetH)) continue;
    const f = evaluate(packed);
    if (
      !best ||
      f.sheetsN < best.sheetsN ||
      (f.sheetsN === best.sheetsN && f.remnant > best.remnant * 1.02) ||
      (f.sheetsN === best.sheetsN &&
        Math.abs(f.remnant - best.remnant) <= best.remnant * 0.02 &&
        f.usedSq > best.usedSq * 1.005)
    ) {
      best = f;
    }
  }
  // Sin ningún acomodo válido (no debería pasar): devolver el empaque clásico.
  return (best ? best.packed : baseline).filter((s) => s.pieces.length > 0);
}
