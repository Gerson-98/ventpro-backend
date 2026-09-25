import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PvcColorsService {
  constructor(private prisma: PrismaService) {}

  create(data: { name: string; description?: string }) {
    return this.prisma.pvcColor.create({ data });
  }

  findAll() {
    return this.prisma.pvcColor.findMany();
  }

  findOne(id: number) {
    return this.prisma.pvcColor.findUnique({ where: { id } });
  }

  update(id: number, data: { name?: string; description?: string }) {
    return this.prisma.pvcColor.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    const color = await this.prisma.pvcColor.findUnique({ where: { id } });
    if (!color) throw new NotFoundException(`Color PVC #${id} no encontrado`);

    const typeLinks = await this.prisma.windowTypePvcColor.count({ where: { pvcColor_id: id } });
    if (typeLinks > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${color.name}" porque está disponible en ${typeLinks} tipo(s) de ventana. ` +
          `Quítaselo primero a esos tipos desde el asistente.`,
      );
    }

    const windowsUsing = await this.prisma.window.count({ where: { color_id: id } });
    const quotationsUsing = await this.prisma.quotationWindow.count({ where: { color_id: id } });
    if (windowsUsing > 0 || quotationsUsing > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${color.name}" porque ya se usó en ${windowsUsing + quotationsUsing} cotización(es) existente(s). ` +
          `Para no alterar el historial, este color no se puede borrar — puedes dejar de ofrecerlo quitándolo de los tipos de ventana.`,
      );
    }

    return this.prisma.pvcColor.delete({ where: { id } });
  }
}
