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
    filters: { search?: string; quotationStatus?: string; clientStatus?: string } = {},
  ) {
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const ownershipClause = this.isAdmin(user) ? {} : { userId: user.id };

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

    const windowsData: Array<{
      displayName?: string;
      width_cm: number;
      height_cm: number;
      price: number;
      price_per_m2: number | null;
      quantity: number;
      options: any;
      window_type_id: number;
      color_id: number;
      glass_color_id: number;
      design_image_url?: string | null;
      quotation_id: number;
    }> = [];

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
          glass_color_id: Number(win.glass_color_id),
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
      for (const { glass_color_id, ...winData } of windowsData) {
        await prisma.quotationWindow.create({
          data: {
            ...winData,
            ...(glass_color_id ? { glass_color_id } : {}),
          },
        });
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

    const { installationStartDate, installationEndDate } = confirmQuotationDto;
    if (!installationStartDate || !installationEndDate) {
      throw new BadRequestException(
        'Se requieren las fechas de inicio y fin de instalación para confirmar.',
      );
    }

    const startDate = new Date(installationStartDate);
    const endDate = new Date(installationEndDate);

    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        quotation_windows: { orderBy: { id: 'asc' } },
        generatedOrder: { select: { id: true } },
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

    const typeIds = [
      ...new Set(quotation.quotation_windows.map((w) => w.window_type_id)),
    ];
    const calculations = await this.prisma.windowCalculation.findMany({
      where: { window_type_id: { in: typeIds } },
    });
    const calcMap = new Map(calculations.map((c) => [c.window_type_id, c]));

    const windowsToCreate = quotation.quotation_windows.map((win) => {
      const winOptions = (win as any).options || {};
      const calcParams = calcMap.get(win.window_type_id);

      let hojaAncho: number;
      let hojaAlto: number;
      let vidrioAncho: number;
      let vidrioAlto: number;

      if (!calcParams) {
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
          const overrides = calcParams.calculationOverrides as any;
          const optionKey = Object.keys(winOptions).find(
            (key) => overrides[winOptions[key]],
          );
          if (optionKey) {
            const overrideRules = overrides[winOptions[optionKey]];
            hojaMargen = overrideRules.hojaMargen ?? hojaMargen;
            hojaDescuento = overrideRules.hojaDescuento ?? hojaDescuento;
            vidrioDescuento = overrideRules.vidrioDescuento ?? vidrioDescuento;
            hojaDivision = overrideRules.hojaDivision ?? hojaDivision;
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
      };
    });

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
            notes: quotation.notes ?? null,
            clientId: quotation.clientId,
            installationStartDate: startDate,
            installationEndDate: endDate,
          },
        });
      } else {
        resultOrder = await prisma.order.create({
          data: {
            project: quotation.project,
            total: quotation.total_price,
            status: OrderStatus.en_proceso,
            clientId: quotation.clientId,
            include_iva: quotation.include_iva ?? false,
            notes: quotation.notes ?? null,
            generatedFromQuotationId: id,
            installationStartDate: startDate,
            installationEndDate: endDate,
            windows: { create: windowsToCreate },
          },
        });
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
