// RUTA: src/window-categories/window-categories.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowCategoriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.windowCategory.findMany({
      orderBy: { sort_order: 'asc' },
    });
  }

  async create(data: {
    name: string;
    displayName?: string;
    sort_order?: number;
    active?: boolean;
  }) {
    try {
      return await this.prisma.windowCategory.create({ data });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Ya existe una categoría con el nombre "${data.name}".`);
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
      return await this.prisma.windowCategory.update({ where: { id }, data });
    } catch (err) {
      if (err?.code === 'P2025') throw new NotFoundException(`Categoría #${id} no encontrada.`);
      if (err?.code === 'P2002') throw new ConflictException('Ya existe una categoría con ese nombre.');
      throw err;
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.windowCategory.delete({ where: { id } });
    } catch (err) {
      if (err?.code === 'P2025') throw new NotFoundException(`Categoría #${id} no encontrada.`);
      throw err;
    }
  }
}
