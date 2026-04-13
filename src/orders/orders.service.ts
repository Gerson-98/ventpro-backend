import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

  private async assertOwnership(
    orderId: number,
    user: AuthUser,
  ): Promise<void> {
    if (this.isAdmin(user)) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        generatedFromQuotation: {
          select: { userId: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(`Pedido #${orderId} no encontrado.`);
    }
    if (order.generatedFromQuotation?.userId !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para modificar este pedido.',
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
  async findAll(
    user: AuthUser,
    page = 1,
    limit = 50,
    filters: { search?: string; status?: string; month?: string } = {},
  ) {
    const safeLimit = Math.min(limit, 100);
    const skip = (page - 1) * safeLimit;

    const ownershipClause = this.isAdmin(user)
      ? {}
      : { generatedFromQuotation: { userId: user.id } };

    const statusClause =
      filters.status && filters.status !== 'todos'
        ? { status: filters.status as OrderStatus }
        : {};

    let monthClause: object = {};
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      monthClause = { createdAt: { gte: start, lt: end } };
    }

    const searchClause =
      filters.search && filters.search.trim()
        ? {
            OR: [
              {
                project: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                client: {
                  name: {
                    contains: filters.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                generatedFromQuotation: {
                  user: {
                    name: {
                      contains: filters.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ],
          }
        : {};

    const whereClause = {
      ...ownershipClause,
      ...statusClause,
      ...monthClause,
      ...searchClause,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: whereClause,
        include: {
          client: true,
          _count: { select: { windows: true } },
          generatedFromQuotation: {
            select: {
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { id: 'desc' },
        take: safeLimit,
        skip,
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    return {
      data,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ─── findOne ──────────────────────────────────────────────────────────────
  async findOne(id: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
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
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException(`Pedido #${id} no encontrado.`);
    if (
      !this.isAdmin(user) &&
      order.generatedFromQuotation?.userId !== user.id
    ) {
      throw new ForbiddenException('No tienes permiso para ver este pedido.');
    }
    return order;
  }

  // ─── update ───────────────────────────────────────────────────────────────
  // Implementa optimistic locking usando el campo `version`.
  // Si dos usuarios editan el mismo pedido simultáneamente, el segundo
  // recibirá un error 409 Conflict en lugar de sobreescribir silenciosamente.
  async update(
    id: number,
    data: {
      project?: string;
      total?: number;
      status?: string;
      include_iva?: boolean;
      version?: number;
    },
    user: AuthUser,
  ) {
    await this.assertOwnership(id, user);

    let statusEnum: OrderStatus | undefined;
    if (data.status) {
      const key = data.status as keyof typeof OrderStatus;
      statusEnum = OrderStatus[key];
      if (!statusEnum) throw new BadRequestException('Estado no válido');
    }

    // Si se envía version, verificar que nadie más haya modificado el pedido
    if (data.version !== undefined) {
      const current = await this.prisma.order.findUnique({
        where: { id },
        select: { version: true },
      });

      if (!current) {
        throw new NotFoundException(`Pedido #${id} no encontrado.`);
      }

      if (current.version !== data.version) {
        throw new ConflictException(
          'Este pedido fue modificado por otro usuario. Recarga la página para ver los cambios más recientes.',
        );
      }
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        project: data.project,
        total: data.total ? Number(data.total) : undefined,
        status: statusEnum,
        include_iva: data.include_iva,
        // Incrementa version en cada actualización
        version: { increment: 1 },
      },
      include: {
        client: true,
        windows: { include: { pvcColor: true, glassColor: true } },
        generatedFromQuotation: true,
      },
    });
  }

  // ─── remove ───────────────────────────────────────────────────────────────
  async remove(id: number, user: AuthUser) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException(
        'Solo un administrador puede eliminar pedidos',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException(`Pedido #${id} no encontrado`);
    }

    return this.prisma.order.delete({ where: { id } });
  }

  // ─── findScheduled ────────────────────────────────────────────────────────
  // Admin: todos los pedidos agendados (calendario completo)
  // Vendedor: solo sus pedidos agendados
  async findScheduled(user: AuthUser) {
    return this.prisma.order.findMany({
      where: {
        installationStartDate: { not: null },
        status: { not: OrderStatus.cancelado },
      },
      select: {
        id: true,
        project: true,
        installationStartDate: true,
        installationEndDate: true,
        status: true,
        client: {
          select: { name: true },
        },
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
  async reschedule(
    id: number,
    rescheduleOrderDto: RescheduleOrderDto,
    user: AuthUser,
  ) {
    await this.assertOwnership(id, user);

    const { installationStartDate, installationEndDate } = rescheduleOrderDto;

    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order)
      throw new NotFoundException(`Pedido con ID #${id} no encontrado.`);

    const startDate = new Date(installationStartDate);
    const endDate = new Date(installationEndDate);

    return this.prisma.order.update({
      where: { id },
      data: {
        installationStartDate: startDate,
        installationEndDate: endDate,
      },
    });
  }

  // ─── updateStatus ─────────────────────────────────────────────────────────
  async updateStatus(
    id: number,
    updateOrderStatusDto: UpdateOrderStatusDto,
    user: AuthUser,
  ) {
    await this.assertOwnership(id, user);

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
