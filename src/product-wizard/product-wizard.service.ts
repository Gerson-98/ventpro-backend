// RUTA: src/product-wizard/product-wizard.service.ts
//
// Orquesta la creación/edición completa de un tipo de ventana con el motor
// de fórmulas nuevo: WindowType + CatalogoPerfiles + PerfilFormula[] +
// AccessoryRule[] en UNA sola transacción atómica — o se guarda todo, o no
// se guarda nada. Reemplaza el flujo actual de 6 pantallas separadas.
//
// Este módulo NUNCA toca un tipo de ventana con calc_engine = "legacy" — es
// una salvaguarda explícita para que los 26 tipos ya en producción (Serie
// 60/80/88, etc.) sean intocables desde aquí, incluso por error.

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PerfilFormulasService } from '../perfil-formulas/perfil-formulas.service';
import { CreateProductWizardDto } from './dto/create-product-wizard.dto';
import { FormulaStep } from '../common/formula-engine.util';

interface FormulaRow {
  slot: string;
  origen: 'ancho' | 'alto';
  piezas: number;
  steps: FormulaStep[];
}

const PERFIL_SLOTS = ['MARCO', 'HOJA', 'TAPAJAMBA', 'BATIENTE'] as const;

@Injectable()
export class ProductWizardService {
  constructor(
    private prisma: PrismaService,
    private perfilFormulas: PerfilFormulasService,
  ) {}

  // ── Construye las filas de PerfilFormula a partir del DTO del wizard ──────
  private buildFormulaRows(dto: CreateProductWizardDto): FormulaRow[] {
    const rows: FormulaRow[] = [];
    for (const p of dto.perfiles) {
      rows.push({ slot: p.slot, origen: 'ancho', piezas: p.piezas, steps: p.formulaAncho || [] });
      rows.push({ slot: p.slot, origen: 'alto', piezas: p.piezas, steps: p.formulaAlto || [] });
    }
    if (dto.vidrio?.usesGlass) {
      const cant = dto.vidrio.cant_vidrios ?? 1;
      rows.push({ slot: 'VIDRIO', origen: 'ancho', piezas: cant, steps: dto.vidrio.formulaAncho || [] });
      rows.push({ slot: 'VIDRIO', origen: 'alto', piezas: cant, steps: dto.vidrio.formulaAlto || [] });
    }
    return rows;
  }

  // ── Validaciones de negocio previas a tocar la BD (Paso 6 del wizard) ─────
  private validateDto(dto: CreateProductWizardDto): string[] {
    const errors: string[] = [];

    const marco = dto.perfiles.find((p) => p.slot === 'MARCO');
    const hoja = dto.perfiles.find((p) => p.slot === 'HOJA');
    if (!marco) errors.push('El perfil de Marco es obligatorio.');
    if (!hoja) errors.push('El perfil de Hoja es obligatorio.');

    const slotsVistos = new Set<string>();
    for (const p of dto.perfiles) {
      if (slotsVistos.has(p.slot)) {
        errors.push(`El perfil "${p.slot}" está duplicado — solo puede aparecer una vez.`);
      }
      slotsVistos.add(p.slot);
      if (!p.material_id) errors.push(`Falta seleccionar el perfil para "${p.slot}".`);
      if (!p.piezas || p.piezas <= 0) errors.push(`"${p.slot}": la cantidad de piezas debe ser mayor a 0.`);
    }

    if (dto.vidrio?.usesGlass && (!dto.vidrio.cant_vidrios || dto.vidrio.cant_vidrios <= 0)) {
      errors.push('Si el producto usa vidrio, la cantidad de vidrios debe ser mayor a 0.');
    }

    for (const a of dto.accesorios || []) {
      if (!a.material_id) errors.push('Hay un accesorio sin seleccionar.');
      if (!a.quantity || a.quantity <= 0) errors.push('Todo accesorio debe tener una cantidad mayor a 0.');
    }

    // Delega la validación de cada fórmula (pasos bien formados, sin
    // división entre cero, etc.) al motor de fórmulas.
    const formulaRows = this.buildFormulaRows(dto);
    errors.push(...this.perfilFormulas.validateFormulaSet(formulaRows));

    return errors;
  }

