import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WindowCalculationsService {
  constructor(private prisma: PrismaService) {}

  async findAllTypesWithCalculations() {
    // CAMBIO: window_types -> windowType
    return this.prisma.windowType.findMany({
      include: { calculation: true },
      orderBy: { name: 'asc' },
    });
  }

  async upsert(data: any) {
    const { window_type_id, ...calcData } = data;
    // CAMBIO: window_calculations -> windowCalculation
    return this.prisma.windowCalculation.upsert({
      where: { window_type_id: Number(window_type_id) },
      update: { ...calcData },
      create: { window_type_id: Number(window_type_id), ...calcData },
    });
  }
}
