import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessoryRuleDto } from './dto/create-accessory-rule.dto';
import { UpdateAccessoryRuleDto } from './dto/update-accessory-rule.dto';

const INCLUDE = {
  material: { select: { id: true, name: true, unit: true } },
  windowType: { select: { id: true, name: true } },
};

@Injectable()
export class AccessoryRulesService {
  constructor(private prisma: PrismaService) {}

  findAll(windowTypeId?: number) {
    return this.prisma.accessoryRule.findMany({
      where: windowTypeId ? { window_type_id: windowTypeId } : undefined,
      include: INCLUDE,
      orderBy: [
        { window_type_id: 'asc' },
        { option_group: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async findOne(id: number) {
    const rule = await this.prisma.accessoryRule.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!rule) throw new NotFoundException(`Regla #${id} no encontrada`);
    return rule;
  }

  create(dto: CreateAccessoryRuleDto) {
    return this.prisma.accessoryRule.create({ data: dto, include: INCLUDE });
  }

  async update(id: number, dto: UpdateAccessoryRuleDto) {
    await this.findOne(id);
    return this.prisma.accessoryRule.update({
      where: { id },
      data: dto,
      include: INCLUDE,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.accessoryRule.delete({ where: { id } });
  }
}
