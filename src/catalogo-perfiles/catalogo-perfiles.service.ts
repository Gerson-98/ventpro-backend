import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogoPerfilesDto } from './dto/create-catalogo-perfiles.dto';
import { UpdateCatalogoPerfilesDto } from './dto/update-catalogo-perfiles.dto';

const FULL_INCLUDE = {
  windowType: { select: { id: true, name: true } },
  perfilMarco: { select: { id: true, name: true } },
  perfilHoja: { select: { id: true, name: true } },
  perfilMosquitero: { select: { id: true, name: true } },
  perfilBatiente: { select: { id: true, name: true } },
  perfilTapajamba: { select: { id: true, name: true } },
  // ── NUEVOS ──────────────────────────────────────────────────────────────
  refuerzoHoja: { select: { id: true, name: true } },
  refuerzoMosquitero: { select: { id: true, name: true } },
};

@Injectable()
export class CatalogoPerfilesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catalogoPerfiles.findMany({
      include: FULL_INCLUDE,
      orderBy: { windowType: { name: 'asc' } },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.catalogoPerfiles.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    });
    if (!record) throw new NotFoundException(`Catálogo #${id} no encontrado`);
    return record;
  }

  findByWindowType(windowTypeId: number) {
    return this.prisma.catalogoPerfiles.findFirst({
      where: { window_type_id: windowTypeId },
      include: FULL_INCLUDE,
    });
  }

  async create(dto: CreateCatalogoPerfilesDto) {
    const exists = await this.prisma.catalogoPerfiles.findFirst({
      where: { window_type_id: dto.window_type_id },
    });
    if (exists)
      throw new ConflictException(
        `Ya existe un catálogo para el tipo de ventana #${dto.window_type_id}. Usa PATCH para actualizar.`,
      );
    return this.prisma.catalogoPerfiles.create({
      data: dto,
      include: FULL_INCLUDE,
    });
  }

  async update(id: number, dto: UpdateCatalogoPerfilesDto) {
    await this.findOne(id);
    const { window_type_id, ...data } = dto as any;
    return this.prisma.catalogoPerfiles.update({
      where: { id },
      data,
      include: FULL_INCLUDE,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catalogoPerfiles.delete({ where: { id } });
  }
}
