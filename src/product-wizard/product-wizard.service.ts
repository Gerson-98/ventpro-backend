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
  option_group?: string | null;
  option_key?: string | null;
}

const PERFIL_SLOTS = ['MARCO', 'HOJA', 'TAPAJAMBA', 'BATIENTE', 'MOSQUITERO'] as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class ProductWizardService {
  constructor(
    private prisma: PrismaService,
    private perfilFormulas: PerfilFormulasService,
  ) {}

  // ── Construye las filas de PerfilFormula a partir del DTO del wizard ──────
  // Cada perfil/vidrio aporta su fila por defecto MÁS una fila por cada
  // variante condicional (misma piezas/fórmula que el default salvo que la
  // variante la sobreescriba explícitamente).
  private buildFormulaRows(dto: CreateProductWizardDto): FormulaRow[] {
    const rows: FormulaRow[] = [];
    for (const p of dto.perfiles) {
      rows.push({ slot: p.slot, origen: 'ancho', piezas: p.piezasAncho, steps: p.formulaAncho || [] });
      rows.push({ slot: p.slot, origen: 'alto', piezas: p.piezasAlto, steps: p.formulaAlto || [] });
      for (const v of p.variantes || []) {
        rows.push({
          slot: p.slot, origen: 'ancho',
          piezas: v.piezasAncho ?? p.piezasAncho,
          steps: v.formulaAncho ?? p.formulaAncho ?? [],
          option_group: v.option_group, option_key: v.option_key,
        });
        rows.push({
          slot: p.slot, origen: 'alto',
          piezas: v.piezasAlto ?? p.piezasAlto,
          steps: v.formulaAlto ?? p.formulaAlto ?? [],
          option_group: v.option_group, option_key: v.option_key,
        });
      }
    }
    if (dto.vidrio?.usesGlass) {
      const cant = dto.vidrio.cant_vidrios ?? 1;
      rows.push({ slot: 'VIDRIO', origen: 'ancho', piezas: cant, steps: dto.vidrio.formulaAncho || [] });
      rows.push({ slot: 'VIDRIO', origen: 'alto', piezas: cant, steps: dto.vidrio.formulaAlto || [] });
      for (const v of dto.vidrio.variantes || []) {
        rows.push({
          slot: 'VIDRIO', origen: 'ancho',
          piezas: v.piezasAncho ?? cant,
          steps: v.formulaAncho ?? dto.vidrio.formulaAncho ?? [],
          option_group: v.option_group, option_key: v.option_key,
        });
        rows.push({
          slot: 'VIDRIO', origen: 'alto',
          piezas: v.piezasAlto ?? cant,
          steps: v.formulaAlto ?? dto.vidrio.formulaAlto ?? [],
          option_group: v.option_group, option_key: v.option_key,
        });
      }
    }
    return rows;
  }

  // ── Validaciones de negocio previas a tocar la BD (Paso 6 del wizard) ─────
  private validateDto(dto: CreateProductWizardDto): string[] {
    const errors: string[] = [];

    // Marco es el único perfil realmente universal — hay productos reales
    // (marcos fijos, ventanas de sifón) sin Hoja, Tapajamba ni Batiente.
    const marco = dto.perfiles.find((p) => p.slot === 'MARCO');
    if (!marco) errors.push('El perfil de Marco es obligatorio.');

    const slotsVistos = new Set<string>();
    for (const p of dto.perfiles) {
      if (slotsVistos.has(p.slot)) {
        errors.push(`El perfil "${p.slot}" está duplicado — solo puede aparecer una vez.`);
      }
      slotsVistos.add(p.slot);
      if (!p.material_id) errors.push(`Falta seleccionar el perfil para "${p.slot}".`);
      if ((p.piezasAncho ?? 0) <= 0 && (p.piezasAlto ?? 0) <= 0) {
        errors.push(`"${p.slot}": debe tener al menos una pieza de ancho o de alto.`);
      }
    }

    if (dto.vidrio?.usesGlass && (!dto.vidrio.cant_vidrios || dto.vidrio.cant_vidrios <= 0)) {
      errors.push('Si el producto usa vidrio, la cantidad de vidrios debe ser mayor a 0.');
    }

    for (const a of dto.accesorios || []) {
      if (!a.material_id) errors.push('Hay un accesorio sin seleccionar.');
      if (!!a.option_group !== !!a.option_key) {
        errors.push('Un accesorio condicional necesita el grupo de opción y el valor, los dos juntos.');
      }
      if (a.formula_type || a.formula_slot || a.formula_factor != null) {
        if (!a.formula_type || !a.formula_slot || !a.formula_factor) {
          errors.push('Un accesorio con cantidad por fórmula necesita el tipo, el perfil y el factor, los tres juntos.');
        }
      } else if (!a.quantity || a.quantity <= 0) {
        errors.push('Todo accesorio debe tener una cantidad mayor a 0, o una fórmula que la calcule.');
      }
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

  // ── Autoasigna al tipo de ventana los grupos de opción que sus variantes/
  // accesorios condicionales referencian, para que el cotizador realmente
  // los muestre al vendedor. Antes esto requería una pantalla aparte
  // ("Asignación de Opciones"); ahora queda implícito en el wizard: si una
  // fórmula o accesorio reacciona a un grupo, ese grupo se ofrece en el
  // cotizador de este tipo automáticamente. Nunca desasigna — solo agrega
  // lo que falte, así no rompe asignaciones hechas a mano desde esa pantalla.
  private async syncOptionGroupAssignments(
    tx: Tx,
    windowTypeId: number,
    dto: CreateProductWizardDto,
  ) {
    const keys = new Set<string>();
    for (const p of dto.perfiles) {
      for (const v of p.variantes || []) {
        if (v.option_group) keys.add(v.option_group);
      }
    }
    for (const v of dto.vidrio?.variantes || []) {
      if (v.option_group) keys.add(v.option_group);
    }
    for (const a of dto.accesorios || []) {
      if (a.option_group) keys.add(a.option_group);
    }
    if (keys.size === 0) return;

    const groups = await tx.optionGroup.findMany({
      where: { key: { in: Array.from(keys) } },
      select: { id: true },
    });
    if (groups.length === 0) return;

    const already = await tx.windowTypeOption.findMany({
      where: { window_type_id: windowTypeId, group_id: { in: groups.map((g) => g.id) } },
      select: { group_id: true },
    });
    const alreadySet = new Set(already.map((a) => a.group_id));
    const missing = groups.filter((g) => !alreadySet.has(g.id));
    if (missing.length === 0) return;

    await tx.windowTypeOption.createMany({
      data: missing.map((g) => ({ window_type_id: windowTypeId, group_id: g.id })),
    });
  }

  // ── Crear producto nuevo ───────────────────────────────────────────────────
  async createProduct(dto: CreateProductWizardDto) {
    const errors = this.validateDto(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const marco = dto.perfiles.find((p) => p.slot === 'MARCO')!;
    const hoja = dto.perfiles.find((p) => p.slot === 'HOJA');
    const tapajamba = dto.perfiles.find((p) => p.slot === 'TAPAJAMBA');
    const batiente = dto.perfiles.find((p) => p.slot === 'BATIENTE');
    const mosquitero = dto.perfiles.find((p) => p.slot === 'MOSQUITERO');

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
            perfil_hoja_id: hoja?.material_id ?? null,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            perfil_mosquitero_id: mosquitero?.material_id ?? null,
            refuerzo_hoja_id: dto.refuerzoHojaMaterialId ?? null,
            refuerzo_mosquitero_id: dto.refuerzoMosquiteroMaterialId ?? null,
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
              option_group: r.option_group || null,
              option_key: r.option_key || null,
            })),
          });
        }

        if (dto.accesorios?.length) {
          await tx.accessoryRule.createMany({
            data: dto.accesorios.map((a) => ({
              window_type_id: windowType.id,
              material_id: a.material_id,
              quantity: a.formula_type ? 0 : (a.quantity ?? 1),
              required: a.required ?? true,
              option_group: a.option_group || null,
              option_key: a.option_key || null,
              formula_type: a.formula_type || null,
              formula_slot: a.formula_slot || null,
              formula_factor: a.formula_factor ?? null,
            })),
          });
        }

        await this.syncOptionGroupAssignments(tx, windowType.id, dto);

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
    const hoja = dto.perfiles.find((p) => p.slot === 'HOJA');
    const tapajamba = dto.perfiles.find((p) => p.slot === 'TAPAJAMBA');
    const batiente = dto.perfiles.find((p) => p.slot === 'BATIENTE');
    const mosquitero = dto.perfiles.find((p) => p.slot === 'MOSQUITERO');

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
            perfil_hoja_id: hoja?.material_id ?? null,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            perfil_mosquitero_id: mosquitero?.material_id ?? null,
            refuerzo_hoja_id: dto.refuerzoHojaMaterialId ?? null,
            refuerzo_mosquitero_id: dto.refuerzoMosquiteroMaterialId ?? null,
            cant_vidrios: dto.vidrio?.usesGlass ? (dto.vidrio.cant_vidrios ?? 1) : null,
          },
          create: {
            window_type_id: id,
            perfil_marco_id: marco.material_id,
            perfil_hoja_id: hoja?.material_id ?? null,
            perfil_tapajamba_id: tapajamba?.material_id ?? null,
            perfil_batiente_id: batiente?.material_id ?? null,
            perfil_mosquitero_id: mosquitero?.material_id ?? null,
            refuerzo_hoja_id: dto.refuerzoHojaMaterialId ?? null,
            refuerzo_mosquitero_id: dto.refuerzoMosquiteroMaterialId ?? null,
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
              option_group: r.option_group || null,
              option_key: r.option_key || null,
            })),
          });
        }

        await tx.accessoryRule.deleteMany({ where: { window_type_id: id } });
        if (dto.accesorios?.length) {
          await tx.accessoryRule.createMany({
            data: dto.accesorios.map((a) => ({
              window_type_id: id,
              material_id: a.material_id,
              quantity: a.formula_type ? 0 : (a.quantity ?? 1),
              required: a.required ?? true,
              option_group: a.option_group || null,
              option_key: a.option_key || null,
              formula_type: a.formula_type || null,
              formula_slot: a.formula_slot || null,
              formula_factor: a.formula_factor ?? null,
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

        await this.syncOptionGroupAssignments(tx, id, dto);

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
      MOSQUITERO: cat?.perfil_mosquitero_id,
    };

    // Reconstruye las variantes condicionales de un slot: agrupa las filas
    // con option_group/option_key (ancho + alto de una misma condición) en
    // un único objeto { option_group, option_key, piezasAncho, ... }.
    const buildVariantes = (slot: string) => {
      const conditional = windowType.perfilFormulas.filter((f) => f.slot === slot && f.option_group);
      const byCondition = new Map<string, { option_group: string; option_key: string; anchoRow?: any; altoRow?: any }>();
      for (const f of conditional) {
        const key = `${f.option_group}=${f.option_key}`;
        if (!byCondition.has(key)) byCondition.set(key, { option_group: f.option_group!, option_key: f.option_key!, });
        const entry = byCondition.get(key)!;
        if (f.origen === 'ancho') entry.anchoRow = f;
        else entry.altoRow = f;
      }
      return Array.from(byCondition.values()).map((v) => ({
        option_group: v.option_group,
        option_key: v.option_key,
        piezasAncho: v.anchoRow?.piezas,
        piezasAlto: v.altoRow?.piezas,
        formulaAncho: v.anchoRow?.steps as any,
        formulaAlto: v.altoRow?.steps as any,
      }));
    };

    const perfiles = PERFIL_SLOTS.map((slot) => {
      const anchoRow = windowType.perfilFormulas.find((f) => f.slot === slot && f.origen === 'ancho' && !f.option_group);
      const altoRow = windowType.perfilFormulas.find((f) => f.slot === slot && f.origen === 'alto' && !f.option_group);
      const materialId = materialIdBySlot[slot];
      if (!materialId && !anchoRow && !altoRow) return null;
      return {
        slot,
        material_id: materialId ?? null,
        piezasAncho: anchoRow?.piezas ?? 0,
        piezasAlto: altoRow?.piezas ?? 0,
        formulaAncho: (anchoRow?.steps as any) ?? [],
        formulaAlto: (altoRow?.steps as any) ?? [],
        variantes: buildVariantes(slot),
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    const vidrioAncho = windowType.perfilFormulas.find((f) => f.slot === 'VIDRIO' && f.origen === 'ancho' && !f.option_group);
    const vidrioAlto = windowType.perfilFormulas.find((f) => f.slot === 'VIDRIO' && f.origen === 'alto' && !f.option_group);
    const vidrioVariantes = buildVariantes('VIDRIO');

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
        variantes: vidrioVariantes,
      },
      accesorios: windowType.accessoryRules.map((a) => ({
        material_id: a.material_id,
        materialName: a.material.name,
        quantity: a.quantity,
        required: a.required,
        option_group: a.option_group ?? undefined,
        option_key: a.option_key ?? undefined,
        formula_type: a.formula_type ?? undefined,
        formula_slot: a.formula_slot ?? undefined,
        formula_factor: a.formula_factor ?? undefined,
      })),
      pvcColorIds: windowType.pvcLinks.map((l) => l.pvcColor_id),
      active: windowType.active,
      refuerzoHojaMaterialId: cat?.refuerzo_hoja_id ?? undefined,
      refuerzoMosquiteroMaterialId: cat?.refuerzo_mosquitero_id ?? undefined,
    };
  }

  // ── Duplicar producto — para crear uno parecido sin empezar de cero ───────
  async duplicateProduct(id: number, newName: string) {
    const source = await this.getProductForEdit(id);
    const dto: CreateProductWizardDto = {
      name: newName,
      displayName: source.displayName ? `${source.displayName} (copia)` : undefined,
      series_id: source.series_id ?? undefined,
      category_id: source.category_id ?? undefined,
      pvcColorIds: source.pvcColorIds,
      perfiles: source.perfiles as any,
      vidrio: source.vidrio as any,
      accesorios: source.accesorios.map((a) => ({
        material_id: a.material_id,
        quantity: a.quantity,
        required: a.required,
        option_group: a.option_group,
        option_key: a.option_key,
        formula_type: a.formula_type,
        formula_slot: a.formula_slot,
        formula_factor: a.formula_factor,
      })) as any,
      refuerzoHojaMaterialId: source.refuerzoHojaMaterialId,
      refuerzoMosquiteroMaterialId: source.refuerzoMosquiteroMaterialId,
    };
    return this.createProduct(dto);
  }

  // ── Activar / desactivar — lo oculta del cotizador sin borrar su historial ─
  async setActive(id: number, active: boolean) {
    const existing = await this.prisma.windowType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Tipo de ventana #${id} no encontrado.`);
    return this.prisma.windowType.update({ where: { id }, data: { active } });
  }
}
