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
  }) {
    const { name, displayName, description, pvcColorIds = [] } = data;

    return this.prisma.$transaction(async (tx) => {
      const newWindowType = await tx.windowType.create({
        data: { name, displayName: displayName || null, description },
      });

      if (pvcColorIds.length > 0) {
        const linksData = pvcColorIds.map((colorId) => ({
          window_type_id: newWindowType.id,
          pvcColor_id: Number(colorId),
        }));
        // CAMBIO: window_types_pvcColor -> windowTypePvcColor
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
      },
    });
    // Aplana pvcLinks[].pvcColor → pvcColors[] para que el frontend no tenga que conocer la tabla join
    return types.map(({ pvcLinks, ...t }) => ({
      ...t,
      pvcColors: pvcLinks.map((l) => l.pvcColor),
    }));
  }

  findOne(id: number) {
    // CAMBIO: window_types -> windowType
    return this.prisma.windowType.findUnique({ where: { id } });
  }

  update(id: number, data: { name?: string; displayName?: string | null; description?: string }) {
    return this.prisma.windowType.update({ where: { id }, data });
  }

  async findByPvcColor(colorId: number) {
    // CAMBIO: window_types -> windowType
    return this.prisma.windowType.findMany({
      where: { pvcLinks: { some: { pvcColor_id: colorId } } },
      orderBy: { id: 'asc' },
    });
  }

  remove(id: number) {
    // CAMBIO: window_types -> windowType
    return this.prisma.windowType.delete({ where: { id } });
  }
}
