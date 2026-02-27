import { Injectable } from '@nestjs/common';
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

  remove(id: number) {
    return this.prisma.pvcColor.delete({ where: { id } });
  }
}
