import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateOrderDto,
  RescheduleOrderDto,
  UpdateOrderStatusDto,
} from './dto/update-order.dto';
import { OrderStatus, QuotationStatus } from '@prisma/client';

interface AuthUser {
  id: number;
  name: string;
  role: string;
}

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private isAdmin(user: AuthUser): boolean {
    return user.role === 'ADMIN';
  }

  // ─── Validar traslape de fechas ───────────────────────────────────────────
  private async assertNoDateOverlap(
    startDate: Date,
    endDate: Date,
    excludeOrderId?: number,
  ): Promise<void> {
    const conflictingOrder = await this.prisma.order.findFirst({
      where: {
        status: { not: OrderStatus.cancelado },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
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

  // ─── create ──────────────────────────────────────────────────────────────
  create(data: {
    project: string;
    clientId: number;
    total: number;
    status?: string;
    generatedFromQuotationId?: number;
  }) {
    return this.prisma.order.create({
      data: {
        project: data.project,
        total: Number(data.total),
        status: OrderStatus.en_proceso,
        client: { connect: { id: Number(data.clientId) } },
        ...(data.generatedFromQuotationId && {
          generatedFromQuotation: {
            connect: { id: Number(data.generatedFromQuotationId) },
          },
        }),
      },
      include: {
        client: true,
        windows: true,
        generatedFromQuotation: true,
      },
    });
  }

  // ─── findAll ──────────────────────────────────────────────────────────────
  // Admin: todos los pedidos
  // Vendedor: solo los pedidos generados desde sus cotizaciones
  findAll(user: AuthUser) {
    const whereClause = this.isAdmin(user)
      ? {}
      : {
          generatedFromQuotation: {
            userId: user.id,
          },
        };

    return this.prisma.order.findMany({
      where: whereClause,
      include: {
        client: true,
        _count: { select: { windows: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  // ─── findOne ──────────────────────────────────────────────────────────────
  findOne(id: number) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        client: true,
        generatedFromQuotation: true,
        windows: {
          include: {
            windowType: true,
            pvcColor: true,
            glassColor: true,
          },
        },
      },
    });
  }

  // ─── update ───────────────────────────────────────────────────────────────
  update(
    id: number,
    data: {
      project?: string;
      total?: number;
      status?: string;
      include_iva?: boolean;
    },
  ) {
    let statusEnum: OrderStatus | undefined;
    if (data.status) {
      const key = data.status as keyof typeof OrderStatus;
      statusEnum = OrderStatus[key];
      if (!statusEnum) throw new BadRequestException('Estado no válido');
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        project: data.project,
        total: data.total ? Number(data.total) : undefined,
        status: statusEnum,
        include_iva: data.include_iva,
      },
      include: {
        client: true,
        windows: { include: { pvcColor: true, glassColor: true } },
        generatedFromQuotation: true,
      },
    });
  }

  // ─── remove ───────────────────────────────────────────────────────────────
  remove(id: number) {
    return this.prisma.order.delete({ where: { id } });
  }

  // ─── findScheduled ────────────────────────────────────────────────────────
  // Admin: todos los pedidos agendados (calendario completo)
  // Vendedor: solo sus pedidos agendados
  async findScheduled(user: AuthUser) {
    const whereClause = this.isAdmin(user)
      ? {
          installationStartDate: { not: null },
          status: { not: OrderStatus.cancelado },
        }
      : {
          installationStartDate: { not: null },
          status: { not: OrderStatus.cancelado },
          generatedFromQuotation: {
            userId: user.id,
          },
        };

    return this.prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        project: true,
        installationStartDate: true,
        installationEndDate: true,
        status: true,
      },
      orderBy: { installationStartDate: 'asc' },
    });
  }

  // ─── updateOrderTotal ─────────────────────────────────────────────────────
  async updateOrderTotal(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { windows: true },
    });
    if (!order) return;

    const newTotal = order.windows.reduce(
      (sum, win) => sum + (Number(win.price) || 0),
      0,
    );
    return this.prisma.order.update({
      where: { id: orderId },
      data: { total: newTotal },
    });
  }

  // ─── reschedule ───────────────────────────────────────────────────────────
  async reschedule(id: number, rescheduleOrderDto: RescheduleOrderDto) {
    const { installationStartDate, installationEndDate } = rescheduleOrderDto;

    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order)
      throw new NotFoundException(`Pedido con ID #${id} no encontrado.`);

    const startDate = new Date(installationStartDate);
    const endDate = new Date(installationEndDate);

    await this.assertNoDateOverlap(startDate, endDate, id);

    return this.prisma.order.update({
      where: { id },
      data: {
        installationStartDate: startDate,
        installationEndDate: endDate,
      },
    });
  }

  // ─── updateStatus ─────────────────────────────────────────────────────────
  async updateStatus(id: number, updateOrderStatusDto: UpdateOrderStatusDto) {
    const newStatus = updateOrderStatusDto.status as keyof typeof OrderStatus;
    const statusEnum = OrderStatus[newStatus];
    if (!statusEnum) throw new BadRequestException('Estado no válido');

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { generatedFromQuotationId: true },
    });
    if (!order)
      throw new NotFoundException(`Pedido con ID #${id} no encontrado.`);

    if (
      statusEnum === OrderStatus.cancelado &&
      order.generatedFromQuotationId
    ) {
      return this.prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id },
          data: { status: statusEnum },
        });

        await tx.quotation.update({
          where: { id: order.generatedFromQuotationId! },
          data: {
            status: QuotationStatus.en_proceso,
            generatedOrder: { disconnect: true },
          },
        });

        return updatedOrder;
      });
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: statusEnum },
      include: {
        client: true,
        generatedFromQuotation: true,
        windows: true,
      },
    });
  }
}
