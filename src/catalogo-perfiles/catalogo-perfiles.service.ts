import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogoPerfilesDto } from './dto/create-catalogo-perfiles.dto';
import { UpdateCatalogoPerfilesDto } from './dto/update-catalogo-perfiles.dto';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';

// Pares (perfil_id, regla) que deben configurarse juntos. Si se asigna un
// material a un slot, su regla de corte es obligatoria — sin regla el motor
// de cálculo de perfiles salta la pieza silenciosamente (causa raíz del bug
// "Sin perfiles calculados" en puertas corredizas: filas con material sin
// regla).
const PROFILE_PAIRS: Array<{
  idField: keyof CreateCatalogoPerfilesDto;
  ruleField: keyof CreateCatalogoPerfilesDto;
  label: string;
}> = [
  { idField: 'perfil_marco_id',      ruleField: 'regla_marco',      label: 'Marco' },
  { idField: 'perfil_hoja_id',       ruleField: 'regla_hoja',       label: 'Hoja' },
  { idField: 'perfil_mosquitero_id', ruleField: 'regla_mosquitero', label: 'Mosquitero' },
  { idField: 'perfil_batiente_id',   ruleField: 'regla_batiente',   label: 'Batiente' },
  { idField: 'perfil_tapajamba_id',  ruleField: 'regla_tapajamba',  label: 'Tapajamba' },
];

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
  constructor(
    private prisma: PrismaService,
    private costCalculator: CostCalculatorService,
  ) {}

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

  /**
   * Valida que para cada slot de perfil, si hay material asignado la regla de
   * corte también esté presente (y viceversa). En `update` se cruzan los
   * valores entrantes contra los existentes para detectar el caso "asignar
   * material y dejar la regla vacía".
   */
  private assertProfilePairsConsistent(
    incoming: Partial<CreateCatalogoPerfilesDto>,
    existing?: Partial<CreateCatalogoPerfilesDto> | null,
  ): void {
    const merged: Record<string, any> = { ...(existing ?? {}), ...incoming };
    const errors: string[] = [];
    for (const pair of PROFILE_PAIRS) {
      const hasMaterial =
        merged[pair.idField] !== null && merged[pair.idField] !== undefined;
      const ruleValue = merged[pair.ruleField];
      const hasRule =
        typeof ruleValue === 'string' && ruleValue.trim().length > 0;
      if (hasMaterial && !hasRule) {
        errors.push(`"${pair.label}": material asignado sin regla de corte`);
      } else if (!hasMaterial && hasRule) {
        errors.push(`"${pair.label}": regla de corte sin material asignado`);
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException(
        `Catálogo inválido: ${errors.join('; ')}.`,
      );
    }
  }

  /**
   * `ruleOverrides` debe ser un objeto (o null). Defensa contra el bug
   * observado en BD donde algunas filas tenían el string literal "null"
   * (4 chars) en lugar de SQL NULL — no rompía la lógica actual pero ensucia
   * la tabla y dificulta razonar sobre el campo.
   */
  private normalizeRuleOverrides(value: any): Record<string, any> | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
      try {
        const parsed = JSON.parse(trimmed);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        throw new BadRequestException(
          'ruleOverrides debe ser un objeto JSON o null.',
        );
      }
    }
    if (typeof value === 'object') return value;
    throw new BadRequestException(
      'ruleOverrides debe ser un objeto JSON o null.',
    );
  }

  async create(dto: CreateCatalogoPerfilesDto) {
    this.assertProfilePairsConsistent(dto);

    const exists = await this.prisma.catalogoPerfiles.findFirst({
      where: { window_type_id: dto.window_type_id },
    });
    if (exists)
      throw new ConflictException(
        `Ya existe un catálogo para el tipo de ventana #${dto.window_type_id}. Usa PATCH para actualizar.`,
      );

    const { ruleOverrides, ...rest } = dto as any;
    const normalizedOverrides = this.normalizeRuleOverrides(ruleOverrides);
    const result = await this.prisma.catalogoPerfiles.create({
      data: {
        ...rest,
        ruleOverrides: normalizedOverrides ?? undefined,
      },
      include: FULL_INCLUDE,
    });
    this.costCalculator.clearCache();
    return result;
  }

  async update(id: number, dto: UpdateCatalogoPerfilesDto) {
    const existing = await this.findOne(id);
    this.assertProfilePairsConsistent(dto as any, existing as any);

    const { window_type_id, ruleOverrides, ...data } = dto as any;
    const updateData: Record<string, any> = { ...data };
    if (ruleOverrides !== undefined) {
      updateData.ruleOverrides =
        this.normalizeRuleOverrides(ruleOverrides) ?? null;
    }

    const result = await this.prisma.catalogoPerfiles.update({
      where: { id },
      data: updateData,
      include: FULL_INCLUDE,
    });
    this.costCalculator.clearCache();
    return result;
  }

  async remove(id: number) {
    await this.findOne(id);
    const result = await this.prisma.catalogoPerfiles.delete({ where: { id } });
    this.costCalculator.clearCache();
    return result;
  }
}
