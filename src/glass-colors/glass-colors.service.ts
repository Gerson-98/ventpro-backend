import { Injectable } from '@nestjs/common';
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

  remove(id: number) {
    return this.prisma.glassColor.delete({ where: { id } });
  }
}
