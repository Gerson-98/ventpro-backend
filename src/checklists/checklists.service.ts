// RUTA: src/checklists/checklists.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  // ── Categorías de checklist (antes: enum fijo ChecklistType) — el admin
  // puede crear las que necesite desde la UI, sin migraciones. `dynamic`
  // marca si la categoría SUMA ítems generados automáticamente del pedido
  // (ventanas + accesorios reales) a sus templates fijos.
  async resolveCategory(slug: string) {
    const category = await this.prisma.checklistCategory.findUnique({
      where: { slug },
    });
    if (!category) {
      throw new BadRequestException(`Categoría de checklist inválida: "${slug}"`);
    }
    return category;
  }

  findAllCategories() {
    return this.prisma.checklistCategory.findMany({
      orderBy: { sort_order: 'asc' },
    });
  }

  async createCategory(data: {
    slug: string;
    label: string;
    icon?: string;
    dynamic?: boolean;
    sort_order?: number;
  }) {
    const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!slug) throw new BadRequestException('El nombre de la categoría no puede quedar vacío.');
    const count = await this.prisma.checklistCategory.count();
    return this.prisma.checklistCategory.create({
      data: {
        slug,
        label: data.label.trim(),
        icon: data.icon?.trim() || '📋',
        dynamic: data.dynamic ?? false,
        sort_order: data.sort_order ?? count,
      },
    });
  }

  updateCategory(
    id: number,
    data: { label?: string; icon?: string; sort_order?: number; active?: boolean },
  ) {
    return this.prisma.checklistCategory.update({ where: { id }, data });
  }

  removeCategory(id: number) {
    // onDelete: Cascade en templates/checklists — borrar una categoría
    // se lleva sus ítems configurados y el historial de checklists hechos
    // con ella. Confirmación fuerte ya se pide en el frontend.
    return this.prisma.checklistCategory.delete({ where: { id } });
  }

  // ── "Carga de Camión" (y cualquier categoría dynamic=true) suma ítems
  // generados SIEMPRE desde el pedido real: sus ventanas (tipo, medidas,
  // color PVC, color de vidrio) y accesorios con cantidad exacta — nadie
  // los escribe a mano, cambian solo si cambia el pedido.
  private async buildDynamicItems(
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
      orderBy: [{ category_id: 'asc' }, { sort_order: 'asc' }],
    });
  }

  async createTemplate(data: {
    categorySlug: string;
    label: string;
    sort_order?: number;
  }) {
    const category = await this.resolveCategory(data.categorySlug);
    return this.prisma.checklistTemplate.create({
      data: {
        category_id: category.id,
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
    const [categories, checklists, allTemplates] = await Promise.all([
      this.prisma.checklistCategory.findMany({
        where: { active: true },
        orderBy: { sort_order: 'asc' },
      }),
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

    // Una sola consulta de ítems dinámicos — se reusa para todas las
    // categorías dynamic=true que todavía no estén completadas (en vez de
    // volver a calcular el reporte de materiales una vez por categoría).
    const needsDynamic = categories.some(
      (c) => c.dynamic && !checklists.find((ch) => ch.category_id === c.id),
    );
    const dynamicItems = needsDynamic ? await this.buildDynamicItems(orderId) : [];

    return categories.map((category) => {
      const completed = checklists.find((c) => c.category_id === category.id) || null;
      const fixedTemplates = allTemplates.filter((t) => t.category_id === category.id);
      const templates =
        category.dynamic && !completed
          ? [...dynamicItems, ...fixedTemplates]
          : fixedTemplates;
      return {
        type: category.slug,
        label: category.label,
        icon: category.icon,
        completed,
        templates,
      };
    });
  }

  // Completar un checklist
  async complete(
    orderId: number,
    categorySlug: string,
    data: {
      items: { templateId: number; label: string; checked: boolean }[];
      notes?: string;
    },
    user: AuthUser,
  ) {
    const category = await this.resolveCategory(categorySlug);

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);

    const existing = await this.prisma.checklist.findUnique({
      where: { order_id_category_id: { order_id: orderId, category_id: category.id } },
    });
    if (existing) {
      throw new ConflictException(
        `El checklist "${category.label}" ya fue completado para este pedido`,
      );
    }

    return this.prisma.checklist.create({
      data: {
        category_id: category.id,
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
  async remove(orderId: number, categorySlug: string) {
    const category = await this.resolveCategory(categorySlug);
    const existing = await this.prisma.checklist.findUnique({
      where: { order_id_category_id: { order_id: orderId, category_id: category.id } },
    });
    if (!existing) throw new NotFoundException(`Checklist no encontrado`);

    return this.prisma.checklist.delete({
      where: { order_id_category_id: { order_id: orderId, category_id: category.id } },
    });
  }
}
