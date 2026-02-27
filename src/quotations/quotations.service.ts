import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

  // ─── Validar traslape de fechas ──────────────────────────────────────────────
  // Busca pedidos activos (no cancelados) cuyas fechas se crucen con el rango dado.
  private async assertNoDateOverlap(
    startDate: Date,
    endDate: Date,
    excludeOrderId?: number, // para cuando se reprograma un pedido existente
  ): Promise<void> {
    const conflictingOrder = await this.prisma.order.findFirst({
      where: {
        // Excluir pedidos cancelados
        status: { not: OrderStatus.cancelado },
        // Excluir el pedido actual si es una reprogramación
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        // Traslape: el pedido existente empieza antes de que termine el nuevo
        // Y termina después de que empieza el nuevo
        installationStartDate: { not: null },
        installationEndDate: { not: null },
        AND: [
          { installationStartDate: { lte: endDate } },
          { installationEndDate: { gte: startDate } },
        ],
      },
      select: {
        id: true,
        project: true,
        installationStartDate: true,
        installationEndDate: true,
      },
    });

    if (conflictingOrder) {
      const fmt = (d: Date) =>
        new Date(d).toLocaleDateString('es-GT', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      throw new BadRequestException(
        `Las fechas se cruzan con el pedido "${conflictingOrder.project}" ` +
          `(${fmt(conflictingOrder.installationStartDate!)} - ${fmt(conflictingOrder.installationEndDate!)}). ` +
          `Elige otras fechas.`,
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

    const todayCount = await this.prisma.quotation.count({
      where: {
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lt: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
    });

    const newQuotationNumber = `${datePrefix}${(todayCount + 1).toString().padStart(2, '0')}`;

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
        windowType: { connect: { id: win.window_type_id } },
        pvcColor: { connect: { id: win.color_id } },
        glassColor: { connect: { id: win.glass_color_id } },
      };
    });

    if (include_iva) totalQuotationPrice = totalQuotationPrice * 1.12;

    return this.prisma.quotation.create({
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
        quotation_windows: { create: windowsData },
      },
      include: { quotation_windows: true },
    });
  }

  // ─── findAll ─────────────────────────────────────────────────────────────────

  async findAll(user: AuthUser) {
    const whereClause = this.isAdmin(user) ? {} : { userId: user.id };

    return this.prisma.quotation.findMany({
      where: whereClause,
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── findOne ─────────────────────────────────────────────────────────────────

  async findOne(id: number, user: AuthUser) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        client: true,
        quotation_windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
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

      const existingWindowIds = existingQuotation.quotation_windows.map(
        (w) => w.id,
      );
      const incomingWindowIds =
        windows?.filter((w) => w.id).map((w) => w.id) || [];
      const windowsToDelete = existingWindowIds.filter(
        (id) => !incomingWindowIds.includes(id),
      );

      if (windowsToDelete.length > 0) {
        await prisma.quotationWindow.deleteMany({
          where: { id: { in: windowsToDelete } },
        });
      }

      for (const win of windows || []) {
        const widthInM = win.width_m || 0;
        const heightInM = win.height_m || 0;
        const quantity = win.quantity || 1;
        const priceToUse = win.price_per_m2 || globalPriceForCalc;
        const windowPriceTotal = widthInM * heightInM * priceToUse * quantity;
        subTotalAcumulado += windowPriceTotal;

        const windowData: any = {
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
        };
        if (win.design_image_url !== undefined)
          windowData.design_image_url = win.design_image_url;

        if (win.id) {
          await prisma.quotationWindow.update({
            where: { id: win.id },
            data: windowData,
          });
        } else {
          await prisma.quotationWindow.create({
            data: {
              ...windowData,
              quotation_id: id,
              design_image_url: win.design_image_url || null,
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
          },
        },
      });
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

    // ✅ Validar traslape ANTES de abrir la transacción
    await this.assertNoDateOverlap(startDate, endDate);

    return this.prisma.$transaction(async (prisma) => {
      const quotation = await prisma.quotation.findUnique({
        where: { id },
        include: { quotation_windows: true },
      });
      if (!quotation)
        throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);

      if (quotation.status === QuotationStatus.confirmado) {
        throw new BadRequestException(
          `La cotización #${id} ya ha sido confirmada.`,
        );
      }

      const windowsToCreate = await Promise.all(
        quotation.quotation_windows.map(async (win) => {
          const winOptions = (win as any).options || {};
          const { hojaAncho, hojaAlto, vidrioAncho, vidrioAlto } =
            await this.windowsService.calculateWindowMeasurements(
              win.window_type_id,
              win.width_cm,
              win.height_cm,
              winOptions,
            );
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
            hojaAncho,
            hojaAlto,
            vidrioAncho,
            vidrioAlto,
          };
        }),
      );

      const newOrder = await prisma.order.create({
        data: {
          project: quotation.project,
          total: quotation.total_price,
          status: OrderStatus.en_proceso,
          clientId: quotation.clientId,
          include_iva: quotation?.include_iva || false,
          generatedFromQuotationId: id,
          installationStartDate: startDate,
          installationEndDate: endDate,
          windows: { create: windowsToCreate },
        },
      });

      await prisma.quotation.update({
        where: { id: quotation.id },
        data: {
          status: QuotationStatus.confirmado,
          generatedOrder: { connect: { id: newOrder.id } },
        },
      });

      return newOrder;
    });
  }

  // ─── remove ──────────────────────────────────────────────────────────────────

  async remove(id: number, user: AuthUser) {
    await this.assertOwnership(id, user);

    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { generatedOrder: true },
    });
    if (!quotation)
      throw new NotFoundException(`Cotización con ID #${id} no encontrada.`);
    if (quotation.generatedOrder) {
      throw new BadRequestException(
        `No se puede eliminar. Esta cotización ya está confirmada y amarrada al Pedido #${quotation.generatedOrder.id}.`,
      );
    }
    return this.prisma.quotation.delete({ where: { id } });
  }
}
