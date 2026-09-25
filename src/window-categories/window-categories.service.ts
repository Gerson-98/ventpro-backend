// RUTA: src/window-categories/window-categories.service.ts

import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
    const category = await this.prisma.windowCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Categoría #${id} no encontrada.`);

    const tiposUsando = await this.prisma.windowType.count({ where: { category_id: id } });
    if (tiposUsando > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${category.name}" porque ${tiposUsando} tipo(s) de ventana la usan. ` +
          `Cámbiales la categoría desde el asistente antes de eliminarla.`,
      );
    }

    try {
      return await this.prisma.windowCategory.delete({ where: { id } });
    } catch (err) {
      if (err?.code === 'P2025') throw new NotFoundException(`Categoría #${id} no encontrada.`);
      throw err;
    }
  }
}
