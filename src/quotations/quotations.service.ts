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
  ) {}

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

    if (include_iva) totalQuotationPrice = totalQuotationPrice * 1.12;

    // ── Generar quotationNumber sin colisiones bajo alta concurrencia ──────────
    // Patrón: COUNT + INSERT con unique constraint en quotationNumber + retry.
    //
    // Por qué NO usamos pg_advisory_xact_lock():
    //   Neon usa pgBouncer (connection pooling). Las advisory locks dentro de
    //   transacciones interactivas de Prisma pueden producir timeouts o errores
    //   de conexión en entornos serverless — exactamente el 500 que se observa.
    //
    // Por qué SÍ funciona este patrón:
    //   Si dos requests simultáneos generan el mismo quotationNumber, la unique
    //   constraint (campo quotationNumber en schema) rechaza el segundo con P2002.
    //   El catch atrapa P2002, reintenta y el COUNT ahora devuelve N+1 (el primero
    //   ya confirmó), por lo que el reintento obtiene un número distinto.
    //   En la práctica con carga normal (< 10 req/s) el primer intento siempre
    //   funciona. Solo bajo ráfagas extremas ocurre 1 reintento.
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

          const newQuotationNumber = `${datePrefix}${(todayCount + 1).toString().padStart(2, '0')}`;

          // Crear la cotización SIN ventanas primero
          const quotation = await tx.quotation.create({
            data: {
              quotationNumber: newQuotationNumber,
              project,
              price_per_m2,
              clientId,
              include_iva: !!include_iva,
              total_price: totalQuotationPrice,
              userId: user.id,
              notes: notes || null,
              reference_image_url: reference_image_url || null,
            },
          });

          // Crear ventanas una por una secuencialmente para garantizar
          // que los IDs auto-increment sigan el orden del array.
          // createMany / nested create NO garantizan esto en PostgreSQL.
          for (const win of windowsData) {
            await tx.quotationWindow.create({
              data: { ...win, quotation_id: quotation.id },
            });
          }

          // Recargar con includes y orderBy para la respuesta
          return tx.quotation.findUnique({
            where: { id: quotation.id },
            include: { quotation_windows: { orderBy: { id: 'asc' } } },
          });
        });

        return result;
      } catch (err) {
        const isUniqueConflict = err?.code === 'P2002';
        if (isUniqueConflict && attempt < MAX_RETRIES - 1) {
          // Otro request confirmó con el mismo número justo antes.
          // Reintentamos: el COUNT será mayor y obtendremos un número distinto.
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
  // Paginado para evitar descargas masivas con el crecimiento de datos.
  // Defaults: página 1, 50 registros por página.

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

    // No permitir editar una cotización confirmada directamente
    // (debe pasar por reopen primero)
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

    return this.prisma.$transaction(async (prisma) => {
      const existingQuotation = await prisma.quotation.findUnique({
        where: { id },
        include: { quotation_windows: true },
      });
      if (!existingQuotation)
        throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);

      const globalPriceForCalc =
        quotationData.price_per_m2 ?? existingQuotation.price_per_m2;
      const shouldIncludeIva =
        quotationData.include_iva ?? existingQuotation.include_iva ?? false;
      let subTotalAcumulado = 0;

      // Eliminar TODAS las ventanas existentes de esta cotización
      await prisma.quotationWindow.deleteMany({
        where: { quotation_id: id },
      });

      // Recrear TODAS en el orden exacto que vienen del frontend
      // IMPORTANTE: usar inserts secuenciales (for...of) en vez de createMany
      // porque createMany genera un solo INSERT con múltiples VALUES y
      // PostgreSQL/Neon NO garantiza que los IDs auto-increment sigan el
      // orden de las filas en el VALUES — puede asignarlos en cualquier orden.
      // Con inserts secuenciales cada create obtiene el siguiente ID en orden.
      if (windows && windows.length > 0) {
        for (const win of windows) {
          const widthInM = win.width_m || 0;
          const heightInM = win.height_m || 0;
          const quantity = win.quantity || 1;
          const priceToUse = win.price_per_m2 || globalPriceForCalc;
          const windowPriceTotal = widthInM * heightInM * priceToUse * quantity;
          subTotalAcumulado += windowPriceTotal;
          await prisma.quotationWindow.create({
            data: {
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
            },
          });
        }
      }

      const totalFinalCalculado = shouldIncludeIva
        ? subTotalAcumulado * 1.12
        : subTotalAcumulado;

      return prisma.quotation.update({
        where: { id },
        data: {
          ...quotationData,
          include_iva: shouldIncludeIva,
          total_price: totalFinalCalculado,
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
  // Devuelve la cotización a estado en_proceso para poder editarla.
  // El pedido vinculado queda intacto hasta que se re-confirme.
  // Solo ADMIN puede reabrir.

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

    // Cambiar status a en_proceso — el pedido sigue existiendo y vinculado
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
  // Primera confirmación: crea el pedido.
  // Re-confirmación (ya tenía generatedOrder): actualiza el pedido existente.

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

    // Cargar cotización con pedido vinculado para saber si es primera vez o re-confirmación
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

    // Solo se puede confirmar cuando está en_proceso (primera vez o tras reabrir)
    if (quotation.status === QuotationStatus.confirmado) {
      throw new BadRequestException(
        `La cotización #${id} ya está confirmada. Usa "Reabrir" para modificarla.`,
      );
    }

    const existingOrderId = quotation.generatedOrder?.id ?? undefined;

    // No se valida traslape: se permiten múltiples instalaciones el mismo día.

    // ── Pre-calcular medidas FUERA de la transaction ──────────────────────────
    // UN solo query para todos los cálculos (elimina N+1).
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
        // Sin fórmula de cálculo → dimensiones sin transformar
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
        // ── RE-CONFIRMACIÓN: actualizar pedido existente ──────────────────────
        // 1. Borrar todas las ventanas actuales del pedido
        await prisma.window.deleteMany({
          where: { order_id: existingOrderId },
        });

        // 2. Recrear ventanas con los datos actualizados de la cotización
        await prisma.window.createMany({
          data: windowsToCreate.map((w) => ({
            ...w,
            order_id: existingOrderId,
          })),
        });

        // 3. Actualizar campos del pedido (total, fechas, include_iva, notes)
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
        // ── PRIMERA CONFIRMACIÓN: crear pedido nuevo ──────────────────────────
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

      // Marcar cotización como confirmada y vincular al pedido
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

    // Vendedores no pueden eliminar cotizaciones con pedido asociado
    if (quotation.generatedOrder && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'No puedes eliminar una cotización con pedido asociado. Contacta al administrador.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (quotation.generatedOrder) {
        const orderId = quotation.generatedOrder.id;
        // Windows no tienen onDelete:Cascade → eliminar explícitamente
        await tx.window.deleteMany({ where: { order_id: orderId } });
        // Checklists sí tienen cascade, se eliminan automáticamente con el pedido
        await tx.order.delete({ where: { id: orderId } });
      }
      // QuotationWindows tienen onDelete:Cascade → se eliminan automáticamente
      return tx.quotation.delete({ where: { id } });
    });
  }
}