  // ── Prueba las fórmulas con una medida de ejemplo (Paso 5/6: vista previa) ─
  previewMeasurements(dto: CreateProductWizardDto, width: number, height: number) {
    const errors = this.validateDto(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    const formulaRows = this.buildFormulaRows(dto);
    return this.perfilFormulas.resolveFromFormulas(formulaRows as any, width, height);
  }

  // ── Crear producto nuevo ───────────────────────────────────────────────────
  async createProduct(dto: CreateProductWizardDto) {
    const errors = this.validateDto(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const marco = dto.perfiles.find((p) => p.slot === 'MARCO')!;
    const hoja = dto.perfiles.find((p) => p.slot === 'HOJA')!;
    const tapajamba = dto.perfiles.find((p) => p.slot === 'TAPAJAMBA');
    const batiente = dto.perfiles.find((p) => p.slot === 'BATIENTE');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const windowType = await tx.windowType.create({
          data: {
            name: dto.name,
            displayName: dto.displayName || null,
            series_id: dto.series_id ?? null,
            category_id: dto.category_id ?? null,
            calc_engine: 'formula',
          },
        });

        if (dto.pvcColorIds?.length) {
          await tx.windowTypePvcColor.createMany({
            data: dto.pvcColorIds.map((id) => ({
              window_type_id: windowType.id,
              pvcColor_id: Number(id),
            })),
          });
        }

        await tx.catalogoPerfiles.create({
          data: {
            window_type_id: windowType.id,
            perfil_marco_id: marco.material_id,
            perfil_hoja_id: hoja.material_id,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            cant_vidrios: dto.vidrio?.usesGlass ? (dto.vidrio.cant_vidrios ?? 1) : null,
          },
        });

        const formulaRows = this.buildFormulaRows(dto);
        if (formulaRows.length > 0) {
          await tx.perfilFormula.createMany({
            data: formulaRows.map((r) => ({
              window_type_id: windowType.id,
              slot: r.slot,
              origen: r.origen,
              piezas: r.piezas,
              steps: r.steps as any,
            })),
          });
        }

        if (dto.accesorios?.length) {
          await tx.accessoryRule.createMany({
            data: dto.accesorios.map((a) => ({
              window_type_id: windowType.id,
              material_id: a.material_id,
              quantity: a.quantity,
            })),
          });
        }

        return windowType;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`Ya existe un tipo de ventana llamado "${dto.name}".`);
      }
      throw err;
    }
  }

  // ── Editar producto existente — SOLO si usa el motor de fórmulas ─────────
  async updateProduct(id: number, dto: CreateProductWizardDto) {
    const existing = await this.prisma.windowType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Tipo de ventana #${id} no encontrado.`);
    if (existing.calc_engine !== 'formula') {
      throw new BadRequestException(
        'Este tipo de ventana usa el sistema de cálculo clásico y no se puede editar desde el configurador nuevo.',
      );
    }

    const errors = this.validateDto(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const marco = dto.perfiles.find((p) => p.slot === 'MARCO')!;
    const hoja = dto.perfiles.find((p) => p.slot === 'HOJA')!;
    const tapajamba = dto.perfiles.find((p) => p.slot === 'TAPAJAMBA');
    const batiente = dto.perfiles.find((p) => p.slot === 'BATIENTE');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const windowType = await tx.windowType.update({
          where: { id },
          data: {
            name: dto.name,
            displayName: dto.displayName || null,
            series_id: dto.series_id ?? null,
            category_id: dto.category_id ?? null,
          },
        });

        await tx.catalogoPerfiles.upsert({
          where: { window_type_id: id },
          update: {
            perfil_marco_id: marco.material_id,
            perfil_hoja_id: hoja.material_id,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            cant_vidrios: dto.vidrio?.usesGlass ? (dto.vidrio.cant_vidrios ?? 1) : null,
          },
          create: {
            window_type_id: id,
            perfil_marco_id: marco.material_id,
            perfil_hoja_id: hoja.material_id,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            cant_vidrios: dto.vidrio?.usesGlass ? (dto.vidrio.cant_vidrios ?? 1) : null,
          },
        });

        // Reemplaza siempre el set completo — evita fórmulas/accesorios
        // huérfanos de una configuración anterior a medio editar.
        await tx.perfilFormula.deleteMany({ where: { window_type_id: id } });
        const formulaRows = this.buildFormulaRows(dto);
        if (formulaRows.length > 0) {
          await tx.perfilFormula.createMany({
            data: formulaRows.map((r) => ({
              window_type_id: id,
              slot: r.slot,
              origen: r.origen,
              piezas: r.piezas,
              steps: r.steps as any,
            })),
          });
        }

        await tx.accessoryRule.deleteMany({ where: { window_type_id: id } });
        if (dto.accesorios?.length) {
          await tx.accessoryRule.createMany({
            data: dto.accesorios.map((a) => ({
              window_type_id: id,
              material_id: a.material_id,
              quantity: a.quantity,
            })),
          });
        }

        if (dto.pvcColorIds) {
          await tx.windowTypePvcColor.deleteMany({ where: { window_type_id: id } });
          if (dto.pvcColorIds.length > 0) {
            await tx.windowTypePvcColor.createMany({
              data: dto.pvcColorIds.map((colorId) => ({
                window_type_id: id,
                pvcColor_id: Number(colorId),
              })),
            });
          }
        }

        return windowType;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`Ya existe un tipo de ventana llamado "${dto.name}".`);
      }
      throw err;
    }
  }

  // ── Cargar un producto para reabrir el wizard precargado ──────────────────
  async getProductForEdit(id: number) {
    const windowType = await this.prisma.windowType.findUnique({
      where: { id },
      include: {
        catalogoPerfiles: true,
        perfilFormulas: true,
        accessoryRules: { include: { material: true } },
        pvcLinks: true,
        series: true,
        category: true,
      },
    });
    if (!windowType) throw new NotFoundException(`Tipo de ventana #${id} no encontrado.`);
    if (windowType.calc_engine !== 'formula') {
      throw new BadRequestException(
        'Este tipo de ventana usa el sistema de cálculo clásico y no se puede editar desde el configurador nuevo.',
      );
    }

    const cat = windowType.catalogoPerfiles;
    const materialIdBySlot: Record<string, number | null | undefined> = {
      MARCO: cat?.perfil_marco_id,
      HOJA: cat?.perfil_hoja_id,
      TAPAJAMBA: cat?.perfil_tapajamba_id,
      BATIENTE: cat?.perfil_batiente_id,
    };

    const perfiles = PERFIL_SLOTS.map((slot) => {
      const anchoRow = windowType.perfilFormulas.find((f) => f.slot === slot && f.origen === 'ancho');
      const altoRow = windowType.perfilFormulas.find((f) => f.slot === slot && f.origen === 'alto');
      const materialId = materialIdBySlot[slot];
      if (!materialId && !anchoRow && !altoRow) return null;
      return {
        slot,
        material_id: materialId ?? null,
        piezas: anchoRow?.piezas ?? altoRow?.piezas ?? 2,
        formulaAncho: (anchoRow?.steps as any) ?? [],
        formulaAlto: (altoRow?.steps as any) ?? [],
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    const vidrioAncho = windowType.perfilFormulas.find((f) => f.slot === 'VIDRIO' && f.origen === 'ancho');
    const vidrioAlto = windowType.perfilFormulas.find((f) => f.slot === 'VIDRIO' && f.origen === 'alto');

    return {
      id: windowType.id,
      name: windowType.name,
      displayName: windowType.displayName,
      series_id: windowType.series_id,
      category_id: windowType.category_id,
      series: windowType.series,
      category: windowType.category,
      perfiles,
      vidrio: {
        usesGlass: !!(vidrioAncho || vidrioAlto),
        cant_vidrios: cat?.cant_vidrios ?? undefined,
        formulaAncho: (vidrioAncho?.steps as any) ?? [],
        formulaAlto: (vidrioAlto?.steps as any) ?? [],
      },
      accesorios: windowType.accessoryRules.map((a) => ({
        material_id: a.material_id,
        materialName: a.material.name,
        quantity: a.quantity,
      })),
      pvcColorIds: windowType.pvcLinks.map((l) => l.pvcColor_id),
    };
  }
}
