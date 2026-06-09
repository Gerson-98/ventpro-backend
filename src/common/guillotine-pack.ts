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
