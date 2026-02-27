import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWindowTypeOptionDto } from './dto/create-window-type-option.dto';
import { UpdateWindowTypeOptionDto } from './dto/update-window-type-option.dto';

@Injectable()
export class WindowTypeOptionsService {
  constructor(private prisma: PrismaService) {}

  private readonly INCLUDE = {
    windowType: { select: { id: true, name: true } },
    group: {
      include: {
        values: { orderBy: { sort_order: 'asc' as const } },
      },
    },
  };

  findAll() {
    return this.prisma.windowTypeOption.findMany({
      include: this.INCLUDE,
      orderBy: { sort_order: 'asc' },
    });
  }

  // Endpoint clave: dado un window_type_id, devuelve todos sus grupos con sus valores
  // El cotizador usa este endpoint para saber qué opciones mostrar
  findByWindowType(windowTypeId: number) {
    return this.prisma.windowTypeOption.findMany({
      where: { window_type_id: windowTypeId },
      include: this.INCLUDE,
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.windowTypeOption.findUnique({
      where: { id },
      include: this.INCLUDE,
    });
    if (!record) throw new NotFoundException(`Relación #${id} no encontrada`);
    return record;
  }

  async create(dto: CreateWindowTypeOptionDto) {
    // Verificar que el tipo de ventana existe
    const windowType = await this.prisma.windowType.findUnique({
      where: { id: dto.window_type_id },
    });
    if (!windowType)
      throw new NotFoundException(
        `Tipo de ventana #${dto.window_type_id} no encontrado`,
      );

    // Verificar que el grupo existe
    const group = await this.prisma.optionGroup.findUnique({
      where: { id: dto.group_id },
    });
    if (!group)
      throw new NotFoundException(`Grupo #${dto.group_id} no encontrado`);

    // Verificar que no está ya asignado
    const exists = await this.prisma.windowTypeOption.findUnique({
      where: {
        window_type_id_group_id: {
          window_type_id: dto.window_type_id,
          group_id: dto.group_id,
        },
      },
    });
    if (exists)
      throw new ConflictException(
        `El grupo "${group.label}" ya está asignado a este tipo de ventana`,
      );

    return this.prisma.windowTypeOption.create({
      data: dto,
      include: this.INCLUDE,
    });
  }

  async update(id: number, dto: UpdateWindowTypeOptionDto) {
    await this.findOne(id);
    return this.prisma.windowTypeOption.update({
      where: { id },
      data: dto,
      include: this.INCLUDE,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.windowTypeOption.delete({ where: { id } });
  }
}
