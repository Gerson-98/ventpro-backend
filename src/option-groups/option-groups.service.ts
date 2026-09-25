import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
    const group = await this.findOne(id);

    // WindowTypeOption y OptionValue cascadean al borrar el grupo (se
    // borrarían en silencio), y PerfilFormula/AccessoryRule referencian el
    // grupo por su "key" en texto (sin relación de base de datos) — sin este
    // chequeo, borrar un grupo en uso dejaría condiciones huérfanas o
    // quitaría la opción de tipos de ventana sin ningún aviso.
    const tiposUsando = await this.prisma.windowTypeOption.count({ where: { group_id: id } });
    const formulasUsando = await this.prisma.perfilFormula.count({ where: { option_group: group.key } });
    const accesoriosUsando = await this.prisma.accessoryRule.count({ where: { option_group: group.key } });

    if (tiposUsando > 0 || formulasUsando > 0 || accesoriosUsando > 0) {
      const detalles: string[] = [];
      if (tiposUsando > 0) detalles.push(`se ofrece en ${tiposUsando} tipo(s) de ventana`);
      if (formulasUsando > 0) detalles.push(`${formulasUsando} fórmula(s) condicional(es) dependen de él`);
      if (accesoriosUsando > 0) detalles.push(`${accesoriosUsando} accesorio(s) condicionado(s) dependen de él`);
      throw new BadRequestException(
        `No se puede eliminar "${group.label}" porque ${detalles.join(', ')}. ` +
          `Edita esos tipos de ventana desde el asistente y quítale las variantes/accesorios que lo usan antes de eliminarlo.`,
      );
    }

    return this.prisma.optionGroup.delete({ where: { id } });
  }
}
