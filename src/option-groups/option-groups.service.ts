import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';

@Injectable()
export class OptionGroupsService {
  constructor(private prisma: PrismaService) {}

  // Incluir valores en todas las respuestas
  private readonly INCLUDE = {
    values: {
      orderBy: { sort_order: 'asc' as const },
    },
  };

  findAll() {
    return this.prisma.optionGroup.findMany({
      include: this.INCLUDE,
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: number) {
    const group = await this.prisma.optionGroup.findUnique({
      where: { id },
      include: this.INCLUDE,
    });
    if (!group)
      throw new NotFoundException(`Grupo de opciones #${id} no encontrado`);
    return group;
  }

  async create(dto: CreateOptionGroupDto) {
    const exists = await this.prisma.optionGroup.findUnique({
      where: { key: dto.key },
    });
    if (exists)
      throw new ConflictException(`Ya existe un grupo con la key "${dto.key}"`);

    return this.prisma.optionGroup.create({
      data: dto,
      include: this.INCLUDE,
    });
  }

  async update(id: number, dto: UpdateOptionGroupDto) {
    await this.findOne(id);

    // Si se cambia el key, verificar que no exista otro con ese key
    if (dto.key) {
      const exists = await this.prisma.optionGroup.findFirst({
        where: { key: dto.key, NOT: { id } },
      });
      if (exists)
        throw new ConflictException(
          `Ya existe un grupo con la key "${dto.key}"`,
        );
    }

    return this.prisma.optionGroup.update({
      where: { id },
      data: dto,
      include: this.INCLUDE,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.optionGroup.delete({ where: { id } });
  }
}
