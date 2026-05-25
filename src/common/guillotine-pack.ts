// ── Optimizador 2D de corte de vidrio (MaxRects + meta-solver) ──────────────
// Ejecuta varias combinaciones de (orden de piezas × heurística de fit ×
// regla de split) y devuelve la mejor (menos planchas; tiebreak: menor área
// desperdiciada). La versión previa hacía una sola pasada BSSF con split
// horizontal fijo y first-fit por plancha; eso desperdiciaba planchas cuando
// piezas que cabían juntas terminaban en planchas distintas.
//
// Complejidad: 8 piezas × ~24 combinaciones × O(n²) por corrida ≈ pocos ms.

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
interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Sheet {
  placed: PlacedPiece[];
  freeRects: FreeRect[];
}

export interface PackedSheet {
  pieces: PlacedPiece[];
  wasteRects: { x: number; y: number; width: number; height: number }[];
}

type Heuristic = 'BSSF' | 'BLSF' | 'BAF';
type SplitRule = 'SAS' | 'LAS'; // Shorter / Longer Axis Split

const round1 = (n: number) => Math.round(n * 10) / 10;
const EPS = 0.5;

function newSheet(sheetW: number, sheetH: number): Sheet {
  return { placed: [], freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }] };
}

function scoreFit(
  fr: FreeRect,
  pw: number,
  ph: number,
  heuristic: Heuristic,
): number {
  const leftoverW = fr.w - pw;
  const leftoverH = fr.h - ph;
  switch (heuristic) {
    case 'BSSF':
      return Math.min(leftoverW, leftoverH);
    case 'BLSF':
      return Math.max(leftoverW, leftoverH);
    case 'BAF':
      // Best Area Fit: priorizar el rect cuya área sobrante es mínima;
      // empate por short-side.
      return fr.w * fr.h - pw * ph;
  }
}

function splitFreeRect(
  fr: FreeRect,
  fw: number,
  fh: number,
  rule: SplitRule,
): FreeRect[] {
  // Decide si la división horizontal o vertical produce la franja "buena" más
  // grande (LAS) o más chica (SAS). SAS suele conservar zonas amplias para
  // piezas grandes; LAS funciona mejor con mezclas de piezas alargadas.
  const dw = fr.w - fw;
  const dh = fr.h - fh;
  const splitHorizontal =
    rule === 'SAS' ? dw <= dh : dw > dh;

  const out: FreeRect[] = [];
  if (splitHorizontal) {
    // Corte horizontal: la franja inferior hereda el ancho completo;
    // la franja derecha hereda solo la altura de la pieza.
    if (dw > EPS) {
      out.push({ x: fr.x + fw, y: fr.y, w: dw, h: fh });
    }
    if (dh > EPS) {
      out.push({ x: fr.x, y: fr.y + fh, w: fr.w, h: dh });
    }
  } else {
    // Corte vertical: la franja derecha hereda la altura completa;
    // la franja inferior hereda solo el ancho de la pieza.
    if (dw > EPS) {
      out.push({ x: fr.x + fw, y: fr.y, w: dw, h: fr.h });
    }
    if (dh > EPS) {
      out.push({ x: fr.x, y: fr.y + fh, w: fw, h: dh });
    }
  }
  return out;
}

// Elimina free rects contenidos completamente dentro de otros (depuración
// que el algoritmo previo omitía y que dejaba fragmentos sin uso).
function pruneFreeRects(rects: FreeRect[]): FreeRect[] {
  const out: FreeRect[] = [];
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    let contained = false;
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      const b = rects[j];
      if (
        a.x >= b.x - EPS &&
        a.y >= b.y - EPS &&
        a.x + a.w <= b.x + b.w + EPS &&
        a.y + a.h <= b.y + b.h + EPS
      ) {
        contained = true;
        break;
      }
    }
    if (!contained) out.push(a);
  }
  return out;
}

interface FitCandidate {
  sheetIdx: number;
  fr: FreeRect;
  rotated: boolean;
  score: number;
}

// Busca el mejor lugar para la pieza CONSIDERANDO TODAS las planchas abiertas
// (no la primera donde cabe — eso era la limitación principal del algoritmo
// anterior). Si no cabe en ninguna, retorna null y se abre plancha nueva.
function findBestFit(
  sheets: Sheet[],
  pw: number,
  ph: number,
  heuristic: Heuristic,
): FitCandidate | null {
  let best: FitCandidate | null = null;
  for (let si = 0; si < sheets.length; si++) {
    for (const fr of sheets[si].freeRects) {
      if (pw <= fr.w + EPS && ph <= fr.h + EPS) {
        const s = scoreFit(fr, pw, ph, heuristic);
        if (!best || s < best.score) {
          best = { sheetIdx: si, fr, rotated: false, score: s };
        }
      }
      if (ph <= fr.w + EPS && pw <= fr.h + EPS) {
        const s = scoreFit(fr, ph, pw, heuristic);
        if (!best || s < best.score) {
          best = { sheetIdx: si, fr, rotated: true, score: s };
        }
      }
    }
  }
  return best;
}

