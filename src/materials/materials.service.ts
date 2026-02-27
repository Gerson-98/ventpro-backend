import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialType } from '@prisma/client';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(private prisma: PrismaService) {}

  findAll(type?: MaterialType) {
    return this.prisma.material.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException(`Material #${id} no encontrado`);
    return material;
  }

  async create(dto: CreateMaterialDto) {
    const exists = await this.prisma.material.findUnique({
      where: { name: dto.name },
    });
    if (exists)
      throw new ConflictException(
        `Ya existe un material con el nombre "${dto.name}"`,
      );
    return this.prisma.material.create({ data: dto });
  }

  async update(id: number, dto: UpdateMaterialDto) {
    await this.findOne(id);
    if (dto.name) {
      const conflict = await this.prisma.material.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict)
        throw new ConflictException(
          `Ya existe un material con el nombre "${dto.name}"`,
        );
    }
    return this.prisma.material.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.material.delete({ where: { id } });
  }
}
