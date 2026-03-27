// ── Algoritmo MaxRects-BSSF para optimización 2D de vidrio ───────────────────
// Guillotina con Best Short Side Fit. Retorna planchas con piezas y wasteRects.
// Extraído como utilidad compartida para que reports.service y cost-calculator
// usen el mismo algoritmo y produzcan resultados idénticos.

export function guillotinePack(
  pieces: { width: number; height: number; label: string }[],
  sheetW: number,
  sheetH: number,
): {
  pieces: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  }[];
  wasteRects: { x: number; y: number; width: number; height: number }[];
}[] {
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const sorted = [...pieces].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  );

  interface FreeRect {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  interface Sheet {
    placed: {
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    }[];
    freeRects: FreeRect[];
  }

  const sheets: Sheet[] = [];

  function newSheet(): Sheet {
    return {
      placed: [],
      freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }],
    };
  }

  // Short Side Fit score: menor es mejor
  function bssfScore(fr: FreeRect, pw: number, ph: number): number {
    const leftoverH = Math.abs(fr.w - pw);
    const leftoverV = Math.abs(fr.h - ph);
    return Math.min(leftoverH, leftoverV);
  }

  function tryPlace(
    sheet: Sheet,
    pw: number,
    ph: number,
    label: string,
  ): boolean {
    let bestScore = Infinity;
    let bestFr: FreeRect | null = null;
    let bestRotated = false;

    for (const fr of sheet.freeRects) {
      if (pw <= fr.w && ph <= fr.h) {
        const score = bssfScore(fr, pw, ph);
        if (score < bestScore) {
          bestScore = score;
          bestFr = fr;
          bestRotated = false;
        }
      }
      if (ph <= fr.w && pw <= fr.h) {
        const score = bssfScore(fr, ph, pw);
        if (score < bestScore) {
          bestScore = score;
          bestFr = fr;
          bestRotated = true;
        }
      }
    }

    if (!bestFr) return false;

    const fw = bestRotated ? ph : pw;
    const fh = bestRotated ? pw : ph;
    const px = round1(bestFr.x);
    const py = round1(bestFr.y);

    sheet.placed.push({
      x: px,
      y: py,
      width: round1(fw),
      height: round1(fh),
      label,
    });

    const fr = bestFr;
    const newFrees: FreeRect[] = [];

    // Corte HORIZONTAL PRIMERO: rect derecho hereda altura de la pieza,
    // rect inferior hereda el ancho COMPLETO del free rect original.
    // Esto mantiene franjas inferiores amplias y contiguas → mejor empaquetado.

    // Derecha de la pieza (alto = alto de la pieza, no del free rect)
    if (fr.w - fw > 0.5) {
      newFrees.push({
        x: round1(fr.x + fw),
        y: round1(fr.y),
        w: round1(fr.w - fw),
        h: round1(fh),
      });
    }
    // Abajo de la pieza (ancho COMPLETO del free rect original)
    if (fr.h - fh > 0.5) {
      newFrees.push({
        x: round1(fr.x),
        y: round1(fr.y + fh),
        w: round1(fr.w),
        h: round1(fr.h - fh),
      });
    }

    sheet.freeRects = sheet.freeRects.filter((f) => f !== fr);
    sheet.freeRects.push(...newFrees);

    // Eliminar free rects que se solapan con la pieza recién colocada
    sheet.freeRects = sheet.freeRects.filter((f) => {
      const noOverlap =
        f.x >= px + fw || f.x + f.w <= px || f.y >= py + fh || f.y + f.h <= py;
      return noOverlap && f.w > 0.5 && f.h > 0.5;
    });

    return true;
  }

  for (const piece of sorted) {
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlace(sheet, piece.width, piece.height, piece.label)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const sheet = newSheet();
      sheets.push(sheet);
      tryPlace(sheet, piece.width, piece.height, piece.label);
    }
  }

  return sheets
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
