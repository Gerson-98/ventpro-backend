import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowTypesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    displayName?: string;
    description?: string;
    pvcColorIds?: number[];
    series_id?: number | null;
    category_id?: number | null;
  }) {
    const { name, displayName, description, pvcColorIds = [], series_id, category_id } = data;

    return this.prisma.$transaction(async (tx) => {
      const newWindowType = await tx.windowType.create({
        data: {
          name,
          displayName: displayName || null,
          description,
          series_id: series_id ?? null,
          category_id: category_id ?? null,
        },
      });

      if (pvcColorIds.length > 0) {
        const linksData = pvcColorIds.map((colorId) => ({
          window_type_id: newWindowType.id,
          pvcColor_id: Number(colorId),
        }));
        await tx.windowTypePvcColor.createMany({ data: linksData });
      }

      return newWindowType;
    });
  }

  async findAll() {
    const types = await this.prisma.windowType.findMany({
      orderBy: { id: 'asc' },
      include: {
        pvcLinks: { include: { pvcColor: true } },
        series: true,
        category: true,
      },
    });
    // Aplana pvcLinks[].pvcColor → pvcColors[] para que el frontend no tenga que conocer la tabla join
    return types.map(({ pvcLinks, ...t }) => ({
      ...t,
      pvcColors: pvcLinks.map((l) => l.pvcColor),
    }));
  }

  findOne(id: number) {
    return this.prisma.windowType.findUnique({ where: { id } });
  }

  update(
    id: number,
    data: {
      name?: string;
      displayName?: string | null;
      description?: string;
      series_id?: number | null;
      category_id?: number | null;
    },
  ) {
    return this.prisma.windowType.update({ where: { id }, data });
  }

  async findByPvcColor(colorId: number) {
    return this.prisma.windowType.findMany({
      where: { pvcLinks: { some: { pvcColor_id: colorId } } },
      orderBy: { id: 'asc' },
    });
  }

  remove(id: number) {
    return this.prisma.windowType.delete({ where: { id } });
  }

  // ─── Nuevo endpoint para el modal de cotización ──────────────────────────
  // Devuelve el árbol completo Series → Categorías → WindowTypes, incluyendo
  // los pvcColors de cada tipo para que el modal pueda filtrar colores.
  // Los tipos sin serie (series_id = NULL) se agrupan al final bajo un
  // bucket especial id=null para que no desaparezcan del selector.
  async getModalStructure() {
    const allSeries = await this.prisma.windowSeries.findMany({
      where: { active: true },
      orderBy: { sort_order: 'asc' },
      include: {
        categories: {
          orderBy: { sort_order: 'asc' },
          include: { category: true },
        },
      },
    });

    const allTypes = await this.prisma.windowType.findMany({
      orderBy: { id: 'asc' },
      include: { pvcLinks: { include: { pvcColor: true } } },
    });

    // Construir mapa (series_id, category_id) → windowTypes[]
    const typeMap = new Map<string, any[]>();
    const unclassified: any[] = [];

    for (const t of allTypes) {
      const flat = {
        ...t,
        pvcColors: t.pvcLinks.map((l) => l.pvcColor),
        pvcLinks: undefined,
      };
      if (t.series_id == null || t.category_id == null) {
        unclassified.push(flat);
      } else {
        const key = `${t.series_id}_${t.category_id}`;
        if (!typeMap.has(key)) typeMap.set(key, []);
        typeMap.get(key)!.push(flat);
      }
    }

    const tree = allSeries.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      sort_order: s.sort_order,
      active: s.active,
      categories: s.categories.map((sc) => ({
        id: sc.category.id,
        name: sc.category.name,
        displayName: sc.category.displayName,
        sort_order: sc.category.sort_order,
        windowTypes: typeMap.get(`${s.id}_${sc.category.id}`) ?? [],
      })),
    }));

    // Devolver estructura explícita: series clasificadas + bucket opcional para
    // tipos sin serie/categoría. El frontend usa { series, unclassified }.
    return {
      series: tree,
      unclassified: unclassified.length > 0 ? { windowTypes: unclassified } : undefined,
    };
  }
}
