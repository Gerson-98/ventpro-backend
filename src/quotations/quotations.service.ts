import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  CreateQuotationDto,
  ConfirmQuotationDto,
} from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { PrismaService } from '../prisma/prisma.service';
import { WindowsService } from '../windows/windows.service';
import { OrderStatus, QuotationStatus } from '@prisma/client';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';
import { normalizeOverrideRules, findOverrideRule } from '../common/override-rules.util';
import { PerfilFormulasService } from '../perfil-formulas/perfil-formulas.service';

interface AuthUser {
  id: number;
  name: string;
  role: string;
}

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private windowsService: WindowsService,
    private costCalculator: CostCalculatorService,
    private perfilFormulas: PerfilFormulasService,
  ) {}

  /**
   * Calcula y devuelve costo total + precio sugerido mínimo para un set de
   * ventanas. Snapshot: se llama al guardar para persistir los valores en la
   * cotización; así, al reabrir para editar, el "precio sugerido" mostrado es
   * el que el usuario vio al guardar, no uno recalculado con precios actuales
   * de materiales o margen actual.
   *
   * IMPORTANTE: Este método SIEMPRE debe llamarse FUERA de una transacción
   * de Prisma. Internamente hace múltiples queries con el cliente global
   * (this.prisma). Llamarlo dentro de una $transaction interactiva en
   * Neon/pgBouncer causa timeouts y errores 500 porque el connection pooler
   * no puede multiplexar queries al cliente global mientras hay una
   * transacción abierta en otra conexión del pool.
   */
  private async snapshotPrecioSugerido(
    windows: Array<{
      window_type_id: number;
      width_cm: number;
      height_cm: number;
      color_id: number;
      glass_color_id?: number | null;
      options?: any;
      quantity?: number;
    }>,
  ): Promise<{ costo_total_proyecto: number; precio_sugerido_minimo: number } | null> {
    if (!windows || windows.length === 0) return null;
    try {
      const payload = windows.map((w) => ({
        window_type_id: Number(w.window_type_id),
        width_cm: Number(w.width_cm),
        height_cm: Number(w.height_cm),
        color_id: Number(w.color_id),
        glass_color_id: w.glass_color_id ? Number(w.glass_color_id) : undefined,
        options: (w.options as Record<string, string>) || {},
        quantity: Number(w.quantity) || 1,
      }));
      const result = await this.costCalculator.calcularCostoCotizacion(payload);
      return {
        costo_total_proyecto: result.costo_total_proyecto,
        precio_sugerido_minimo: result.precio_sugerido_minimo,
      };
    } catch {
      // Si el cálculo falla (ej. tipo de ventana sin catálogo), NO bloqueamos
      // el save — la cotización debe poder guardarse aunque el motor de
      // costos tenga un dato faltante. Los campos quedan null y la UI
      // los maneja como ausentes.
      return null;
    }
  }

  // ─── Estadísticas de cotizaciones (solo ADMIN) ─────────────────────────────
  // Para controlar la actividad de los vendedores: cuántas cotizaciones se
  // hacen por día, valor promedio, ranking por vendedor, conversión y
  // cotizaciones por debajo del mínimo sugerido. Las fechas se agrupan en hora
  // de Guatemala (UTC-6, sin horario de verano).
  async getStats(user: AuthUser, from?: string, to?: string) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Solo el administrador puede ver las estadísticas.');
    }
    const TZ_MS = 6 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const parseKey = (s?: string): number | null => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };

    const todayLocal = Math.floor((Date.now() - TZ_MS) / DAY_MS) * DAY_MS;
    const monthStart = (() => {
      const t = new Date(todayLocal);
      return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1);
    })();
    let fromDay = parseKey(from) ?? monthStart;
    let toDay = parseKey(to) ?? todayLocal;
    if (toDay < fromDay) [fromDay, toDay] = [toDay, fromDay];
    const MAX_DAYS = 366;
    if ((toDay - fromDay) / DAY_MS + 1 > MAX_DAYS) fromDay = toDay - (MAX_DAYS - 1) * DAY_MS;
    const days = (toDay - fromDay) / DAY_MS + 1;

    const startUtc = new Date(fromDay + TZ_MS);
    const endUtc = new Date(toDay + DAY_MS + TZ_MS); // exclusivo

    const [rows, users, oldPending] = await Promise.all([
      this.prisma.quotation.findMany({
        where: { createdAt: { gte: startUtc, lt: endUtc } },
        select: {
          id: true,
          createdAt: true,
          status: true,
          total_price: true,
          precio_sugerido_minimo: true,
          userId: true,
        },
      }),
      this.prisma.user.findMany({
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      }),
      // Cotizaciones en proceso con más de 7 días sin confirmar (seguimiento)
      this.prisma.quotation.findMany({
        where: {
          status: QuotationStatus.en_proceso,
          createdAt: { lt: new Date(Date.now() - 7 * DAY_MS) },
        },
        select: { userId: true, total_price: true },
      }),
    ]);

    const money = (n: number) => Math.round(n * 100) / 100;
    const isBelowMin = (r: { total_price: number | null; precio_sugerido_minimo: number | null }) =>
      r.total_price != null &&
      r.precio_sugerido_minimo != null &&
      r.precio_sugerido_minimo > 0 &&
      r.total_price < r.precio_sugerido_minimo * 0.995;

    // ── Por día ──
    const byDayMap = new Map<string, { count: number; value: number }>();
    for (let d = fromDay; d <= toDay; d += DAY_MS) byDayMap.set(toKey(d), { count: 0, value: 0 });
    for (const r of rows) {
      const k = toKey(r.createdAt.getTime() - TZ_MS);
      const e = byDayMap.get(k);
      if (e) {
        e.count += 1;
        e.value += r.total_price ?? 0;
      }
    }
    const byDay = [...byDayMap.entries()].map(([date, v]) => ({
      date,
      count: v.count,
      value: money(v.value),
    }));
    const peak = byDay.reduce((best, d) => (d.count > best.count ? d : best), { date: '', count: 0, value: 0 });

    // ── Por vendedor ──
    type Seller = {
      userId: number | null;
      name: string;
      role: string | null;
      count: number;
      value: number;
      confirmed: number;
      confirmedValue: number;
      belowMin: number;
      lastAt: Date | null;
      followUpCount: number;
      followUpValue: number;
    };
    const sellers = new Map<number | null, Seller>();
    const blank = (userId: number | null, name: string, role: string | null): Seller => ({
      userId, name, role, count: 0, value: 0, confirmed: 0, confirmedValue: 0,
      belowMin: 0, lastAt: null, followUpCount: 0, followUpValue: 0,
    });
    for (const u of users) sellers.set(u.id, blank(u.id, u.name, u.role));
    const get = (id: number | null) => {
      if (!sellers.has(id)) sellers.set(id, blank(id, id == null ? 'Sin vendedor' : `Usuario #${id}`, null));
      return sellers.get(id)!;
    };
    for (const r of rows) {
      const s = get(r.userId);
      s.count += 1;
      s.value += r.total_price ?? 0;
      if (r.status === QuotationStatus.confirmado) {
        s.confirmed += 1;
        s.confirmedValue += r.total_price ?? 0;
      }
      if (isBelowMin(r)) s.belowMin += 1;
      if (!s.lastAt || r.createdAt > s.lastAt) s.lastAt = r.createdAt;
    }
    for (const r of oldPending) {
      const s = get(r.userId);
      s.followUpCount += 1;
      s.followUpValue += r.total_price ?? 0;
    }
    const bySeller = [...sellers.values()]
      // Solo usuarios con cotizaciones o vendedores/supervisores (para ver a quien no cotizó)
      .filter((s) => s.count > 0 || s.followUpCount > 0 || s.role === 'VENDEDOR' || s.role === 'SUPERVISOR')
      .map((s) => ({
        userId: s.userId,
        name: s.name,
        role: s.role,
        count: s.count,
        value: money(s.value),
        avg: s.count ? money(s.value / s.count) : 0,
        confirmed: s.confirmed,
        confirmedValue: money(s.confirmedValue),
        conversion: s.count ? Math.round((s.confirmed / s.count) * 1000) / 10 : 0,
        perDay: Math.round((s.count / days) * 10) / 10,
        belowMin: s.belowMin,
        lastAt: s.lastAt,
        followUpCount: s.followUpCount,
        followUpValue: money(s.followUpValue),
      }))
      .sort((a, b) => b.count - a.count || b.value - a.value);

    // ── Totales ──
    const count = rows.length;
    const value = rows.reduce((s, r) => s + (r.total_price ?? 0), 0);
    const confirmedRows = rows.filter((r) => r.status === QuotationStatus.confirmado);
    const confirmedValue = confirmedRows.reduce((s, r) => s + (r.total_price ?? 0), 0);

    return {
      period: { from: toKey(fromDay), to: toKey(toDay), days },
      totals: {
        count,
        value: money(value),
        avg: count ? money(value / count) : 0,
        perDay: Math.round((count / days) * 10) / 10,
        confirmed: confirmedRows.length,
        confirmedValue: money(confirmedValue),
        conversion: count ? Math.round((confirmedRows.length / count) * 1000) / 10 : 0,
        belowMin: rows.filter(isBelowMin).length,
        peakDay: peak.count > 0 ? peak : null,
      },
      byDay,
      bySeller,
      followUp: {
        days: 7,
        count: oldPending.length,
        value: money(oldPending.reduce((s, r) => s + (r.total_price ?? 0), 0)),
      },
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private isAdmin(user: AuthUser): boolean {
    return user.role === 'ADMIN';
  }

  private async assertOwnership(
    quotationId: number,
    user: AuthUser,
  ): Promise<void> {
    if (this.isAdmin(user)) return;

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { userId: true },
    });

    if (!quotation) {
      throw new NotFoundException(
        `Cotización con ID #${quotationId} no encontrada.`,
      );
    }

    if (quotation.userId !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta cotización.',
      );
    }
  }

  // ─── create ─────────────────────────────────────────────────────────────────

  async create(createQuotationDto: CreateQuotationDto, user: AuthUser) {
    const {
      project,
      price_per_m2,
      clientId,
      windows,
      include_iva,
      notes,
      reference_image_url,
    } = createQuotationDto;

    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // ── Calcular datos de ventanas ANTES de abrir la transaction ──────────────
    // Evita mantener locks de BD mientras se hacen cálculos en memoria.
    let totalQuotationPrice = 0;
    const windowsData = windows.map((win) => {
      const widthInM = win.width_m || 0;
      const heightInM = win.height_m || 0;
      const quantity = win.quantity || 1;
      const priceToUse = win.price_per_m2 || price_per_m2;
      const windowPrice = widthInM * heightInM * priceToUse;
      totalQuotationPrice += windowPrice * quantity;

      return {
        displayName: win.displayName,
        width_cm: widthInM * 100,
        height_cm: heightInM * 100,
        price: windowPrice * quantity,
        price_per_m2: win.price_per_m2 || null,
        quantity,
        options: win.options || {},
        window_type_id: win.window_type_id,
        color_id: win.color_id,
        glass_color_id: win.glass_color_id,
      };
    });

    if (include_iva) totalQuotationPrice = totalQuotationPrice * 1.05;

    // Snapshot del precio sugerido en el momento de guardado.
    // Si falla, los campos quedan null y el modal cae a su comportamiento previo.
    const costSnapshot = await this.snapshotPrecioSugerido(windowsData);

    const MAX_RETRIES = 5;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const todayCount = await tx.quotation.count({
            where: { createdAt: { gte: startOfDay, lt: endOfDay } },
          });

          const seq = todayCount + 1 + attempt;
          const newQuotationNumber = `${datePrefix}${seq.toString().padStart(2, '0')}`;

          const quotation = await tx.quotation.create({
            data: {
              quotationNumber: newQuotationNumber,
              project,
              price_per_m2,
              clientId,
              include_iva: !!include_iva,
              total_price: totalQuotationPrice,
              costo_total_proyecto: costSnapshot?.costo_total_proyecto ?? null,
              precio_sugerido_minimo: costSnapshot?.precio_sugerido_minimo ?? null,
              userId: user.id,
              notes: notes || null,
              reference_image_url: reference_image_url || null,
            },
          });

          for (const win of windowsData) {
            await tx.quotationWindow.create({
              data: { ...win, quotation_id: quotation.id },
            });
          }

          return tx.quotation.findUnique({
            where: { id: quotation.id },
            include: { quotation_windows: { orderBy: { id: 'asc' } } },
          });
        });

        return result;
      } catch (err) {
        const isUniqueConflict = err?.code === 'P2002';
        if (isUniqueConflict && attempt < MAX_RETRIES - 1) {
          continue;
        }
        if (isUniqueConflict) {
          throw new ConflictException(
            'No se pudo generar un número de cotización único tras varios intentos. Por favor intenta de nuevo.',
          );
        }
        throw err;
      }
    }
  }

  // ─── findAll ─────────────────────────────────────────────────────────────────

  async findAll(
    user: AuthUser,
    page = 1,
    limit = 50,
    filters: {
      search?: string;
      quotationStatus?: string;
      clientStatus?: string;
      // Filtros de "detalle" del panel de estadísticas (solo tienen efecto para ADMIN)
      userId?: number;
      from?: string; // YYYY-MM-DD, hora de Guatemala
      to?: string;
      belowMin?: boolean; // total por debajo del mínimo sugerido
      followUpDays?: number; // en proceso hace más de N días
    } = {},
  ) {
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const ownershipClause = this.isAdmin(user) ? {} : { userId: user.id };

    // ── Filtros del panel de estadísticas (solo administrador) ──
    const extraAnd: object[] = [];
    if (this.isAdmin(user)) {
      const TZ_MS = 6 * 60 * 60 * 1000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const parseKey = (s?: string): number | null => {
        if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
      };
      if (filters.userId && Number.isInteger(filters.userId)) {
        extraAnd.push({ userId: filters.userId });
      }
      const f = parseKey(filters.from);
      const t = parseKey(filters.to);
      if (f !== null || t !== null) {
        extraAnd.push({
          createdAt: {
            ...(f !== null ? { gte: new Date(f + TZ_MS) } : {}),
            ...(t !== null ? { lt: new Date(t + DAY_MS + TZ_MS) } : {}),
          },
        });
      }
      if (filters.followUpDays && filters.followUpDays > 0) {
        extraAnd.push({
          status: QuotationStatus.en_proceso,
          createdAt: { lt: new Date(Date.now() - filters.followUpDays * DAY_MS) },
        });
      }
      if (filters.belowMin) {
        // Prisma no compara dos columnas entre sí: se obtienen los ids con SQL.
        const ids = await this.prisma.$queryRaw<{ id: number }[]>`
          SELECT id FROM "Quotation"
          WHERE precio_sugerido_minimo > 0
            AND total_price < precio_sugerido_minimo * 0.995`;
        extraAnd.push({ id: { in: ids.map((r) => r.id) } });
      }
    }

    const statusClause =
      filters.quotationStatus && filters.quotationStatus !== 'todos'
        ? { status: filters.quotationStatus as QuotationStatus }
        : {};

    const clientStatusClause =
      filters.clientStatus && filters.clientStatus !== 'todos'
        ? { client: { status: filters.clientStatus as any } }
        : {};

    const searchClause =
      filters.search && filters.search.trim()
        ? {
            OR: [
              { quotationNumber: { contains: filters.search, mode: 'insensitive' as const } },
              { project: { contains: filters.search, mode: 'insensitive' as const } },
              { client: { name: { contains: filters.search, mode: 'insensitive' as const } } },
            ],
          }
        : {};

    const whereClause = {
      ...ownershipClause,
      ...statusClause,
      ...clientStatusClause,
      ...searchClause,
      ...(extraAnd.length ? { AND: extraAnd } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where: whereClause,
        include: {
          client: true,
          user: { select: { id: true, name: true } },
          generatedOrder: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
        skip,
      }),
      this.prisma.quotation.count({ where: whereClause }),
    ]);

    return {
      data,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ─── findOne ─────────────────────────────────────────────────────────────────

  async findOne(id: number, user: AuthUser) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        client: true,
        user: { select: { id: true, name: true } },
        quotation_windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
          orderBy: { id: 'asc' },
        },
        generatedOrder: true,
      },
    });

    if (!quotation) {
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    }

    if (!this.isAdmin(user) && quotation.userId !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta cotización.',
      );
    }

    return quotation;
  }

  // ─── update ──────────────────────────────────────────────────────────────────

  async update(
    id: number,
    updateQuotationDto: UpdateQuotationDto,
    user: AuthUser,
  ) {
    await this.assertOwnership(id, user);

    const current = await this.prisma.quotation.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) {
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    }
    if (current.status === QuotationStatus.confirmado) {
      throw new BadRequestException(
        'Esta cotización está confirmada. Usa "Reabrir" antes de editarla.',
      );
    }

    const { windows, ...quotationData } = updateQuotationDto;

    // ── Cargar cotización actual para defaults ────────────────────────────────
    const existingQuotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { quotation_windows: true },
    });
    if (!existingQuotation) {
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    }

    const globalPriceForCalc =
      quotationData.price_per_m2 ?? existingQuotation.price_per_m2;
    const shouldIncludeIva =
      quotationData.include_iva ?? existingQuotation.include_iva ?? false;

    // ── Pre-calcular datos de ventanas FUERA de la transacción ───────────────
    // FIX: Antes windowsForSnapshot y snapshotPrecioSugerido se construían
    // DENTRO de la $transaction. Esto causaba que calcularCostoCotizacion
    // hiciera queries con el cliente global (this.prisma) mientras había una
    // transacción interactiva abierta en Neon/pgBouncer → timeout → 500.
    // Solución: calcular todo antes de abrir la transacción, igual que en create.
    let subTotalAcumulado = 0;

    const windowsData: Parameters<typeof this.prisma.quotationWindow.create>[0]['data'][] = [];

    const windowsForSnapshot: Array<{
      window_type_id: number;
      width_cm: number;
      height_cm: number;
      color_id: number;
      glass_color_id?: number | null;
      options?: any;
      quantity?: number;
    }> = [];

    if (windows && windows.length > 0) {
      for (const win of windows) {
        const widthInM = win.width_m || 0;
        const heightInM = win.height_m || 0;
        const quantity = win.quantity || 1;
        const priceToUse = win.price_per_m2 || globalPriceForCalc;
        const windowPriceTotal = widthInM * heightInM * priceToUse * quantity;
        subTotalAcumulado += windowPriceTotal;

        windowsData.push({
          displayName: win.displayName,
          width_cm: widthInM * 100,
          height_cm: heightInM * 100,
          price: windowPriceTotal,
          price_per_m2: win.price_per_m2 || null,
          quantity,
          options: win.options || {},
          window_type_id: win.window_type_id,
          color_id: win.color_id,
          glass_color_id: win.glass_color_id,
          design_image_url: win.design_image_url || null,
          quotation_id: id,
        });

        windowsForSnapshot.push({
          window_type_id: win.window_type_id,
          width_cm: widthInM * 100,
          height_cm: heightInM * 100,
          color_id: win.color_id,
          glass_color_id: win.glass_color_id ?? null,
          options: win.options || {},
          quantity,
        });
      }
    }

    const totalFinalCalculado = shouldIncludeIva
      ? subTotalAcumulado * 1.05
      : subTotalAcumulado;

    // Snapshot FUERA de la transacción — evita queries al cliente global
    // dentro de una transacción interactiva de Neon/pgBouncer.
    const costSnapshot = await this.snapshotPrecioSugerido(windowsForSnapshot);

    // ── Transacción: solo operaciones de escritura pura ───────────────────────
    // Ahora la transacción solo hace DELETE + INSERTs + UPDATE final.
    // Sin queries al cost calculator ni al cliente global dentro del bloque.
    return this.prisma.$transaction(async (prisma) => {
      // Eliminar TODAS las ventanas existentes de esta cotización
      await prisma.quotationWindow.deleteMany({
        where: { quotation_id: id },
      });

      // Recrear TODAS en el orden exacto que vienen del frontend.
      // Inserts secuenciales para garantizar orden de IDs auto-increment.
      for (const winData of windowsData) {
        await prisma.quotationWindow.create({ data: winData });
      }

      return prisma.quotation.update({
        where: { id },
        data: {
          ...quotationData,
          include_iva: shouldIncludeIva,
          total_price: totalFinalCalculado,
          costo_total_proyecto: costSnapshot?.costo_total_proyecto ?? null,
          precio_sugerido_minimo: costSnapshot?.precio_sugerido_minimo ?? null,
        },
        include: {
          client: true,
          quotation_windows: {
            include: { windowType: true, pvcColor: true, glassColor: true },
            orderBy: { id: 'asc' },
          },
        },
      });
    });
  }

  // ─── reopen ──────────────────────────────────────────────────────────────────

  async reopen(id: number, user: AuthUser) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException(
        'Solo un administrador puede reabrir una cotización confirmada.',
      );
    }

    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { generatedOrder: { select: { id: true } } },
    });

    if (!quotation) {
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    }

    if (quotation.status !== QuotationStatus.confirmado) {
      throw new BadRequestException(
        'Solo se pueden reabrir cotizaciones en estado "confirmado".',
      );
    }

    return this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.en_proceso },
      include: {
        client: true,
        quotation_windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
          orderBy: { id: 'asc' },
        },
        generatedOrder: true,
      },
    });
  }

  // ─── confirm ─────────────────────────────────────────────────────────────────

  async confirm(
    id: number,
    confirmQuotationDto: ConfirmQuotationDto,
    user: AuthUser,
  ) {
    await this.assertOwnership(id, user);

    // Estos campos siguen llamándose "installation*" en el DTO por
    // compatibilidad con el frontend, pero representan la fecha de
    // FABRICACIÓN (Calendario de Fabricación) — el primer paso tras
    // confirmar. La fecha real de instalación se agenda después, por
    // separado, cuando el pedido está "fabricado".
    const {
      installationStartDate,
      installationEndDate,
      marcoUbicacion,
      quitarEtiquetas,
      clientId: confirmClientId,
      referenciasInstalacion,
    } = confirmQuotationDto;
    if (!installationStartDate || !installationEndDate) {
      throw new BadRequestException(
        'Se requieren las fechas de inicio y fin de fabricación para confirmar.',
      );
    }

    const startDate = new Date(installationStartDate);
    const endDate = new Date(installationEndDate);

    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        quotation_windows: { orderBy: { id: 'asc' } },
        generatedOrder: { select: { id: true, notes: true, clientId: true } },
      },
    });

    if (!quotation) {
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    }

    if (quotation.status === QuotationStatus.confirmado) {
      throw new BadRequestException(
        `La cotización #${id} ya está confirmada. Usa "Reabrir" para modificarla.`,
      );
    }

    const existingOrderId = quotation.generatedOrder?.id ?? undefined;
    // Re-confirmar = reabrir una cotización que YA tuvo pedido (ya se le
    // preguntó esto una vez) → no se vuelve a pedir marco/etiquetas/cliente,
    // se conserva tal cual quedó en el pedido original.
    const isReconfirm = !!existingOrderId;

    if (!isReconfirm) {
      if (!marcoUbicacion || marcoUbicacion.length === 0 || !quitarEtiquetas) {
        throw new BadRequestException(
          'Se requiere confirmar con el cliente la ubicación del marco y si se van a quitar etiquetas antes de agendar fabricación.',
        );
      }
      if (!confirmClientId) {
        throw new BadRequestException(
          'Se requiere el nombre, teléfono y dirección del cliente antes de agendar fabricación.',
        );
      }
    }

    // ── Texto que se agrega a las notas del pedido con lo que el vendedor
    // confirmó con el cliente — queda registrado igual que cualquier otra
    // nota manual, para que el que fabrica/instala lo vea sin preguntar de
    // nuevo. Solo se arma (y solo se guarda) la PRIMERA vez que se confirma.
    // Orden fijo: datos del cliente primero, luego marco/etiquetas/referencias
    // — así siempre se lee igual sin importar el pedido.
    let confirmationNoteLines: string[] = [];
    if (!isReconfirm) {
      const confirmedClient = confirmClientId
        ? await this.prisma.client.findUnique({ where: { id: confirmClientId } })
        : null;
      confirmationNoteLines = [
        '— DATOS DEL CLIENTE —',
        `Nombre: ${confirmedClient?.name ?? '—'}`,
        `Teléfono: ${confirmedClient?.phone || '—'}`,
        `Dirección: ${confirmedClient?.address || '—'}`,
        '',
        '— INSTALACIÓN —',
        `Ubicación del marco: ${marcoUbicacion!.join(', ')}`,
        `¿Quitar etiquetas?: ${quitarEtiquetas}`,
        ...(referenciasInstalacion?.trim()
          ? [`Referencias: ${referenciasInstalacion.trim()}`]
          : []),
      ];
    }
    const confirmationNote = confirmationNoteLines.join('\n');

    const typeIds = [
      ...new Set(quotation.quotation_windows.map((w) => w.window_type_id)),
    ];
    const calculations = await this.prisma.windowCalculation.findMany({
      where: { window_type_id: { in: typeIds } },
    });
    const calcMap = new Map(calculations.map((c) => [c.window_type_id, c]));

    const windowTypes = await this.prisma.windowType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, calc_engine: true },
    });
    const engineMap = new Map(windowTypes.map((w) => [w.id, w.calc_engine]));

    const windowsToCreate = await Promise.all(quotation.quotation_windows.map(async (win) => {
      const winOptions = (win as any).options || {};
      const calcParams = calcMap.get(win.window_type_id);

      let hojaAncho: number;
      let hojaAlto: number;
      let vidrioAncho: number;
      let vidrioAlto: number;

      if (engineMap.get(win.window_type_id) === 'formula') {
        // ── Motor de fórmulas nuevo (configurador paso a paso) ──────────────
        const resolved = await this.perfilFormulas.resolveMeasurements(
          win.window_type_id,
          win.width_cm,
          win.height_cm,
          winOptions,
        );
        const hoja = resolved['HOJA'] ?? { ancho: win.width_cm, alto: win.height_cm, piezas: 2 };
        const vidrio = resolved['VIDRIO'] ?? hoja;
        hojaAncho = hoja.ancho;
        hojaAlto = hoja.alto;
        vidrioAncho = vidrio.ancho;
        vidrioAlto = vidrio.alto;
      } else if (!calcParams) {
        hojaAncho = win.width_cm;
        hojaAlto = win.height_cm;
        vidrioAncho = win.width_cm;
        vidrioAlto = win.height_cm;
      } else {
        let hojaMargen = calcParams.hojaMargen;
        let hojaDescuento = calcParams.hojaDescuento;
        let vidrioDescuento = calcParams.vidrioDescuento;
        let hojaDivision = calcParams.hojaDivision;

        if (winOptions && calcParams.calculationOverrides) {
          const rules = normalizeOverrideRules(calcParams.calculationOverrides);
          const optionKey = Object.keys(winOptions).find((key) =>
            findOverrideRule(rules, winOptions[key]),
          );
          if (optionKey) {
            const overrideRule = findOverrideRule(rules, winOptions[optionKey])!;
            hojaMargen = overrideRule.hojaMargen ?? hojaMargen;
            hojaDescuento = overrideRule.hojaDescuento ?? hojaDescuento;
            vidrioDescuento = overrideRule.vidrioDescuento ?? vidrioDescuento;
            hojaDivision = overrideRule.hojaDivision ?? hojaDivision;
          }
        }

        switch (hojaDivision) {
          case 'Mitad':
            hojaAncho = (win.width_cm + hojaMargen) / 2;
            break;
          case 'Tercios':
            hojaAncho = (win.width_cm + hojaMargen) / 3;
            break;
          case 'Cuartos':
            hojaAncho = (win.width_cm + hojaMargen) / 4;
            break;
          default:
            hojaAncho = win.width_cm + hojaMargen;
            break;
        }

        hojaAlto = win.height_cm - hojaDescuento;
        vidrioAncho = hojaAncho - vidrioDescuento;
        vidrioAlto = hojaAlto - vidrioDescuento;
      }

      return {
        displayName: win.displayName,
        options: winOptions,
        width_cm: win.width_cm,
        height_cm: win.height_cm,
        price: win.price,
        design_image_url: win.design_image_url,
        window_type_id: win.window_type_id,
        color_id: win.color_id,
        glass_color_id: win.glass_color_id,
        quantity: win.quantity,
        hojaAncho: Number(hojaAncho.toFixed(1)),
        hojaAlto: Number(hojaAlto.toFixed(1)),
        vidrioAncho: Number(vidrioAncho.toFixed(1)),
        vidrioAlto: Number(vidrioAlto.toFixed(1)),
        // Enlaza esta ventana del pedido con la fila de cotización que le
        // dio origen — permite sincronizar ediciones de medidas en ambos
        // sentidos sin tener que reabrir/re-confirmar la cotización.
        quotation_window_id: win.id,
      };
    }));

    // Primera confirmación: arma notas nuevas y usa el cliente real elegido.
    // Re-confirmación: NO se tocan — se conservan tal cual ya estaban en el
    // pedido (el vendedor no vuelve a contestar nada de esto).
    const combinedNotes = isReconfirm
      ? (quotation.generatedOrder!.notes ?? null)
      : [confirmationNote, quotation.notes]
          .filter((n): n is string => !!n && n.trim().length > 0)
          .join('\n\n') || null;
    const finalClientId = isReconfirm
      ? quotation.generatedOrder!.clientId
      : confirmClientId!;

    return this.prisma.$transaction(async (prisma) => {
      let resultOrder: { id: number };

      if (existingOrderId) {
        await prisma.window.deleteMany({
          where: { order_id: existingOrderId },
        });

        await prisma.window.createMany({
          data: windowsToCreate.map((w) => ({
            ...w,
            order_id: existingOrderId,
          })),
        });

        resultOrder = await prisma.order.update({
          where: { id: existingOrderId },
          data: {
            project: quotation.project,
            total: quotation.total_price,
            include_iva: quotation.include_iva ?? false,
            notes: combinedNotes,
            clientId: finalClientId,
            fabricationStartDate: startDate,
            fabricationEndDate: endDate,
          },
        });
      } else {
        resultOrder = await prisma.order.create({
          data: {
            project: quotation.project,
            total: quotation.total_price,
            // Ya nace con fecha de fabricación agendada → arranca en_fabricacion
            status: OrderStatus.en_fabricacion,
            clientId: finalClientId,
            include_iva: quotation.include_iva ?? false,
            notes: combinedNotes,
            generatedFromQuotationId: id,
            fabricationStartDate: startDate,
            fabricationEndDate: endDate,
            windows: { create: windowsToCreate },
          },
        });

        // Deja el cliente real elegido también en la cotización, por si se
        // reabre/edita después — reemplaza el genérico con el que se cotizó.
        if (confirmClientId && confirmClientId !== quotation.clientId) {
          await prisma.quotation.update({
            where: { id: quotation.id },
            data: { clientId: confirmClientId },
          });
        }
      }

      await prisma.quotation.update({
        where: { id: quotation.id },
        data: {
          status: QuotationStatus.confirmado,
          generatedOrder: { connect: { id: resultOrder.id } },
        },
      });

      return resultOrder;
    });
  }

  // ─── remove ──────────────────────────────────────────────────────────────────

  async remove(id: number, user: AuthUser) {
    await this.assertOwnership(id, user);

    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { generatedOrder: { select: { id: true } } },
    });
    if (!quotation)
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);

    if (quotation.generatedOrder && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'No puedes eliminar una cotización con pedido asociado. Contacta al administrador.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (quotation.generatedOrder) {
        const orderId = quotation.generatedOrder.id;
        await tx.window.deleteMany({ where: { order_id: orderId } });
        await tx.order.delete({ where: { id: orderId } });
      }
      return tx.quotation.delete({ where: { id } });
    });
  }
}
