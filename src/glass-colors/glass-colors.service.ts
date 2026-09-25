import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GlassColorsService {
  constructor(private prisma: PrismaService) {}

  create(data: { name: string; description?: string }) {
    return this.prisma.glassColor.create({ data });
  }

  findAll() {
    return this.prisma.glassColor.findMany();
  }

  findOne(id: number) {
    return this.prisma.glassColor.findUnique({ where: { id } });
  }

  update(id: number, data: { name?: string; description?: string }) {
    return this.prisma.glassColor.update({ where: { id }, data });
  }

  async remove(id: number) {
    const color = await this.prisma.glassColor.findUnique({ where: { id } });
    if (!color) throw new NotFoundException(`Tipo de vidrio #${id} no encontrado`);

    const windowsUsing = await this.prisma.window.count({ where: { glass_color_id: id } });
    const quotationsUsing = await this.prisma.quotationWindow.count({ where: { glass_color_id: id } });
    if (windowsUsing > 0 || quotationsUsing > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${color.name}" porque ya se usó en ${windowsUsing + quotationsUsing} cotización(es) existente(s). ` +
          `Para no alterar el historial, este tipo de vidrio no se puede borrar.`,
      );
    }

    return this.prisma.glassColor.delete({ where: { id } });
  }
}