function placeIntoSheet(
  sheet: Sheet,
  fr: FreeRect,
  fw: number,
  fh: number,
  label: string,
  rule: SplitRule,
): void {
  const px = fr.x;
  const py = fr.y;

  sheet.placed.push({
    x: round1(px),
    y: round1(py),
    width: round1(fw),
    height: round1(fh),
    label,
  });

  // Reemplazar el free rect usado por los sub-rects resultantes del split.
  sheet.freeRects = sheet.freeRects.filter((f) => f !== fr);
  sheet.freeRects.push(...splitFreeRect(fr, fw, fh, rule));

  // Recortar cualquier free rect que se solape con la pieza colocada.
  const px2 = px + fw;
  const py2 = py + fh;
  const newRects: FreeRect[] = [];
  for (const f of sheet.freeRects) {
    const fx2 = f.x + f.w;
    const fy2 = f.y + f.h;
    const noOverlap = f.x >= px2 || fx2 <= px || f.y >= py2 || fy2 <= py;
    if (noOverlap) {
      if (f.w > EPS && f.h > EPS) newRects.push(f);
      continue;
    }
    // Solapamiento: dividir el free rect en hasta 4 sub-rects que rodeen la pieza.
    if (f.x < px) {
      newRects.push({ x: f.x, y: f.y, w: px - f.x, h: f.h });
    }
    if (fx2 > px2) {
      newRects.push({ x: px2, y: f.y, w: fx2 - px2, h: f.h });
    }
    if (f.y < py) {
      newRects.push({ x: f.x, y: f.y, w: f.w, h: py - f.y });
    }
    if (fy2 > py2) {
      newRects.push({ x: f.x, y: py2, w: f.w, h: fy2 - py2 });
    }
  }
  sheet.freeRects = pruneFreeRects(
    newRects.filter((r) => r.w > EPS && r.h > EPS),
  );
}

function runPack(
  pieces: InputPiece[],
  sheetW: number,
  sheetH: number,
  heuristic: Heuristic,
  rule: SplitRule,
): Sheet[] {
  const sheets: Sheet[] = [];
  for (const piece of pieces) {
    // Pre-rotación: si una orientación no cabe en plancha vacía pero la
    // otra sí, forzar la que cabe. Cubre piezas con un lado > sheet edge.
    const fitsNormal = piece.width <= sheetW + EPS && piece.height <= sheetH + EPS;
    const fitsRotated = piece.height <= sheetW + EPS && piece.width <= sheetH + EPS;
    if (!fitsNormal && !fitsRotated) {
      // Pieza imposible — la colocamos como sheet propia para no perderla.
      const s = newSheet(sheetW, sheetH);
      s.placed.push({
        x: 0,
        y: 0,
        width: piece.width,
        height: piece.height,
        label: piece.label,
      });
      s.freeRects = [];
      sheets.push(s);
      continue;
    }

    const candidate = findBestFit(sheets, piece.width, piece.height, heuristic);
    if (candidate) {
      const fw = candidate.rotated ? piece.height : piece.width;
      const fh = candidate.rotated ? piece.width : piece.height;
      placeIntoSheet(
        sheets[candidate.sheetIdx],
        candidate.fr,
        fw,
        fh,
        piece.label,
        rule,
      );
      continue;
    }

    // No cupo en ninguna plancha existente — abrir una nueva.
    const sheet = newSheet(sheetW, sheetH);
    sheets.push(sheet);
    const fr = sheet.freeRects[0];
    // Si solo cabe rotada, elegir esa orientación.
    const useRotated = !fitsNormal;
    const fw = useRotated ? piece.height : piece.width;
    const fh = useRotated ? piece.width : piece.height;
    placeIntoSheet(sheet, fr, fw, fh, piece.label, rule);
  }
  return sheets;
}

function scoreSolution(sheets: Sheet[], sheetW: number, sheetH: number): number {
  // Menor es mejor. Penaliza # planchas primero, luego desperdicio total.
  const sheetArea = sheetW * sheetH;
  const totalUsed = sheets.reduce(
    (sum, s) =>
      sum + s.placed.reduce((a, p) => a + p.width * p.height, 0),
    0,
  );
  const totalSheetArea = sheets.length * sheetArea;
  const waste = totalSheetArea - totalUsed;
  return sheets.length * 1e9 + waste;
}

export function guillotinePack(
  pieces: InputPiece[],
  sheetW: number,
  sheetH: number,
): PackedSheet[] {
  if (pieces.length === 0) return [];

  // Ordenamientos candidatos: más variantes = mejor calidad, costo trivial
  // con 8-50 piezas. Cada orden es estable y determinístico.
  const orderings: Array<{ name: string; cmp: (a: InputPiece, b: InputPiece) => number }> = [
    { name: 'area-desc', cmp: (a, b) => b.width * b.height - a.width * a.height },
    { name: 'height-desc', cmp: (a, b) => b.height - a.height },
    { name: 'width-desc', cmp: (a, b) => b.width - a.width },
    { name: 'longSide-desc', cmp: (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) },
    { name: 'perimeter-desc', cmp: (a, b) => (b.width + b.height) - (a.width + a.height) },
  ];
  const heuristics: Heuristic[] = ['BSSF', 'BLSF', 'BAF'];
  const splitRules: SplitRule[] = ['SAS', 'LAS'];

  let bestSheets: Sheet[] | null = null;
  let bestScore = Infinity;

  for (const ord of orderings) {
    const sorted = [...pieces].sort(ord.cmp);
    for (const h of heuristics) {
      for (const r of splitRules) {
        const sheets = runPack(sorted, sheetW, sheetH, h, r);
        const score = scoreSolution(sheets, sheetW, sheetH);
        if (score < bestScore) {
          bestScore = score;
          bestSheets = sheets;
        }
      }
    }
  }

  const result = bestSheets ?? [];
  return result
    .filter((s) => s.placed.length > 0)
    .map((s) => ({
      pieces: s.placed,
      wasteRects: s.freeRects
        .filter((f) => f.w > 1 && f.h > 1)
        .map((f) => ({
          x: round1(f.x),
          y: round1(f.y),
          width: round1(f.w),
          height: round1(f.h),
        })),
    }));
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
