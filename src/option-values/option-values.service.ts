import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { UpdateOptionValueDto } from './dto/update-option-value.dto';

@Injectable()
export class OptionValuesService {
  constructor(private prisma: PrismaService) {}

  private readonly INCLUDE = {
    group: { select: { id: true, key: true, label: true } },
  };

  findAll() {
    return this.prisma.optionValue.findMany({
      include: this.INCLUDE,
      orderBy: [{ group_id: 'asc' }, { sort_order: 'asc' }],
    });
  }

  findByGroup(groupId: number) {
    return this.prisma.optionValue.findMany({
      where: { group_id: groupId },
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: number) {
    const value = await this.prisma.optionValue.findUnique({
      where: { id },
      include: this.INCLUDE,
    });
    if (!value) throw new NotFoundException(`Opción #${id} no encontrada`);
    return value;
  }

  async create(dto: CreateOptionValueDto) {
    // Verificar que el grupo existe
    const group = await this.prisma.optionGroup.findUnique({
      where: { id: dto.group_id },
    });
    if (!group)
      throw new NotFoundException(`Grupo #${dto.group_id} no encontrado`);

    // Verificar unicidad de key dentro del grupo
    const exists = await this.prisma.optionValue.findUnique({
      where: { group_id_key: { group_id: dto.group_id, key: dto.key } },
    });
    if (exists)
      throw new ConflictException(
        `Ya existe la opción "${dto.key}" en este grupo`,
      );

    return this.prisma.optionValue.create({
      data: dto,
      include: this.INCLUDE,
    });
  }

  async update(id: number, dto: UpdateOptionValueDto) {
    const current = await this.findOne(id);

    // Si cambia key o group_id, verificar unicidad
    const newGroupId = dto.group_id ?? current.group_id;
    const newKey = dto.key ?? current.key;

    if (dto.key || dto.group_id) {
      const exists = await this.prisma.optionValue.findFirst({
        where: {
          group_id: newGroupId,
          key: newKey,
          NOT: { id },
        },
      });
      if (exists)
        throw new ConflictException(
          `Ya existe la opción "${newKey}" en este grupo`,
        );
    }

    return this.prisma.optionValue.update({
      where: { id },
      data: dto,
      include: this.INCLUDE,
    });
  }

  async remove(id: number) {
    const value = await this.findOne(id);

    // PerfilFormula/AccessoryRule referencian el valor por su "key" en texto
    // dentro de su grupo — no hay relación de base de datos, así que sin
    // este chequeo borrar un valor en uso dejaría esa condición huérfana en
    // silencio (nunca se volvería a disparar, sin ningún aviso).
    const formulasUsando = await this.prisma.perfilFormula.count({
      where: { option_group: value.group.key, option_key: value.key },
    });
    const accesoriosUsando = await this.prisma.accessoryRule.count({
      where: { option_group: value.group.key, option_key: value.key },
    });

    if (formulasUsando > 0 || accesoriosUsando > 0) {
      const detalles: string[] = [];
      if (formulasUsando > 0) detalles.push(`${formulasUsando} fórmula(s) condicional(es)`);
      if (accesoriosUsando > 0) detalles.push(`${accesoriosUsando} accesorio(s) condicionado(s)`);
      throw new BadRequestException(
        `No se puede eliminar "${value.label}" porque ${detalles.join(' y ')} dependen de él. ` +
          `Edita esos tipos de ventana desde el asistente y quítale esa condición antes de eliminarla.`,
      );
    }

    return this.prisma.optionValue.delete({ where: { id } });
  }
}
