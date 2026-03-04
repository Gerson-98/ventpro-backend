import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
    // 1. Verificar que el material existe
    const material = await this.findOne(id);

    // ─────────────────────────────────────────────────────────────────
    // 2. Verificar si está siendo usado en reglas de accesorios
    // ─────────────────────────────────────────────────────────────────
    const accessoryRules = await this.prisma.accessoryRule.findMany({
      where: { material_id: id },
      include: {
        windowType: {
          select: { name: true },
        },
      },
    });

    if (accessoryRules.length > 0) {
      // Obtener nombres únicos de tipos de ventana afectados
      const tiposAfectados = [
        ...new Set(accessoryRules.map((r) => r.windowType.name)),
      ].join(', ');

      throw new BadRequestException(
        `No se puede eliminar "${material.name}" porque está siendo usado como accesorio en ` +
          `${accessoryRules.length} regla(s) de los siguientes tipos de ventana: ${tiposAfectados}. ` +
          `Elimine primero esas reglas de accesorios.`,
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. Verificar si está siendo usado en catálogo de perfiles
    // ─────────────────────────────────────────────────────────────────
    const catalogoUso = await this.prisma.catalogoPerfiles.findMany({
      where: {
        OR: [
          { perfil_marco_id: id },
          { perfil_hoja_id: id },
          { perfil_mosquitero_id: id },
          { perfil_batiente_id: id },
          { perfil_tapajamba_id: id },
        ],
      },
      include: {
        windowType: {
          select: { name: true },
        },
      },
    });

    if (catalogoUso.length > 0) {
      const tiposAfectados = catalogoUso
        .map((c) => c.windowType.name)
        .join(', ');

      throw new BadRequestException(
        `No se puede eliminar "${material.name}" porque está asignado como perfil en ` +
          `los siguientes tipos de ventana: ${tiposAfectados}. ` +
          `Desasigne el perfil primero antes de eliminar este material.`,
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // 4. Sin dependencias — proceder con la eliminación
    // ─────────────────────────────────────────────────────────────────
    return this.prisma.material.delete({ where: { id } });
  }
}
