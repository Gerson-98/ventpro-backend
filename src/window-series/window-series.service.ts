// RUTA: src/window-series/window-series.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowSeriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.windowSeries.findMany({
      orderBy: { sort_order: 'asc' },
      include: {
        categories: {
          orderBy: { sort_order: 'asc' },
          include: { category: true },
        },
      },
    });
  }

  async create(data: {
    name: string;
    displayName?: string;
    sort_order?: number;
    active?: boolean;
  }) {
    try {
      return await this.prisma.windowSeries.create({ data });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Ya existe una serie con el nombre "${data.name}".`);
      }
      throw err;
    }
  }

  async update(
    id: number,
    data: {
      name?: string;
      displayName?: string | null;
      sort_order?: number;
      active?: boolean;
    },
  ) {
    try {
      return await this.prisma.windowSeries.update({ where: { id }, data });
    } catch (err) {
      if (err?.code === 'P2025') throw new NotFoundException(`Serie #${id} no encontrada.`);
      if (err?.code === 'P2002') throw new ConflictException(`Ya existe una serie con ese nombre.`);
      throw err;
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.windowSeries.delete({ where: { id } });
    } catch (err) {
      if (err?.code === 'P2025') throw new NotFoundException(`Serie #${id} no encontrada.`);
      throw err;
    }
  }

  // ─── Gestión de vínculos Serie ↔ Categoría ──────────────────────────────

  async linkCategory(seriesId: number, categoryId: number, sort_order = 0) {
    try {
      return await this.prisma.seriesCategory.create({
        data: { series_id: seriesId, category_id: categoryId, sort_order },
        include: { category: true },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Esa categoría ya está vinculada a esta serie.');
      }
      if (err?.code === 'P2003') {
        throw new NotFoundException('Serie o categoría no encontrada.');
      }
      throw err;
    }
  }

  async unlinkCategory(seriesId: number, categoryId: number) {
    const link = await this.prisma.seriesCategory.findFirst({
      where: { series_id: seriesId, category_id: categoryId },
    });
    if (!link) throw new NotFoundException('El vínculo no existe.');
    return this.prisma.seriesCategory.delete({ where: { id: link.id } });
  }
}
