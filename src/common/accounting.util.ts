// Mes contable de un pedido: por defecto es el mes en que se creó/confirmó
// (createdAt), pero el administrador puede moverlo a otro mes con
// `accountingDate`. Todo filtro o agrupación por mes de pedidos debe usar
// estas funciones para respetar ese cambio manual.

type DateRange = { gte?: Date; lt?: Date; lte?: Date };

/** Condición Prisma: la fecha efectiva (accountingDate ?? createdAt) cae en el rango. */
export const orderDateWhere = (range: DateRange) => ({
  AND: [
    {
      OR: [
        { accountingDate: range },
        { accountingDate: null, createdAt: range },
      ],
    },
  ],
});

/** Fecha efectiva de un pedido para reportes mensuales. */
export const effectiveOrderDate = (o: {
  accountingDate?: Date | null;
  createdAt: Date;
}): Date => o.accountingDate ?? o.createdAt;

/** "2026-10" → fecha dentro de ese mes (día 15, mediodía UTC: segura ante zonas horarias). */
export const accountingMonthToDate = (month: string): Date => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12, 0, 0));
};
