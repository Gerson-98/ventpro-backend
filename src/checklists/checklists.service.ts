// RUTA: src/checklists/checklists.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChecklistType } from '@prisma/client';
import { ReportsService } from '../reports/reports.service';

interface AuthUser {
  id: number;
  name: string;
  role: string;
}

// Ids negativos para ítems dinámicos (nunca chocan con un template_id real,
// que siempre es positivo por ser autoincrement) — así el frontend puede
// seguir usando el mismo "id" como key sin tener que distinguir el origen.
let dynamicIdCounter = 0;
function nextDynamicId(): number {
  dynamicIdCounter -= 1;
  return dynamicIdCounter;
}

@Injectable()
export class ChecklistsService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  // ── "Carga de Camión" es dinámico — SIEMPRE son los accesorios y
  // ventanas reales de ESE pedido, no una lista genérica que haya que
  // mantener a mano. Cada pedido lleva accesorios distintos (cantidades,
  // tipos), así que no tiene sentido un ChecklistTemplate fijo para esto.
  private async buildDynamicCargaCamionItems(
    orderId: number,
  ): Promise<{ id: number; label: string }[]> {
    const [materials, order] = await Promise.all([
      this.reportsService.generateProfilesReport(orderId).catch(() => []),
      this.prisma.order.findMany({
        where: { id: orderId },
        select: {
          windows: {
            select: {
              id: true,
              displayName: true,
              width_cm: true,
              height_cm: true,
              windowType: { select: { name: true } },
              pvcColor: { select: { name: true } },
              glassColor: { select: { name: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      }).then((r) => r[0]),
    ]);

    const accessoryItems = (materials as any[])
      .filter((m) => m.tipo === 'ACCESORIO')
      .map((m) => ({
        id: nextDynamicId(),
        label: `${m.nombre} — ${m.cantidad} ${m.unidad || 'unidad(es)'}${m.color ? ` (${m.color})` : ''}`,
      }));

    const windowItems = (order?.windows || []).map((w, i) => ({
      id: nextDynamicId(),
      label: `V${i + 1} — ${w.displayName || w.windowType?.name || 'Ventana'} · ${w.width_cm}×${w.height_cm} cm · ${w.pvcColor?.name || '—'}${w.glassColor ? ` · Vidrio ${w.glassColor.name}` : ''}`,
    }));

    return [...windowItems, ...accessoryItems];
  }

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
    // 2 queries en paralelo en vez de 4 queries secuenciales
    const [checklists, allTemplates] = await Promise.all([
      this.prisma.checklist.findMany({
        where: { order_id: orderId },
        include: {
          completedBy: { select: { id: true, name: true } },
          items: { orderBy: { id: 'asc' } },
        },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.checklistTemplate.findMany({
        where: { active: true },
        orderBy: { sort_order: 'asc' },
      }),
    ]);

    const types: ChecklistType[] = [
      'carga_camion',
      'verificacion_instalacion',
      'regreso',
    ];

    // Carga de Camión no usa templates configurados a mano — se arma solo
    // si todavía no se completó (si ya está completo, se muestra lo que
    // quedó guardado esa vez, no lo que el pedido tendría HOY).
    const cargaCamionCompleted = checklists.find((c) => c.type === 'carga_camion');
    const dynamicItems = cargaCamionCompleted
      ? []
      : await this.buildDynamicCargaCamionItems(orderId);

    return types.map((type) => ({
      type,
      completed: checklists.find((c) => c.type === type) || null,
      templates:
        type === 'carga_camion'
          ? dynamicItems
          : allTemplates.filter((t) => t.type === type),
    }));
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
            // ids negativos = ítem dinámico (accesorio/ventana del pedido),
            // no corresponde a ningún ChecklistTemplate real.
            template_id: item.templateId > 0 ? item.templateId : null,
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
