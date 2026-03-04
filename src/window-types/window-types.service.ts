import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowTypesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    pvcColorIds?: number[];
  }) {
    const { name, description, pvcColorIds = [] } = data;

    return this.prisma.$transaction(async (tx) => {
      // CAMBIO: window_types -> windowType
      const newWindowType = await tx.windowType.create({
        data: { name, description },
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

  findAll() {
    return this.prisma.windowType.findMany({
      orderBy: { id: 'asc' },
      include: {
        pvcLinks: {
          include: { pvcColor: true },
        },
      },
    });
  }

  findOne(id: number) {
    // CAMBIO: window_types -> windowType
    return this.prisma.windowType.findUnique({ where: { id } });
  }

  update(id: number, data: { name?: string; description?: string }) {
    // CAMBIO: window_types -> windowType
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
