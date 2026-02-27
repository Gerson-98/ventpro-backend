// RUTA: src/checklists/checklists.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChecklistType } from '@prisma/client';

interface AuthUser {
  id: number;
  name: string;
  role: string;
}

@Injectable()
export class ChecklistsService {
  constructor(private prisma: PrismaService) {}

  // ─── TEMPLATES (admin) ────────────────────────────────────────────────────

  findAllTemplates() {
    return this.prisma.checklistTemplate.findMany({
      orderBy: [{ type: 'asc' }, { sort_order: 'asc' }],
    });
  }

  findTemplatesByType(type: ChecklistType) {
    return this.prisma.checklistTemplate.findMany({
      where: { type, active: true },
      orderBy: { sort_order: 'asc' },
    });
  }

  createTemplate(data: {
    type: ChecklistType;
    label: string;
    sort_order?: number;
  }) {
    return this.prisma.checklistTemplate.create({
      data: {
        type: data.type,
        label: data.label,
        sort_order: data.sort_order ?? 0,
      },
    });
  }

  updateTemplate(
    id: number,
    data: { label?: string; sort_order?: number; active?: boolean },
  ) {
    return this.prisma.checklistTemplate.update({
      where: { id },
      data,
    });
  }

  removeTemplate(id: number) {
    return this.prisma.checklistTemplate.delete({ where: { id } });
  }

  // ─── CHECKLISTS (instancias por pedido) ───────────────────────────────────

  // Obtener todos los checklists de un pedido
  async findByOrder(orderId: number) {
    const checklists = await this.prisma.checklist.findMany({
      where: { order_id: orderId },
      include: {
        completedBy: { select: { id: true, name: true } },
        items: { orderBy: { id: 'asc' } },
      },
      orderBy: { completedAt: 'asc' },
    });

    // Para cada tipo, verificar si existe o traer los templates pendientes
    const types: ChecklistType[] = [
      'carga_camion',
      'verificacion_instalacion',
      'regreso',
    ];

    const result = await Promise.all(
      types.map(async (type) => {
        const completed = checklists.find((c) => c.type === type) || null;
        const templates = await this.findTemplatesByType(type);
        return { type, completed, templates };
      }),
    );

    return result;
  }

  // Completar un checklist
  async complete(
    orderId: number,
    type: ChecklistType,
    data: {
      items: { templateId: number; label: string; checked: boolean }[];
      notes?: string;
    },
    user: AuthUser,
  ) {
    // Verificar que el pedido existe
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);

    // Verificar que no esté ya completado
    const existing = await this.prisma.checklist.findUnique({
      where: { order_id_type: { order_id: orderId, type } },
    });
    if (existing) {
      throw new ConflictException(
        `El checklist "${type}" ya fue completado para este pedido`,
      );
    }

    return this.prisma.checklist.create({
      data: {
        type,
        order_id: orderId,
        completed_by_id: user.id,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            template_id: item.templateId,
            label: item.label,
            checked: item.checked,
          })),
        },
      },
      include: {
        completedBy: { select: { id: true, name: true } },
        items: true,
      },
    });
  }

  // Eliminar un checklist (para permitir rehacerlo)
  async remove(orderId: number, type: ChecklistType) {
    const existing = await this.prisma.checklist.findUnique({
      where: { order_id_type: { order_id: orderId, type } },
    });
    if (!existing) throw new NotFoundException(`Checklist no encontrado`);

    return this.prisma.checklist.delete({
      where: { order_id_type: { order_id: orderId, type } },
    });
  }
}
