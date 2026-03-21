// RUTA: src/cost-calculator/cost-calculator.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

interface WindowCostInput {
  window_type_id: number;
  width_cm: number;
  height_cm: number;
  color_id: number;
  glass_color_id?: number;
  options?: Record<string, string>;
  quantity?: number;
}

interface MaterialCostLine {
  material_id: number;
  nombre: string;
  tipo: string;
  cantidad: number;
  precio_unitario: number;
  costo_total: number;
  unidad: string;
}

export interface WindowCostResult {
  costo_perfiles: number;
  costo_vidrio: number;
  costo_accesorios: number;
  costo_total: number;
  precio_sugerido_minimo: number;
  detalle: MaterialCostLine[];
}

export interface QuotationCostResult {
  costo_total_proyecto: number;
  precio_sugerido_minimo: number;
  por_ventana: WindowCostResult[];
}

export interface ResolvedRules {
  regla_marco: string | null;
  regla_hoja: string | null;
  regla_mosquitero: string | null;
  regla_batiente: string | null;
  regla_tapajamba: string | null;
  perfil_marco_id: number | null;
  perfil_hoja_id: number | null;
  perfil_mosquitero_id: number | null;
  perfil_batiente_id: number | null;
  perfil_tapajamba_id: number | null;
  cant_vidrios: number | null;
}

const LARGO_BARRA_CM = 580;
const PLANCHA_VIDRIO_CM2 = 35310;
const MARGEN_MINIMO = 0.4;

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CostCalculatorService {
  constructor(
    private prisma: PrismaService,
    private appSettings: AppSettingsService,
  ) {}

  private pvcColorCache = new Map<number, CacheEntry<any>>();
  private windowTypeCache = new Map<number, CacheEntry<any>>();
  private catalogoCache = new Map<number, CacheEntry<any>>();
  private calcParamsCache = new Map<number, CacheEntry<any>>();
  private accessoryRulesCache = new Map<number, CacheEntry<any[]>>();

  private getFromCache<T>(
    cache: Map<number, CacheEntry<T>>,
    key: number,
  ): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setInCache<T>(
    cache: Map<number, CacheEntry<T>>,
    key: number,
    value: T,
  ): void {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  clearCache(): void {
    this.pvcColorCache.clear();
    this.windowTypeCache.clear();
    this.catalogoCache.clear();
    this.calcParamsCache.clear();
    this.accessoryRulesCache.clear();
  }

  private async getPvcColor(colorId: number) {
    const cached = this.getFromCache(this.pvcColorCache, colorId);
    if (cached !== null) return cached;
    const result = await this.prisma.pvcColor.findUnique({
      where: { id: colorId },
    });
    if (result) this.setInCache(this.pvcColorCache, colorId, result);
    return result;
  }

  private async getWindowType(windowTypeId: number) {
    const cached = this.getFromCache(this.windowTypeCache, windowTypeId);
    if (cached !== null) return cached;
    const result = await this.prisma.windowType.findUnique({
      where: { id: windowTypeId },
    });
    if (result) this.setInCache(this.windowTypeCache, windowTypeId, result);
    return result;
  }

  private async getCatalogo(windowTypeId: number) {
    const cached = this.getFromCache(this.catalogoCache, windowTypeId);
    if (cached !== null) return cached;
    const result = await this.prisma.catalogoPerfiles.findFirst({
      where: { window_type_id: windowTypeId },
      include: {
        perfilMarco: true,
        perfilHoja: true,
        perfilMosquitero: true,
        perfilBatiente: true,
        perfilTapajamba: true,
        // ── NUEVOS ──────────────────────────────────────────
        refuerzoHoja: true,
        refuerzoMosquitero: true,
      },
    });
    this.setInCache(this.catalogoCache, windowTypeId, result);
    return result;
  }

  private async getCalcParams(windowTypeId: number) {
    const cached = this.getFromCache(this.calcParamsCache, windowTypeId);
    if (cached !== null) return cached;
    const result = await this.prisma.windowCalculation.findUnique({
      where: { window_type_id: windowTypeId },
    });
    this.setInCache(this.calcParamsCache, windowTypeId, result);
    return result;
  }

  private async getAccessoryRules(windowTypeId: number) {
    const cached = this.getFromCache(this.accessoryRulesCache, windowTypeId);
    if (cached !== null) return cached;
    const result = await this.prisma.accessoryRule.findMany({
      where: { window_type_id: windowTypeId },
      include: { material: true },
    });
    this.setInCache(this.accessoryRulesCache, windowTypeId, result);
    return result;
  }

  // ── Helper: ¿el mosquitero está activo en las opciones? ─────────────────────
  // Lógica clara y sin ambigüedad:
  // - Si la ventana no tiene perfil_mosquitero_id configurado → no aplica mosquitero
  // - Si options.mosquitero === 'sin_mosquitero' → explícitamente desactivado
  // - Si options.mosquitero === 'con_mosquitero' → activo
  // - Si la key 'mosquitero' no existe en options → la ventana no tiene ese grupo
  //   asignado (ej: ventanas que no son corredizas) → siempre lleva mosquitero
  public tieneMosquitero(
    options: Record<string, string>,
    catalogo: any,
  ): boolean {
    // Si la ventana no tiene perfil mosquitero configurado en el catálogo, no aplica
    if (!catalogo?.perfil_mosquitero_id && !catalogo?.perfilMosquitero)
      return false;
    // Si el grupo mosquitero existe en options y está explícitamente desactivado
    if (options['mosquitero'] === 'sin_mosquitero') return false;
    // Si está explícitamente activado o la key no existe (ventana sin el grupo)
    return true;
  }

  // ── Helper: ¿el refuerzo de hojas está activo? ──────────────────────────────
  public tieneRefuerzoHojas(options: Record<string, string>): boolean {
    return options['refuerzo_hojas'] === 'con_refuerzo';
  }

  // ── Helper: ¿el refuerzo de mosquitero está activo? ─────────────────────────
  public tieneRefuerzoMosquitero(options: Record<string, string>): boolean {
    return options['refuerzo_mosquitero'] === 'con_refuerzo';
  }

  async calcularCostoVentana(
    input: WindowCostInput,
  ): Promise<WindowCostResult> {
    const {
      window_type_id,
      width_cm,
      height_cm,
      color_id,
      options = {},
      quantity = 1,
    } = input;

    const pvcColor = await this.getPvcColor(color_id);
    const esBlanco = pvcColor
      ? pvcColor.name.toUpperCase().includes('BLANCO')
      : false;

    const windowType = await this.getWindowType(window_type_id);
    if (!windowType)
      throw new Error(`Tipo de ventana ${window_type_id} no encontrado`);

    const catalogo = await this.getCatalogo(windowType.id);
    const calcParams = await this.getCalcParams(window_type_id);

    const { hojaAncho, hojaAlto, vidrioDescuento } = this.calcularMedidasHoja(
      width_cm,
      height_cm,
      calcParams,
      options,
    );

    const mosquiteroAncho = Number((hojaAncho - vidrioDescuento).toFixed(2));
    const mosquiteroAlto = Number((hojaAlto - vidrioDescuento).toFixed(2));

    // ── Determinar si lleva mosquitero y refuerzos ───────────────────────────
    const conMosquitero = this.tieneMosquitero(options, catalogo);
    const conRefuerzoHojas = this.tieneRefuerzoHojas(options);
    const conRefuerzoMosquitero = this.tieneRefuerzoMosquitero(options);

    const detalle: MaterialCostLine[] = [];

    if (catalogo) {
      const reglas = this.aplicarRuleOverrides(catalogo, options);

      const perfilesOverride = await this.resolverPerfilesOverride(
        reglas,
        catalogo,
      );

      const cantVidrios = reglas.cant_vidrios ?? catalogo.cant_vidrios;

      const perfiles = [
        {
          perfil: perfilesOverride.marco,
          regla: reglas.regla_marco,
          ancho: width_cm,
          alto: height_cm,
          label: 'MARCO',
          incluir: true,
        },
        {
          perfil: perfilesOverride.hoja,
          regla: reglas.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
          label: 'HOJA',
          incluir: true,
        },
        {
          // ── MOSQUITERO: solo si conMosquitero es true ──────────────────────
          perfil: perfilesOverride.mosquitero,
          regla: reglas.regla_mosquitero,
          ancho: mosquiteroAncho,
          alto: mosquiteroAlto,
          label: 'MOSQUITERO',
          incluir: conMosquitero,
        },
        {
          perfil: perfilesOverride.batiente,
          regla: reglas.regla_batiente,
          ancho: hojaAncho,
          alto: hojaAlto,
          label: 'BATIENTE',
          incluir: true,
        },
        {
          perfil: perfilesOverride.tapajamba,
          regla: reglas.regla_tapajamba,
          ancho: width_cm,
          alto: height_cm,
          label: 'TAPAJAMBA',
          incluir: true,
        },
      ];

      for (const { perfil, regla, ancho, alto, label, incluir } of perfiles) {
        if (!incluir || !perfil || !regla) continue;

        // ── Bin-packing real: genera los cortes individuales y los empaca ──
        // Math.ceil(totalCm/580 * qty) subestima cuando la regla tiene
        // multiplicador alto (ej: *4) porque no puede fraccionar barras.
        const cortesPorVentana = this.getCutsFromRule(regla, ancho, alto);
        const todosLosCortes: number[] = [];
        for (let q = 0; q < quantity; q++) {
          todosLosCortes.push(...cortesPorVentana);
        }
        const barrasEnteras = this.ffdBinPack(todosLosCortes, LARGO_BARRA_CM);

        const precio = esBlanco
          ? (perfil.price_white ?? 0)
          : (perfil.price_color ?? perfil.price_white ?? 0);
        const costoLinea = barrasEnteras * precio;

        detalle.push({
          material_id: perfil.id,
          nombre: perfil.name,
          tipo: label,
          cantidad: barrasEnteras,
          precio_unitario: precio,
          costo_total: costoLinea,
          unidad: 'barras',
        });

        // ── REFUERZO HOJAS: misma cantidad de barras que la hoja ────────────
        if (label === 'HOJA' && conRefuerzoHojas && catalogo.refuerzoHoja) {
          const precioRef = esBlanco
            ? (catalogo.refuerzoHoja.price_white ?? 0)
            : (catalogo.refuerzoHoja.price_color ??
              catalogo.refuerzoHoja.price_white ??
              0);
          detalle.push({
            material_id: catalogo.refuerzoHoja.id,
            nombre: catalogo.refuerzoHoja.name,
            tipo: 'PERFIL',
            cantidad: barrasEnteras,
            precio_unitario: precioRef,
            costo_total: barrasEnteras * precioRef,
            unidad: 'barras',
          });
        }

        // ── REFUERZO MOSQUITERO: misma cantidad de barras que el mosquitero ─
        if (
          label === 'MOSQUITERO' &&
          conRefuerzoMosquitero &&
          catalogo.refuerzoMosquitero
        ) {
          const precioRef = esBlanco
            ? (catalogo.refuerzoMosquitero.price_white ?? 0)
            : (catalogo.refuerzoMosquitero.price_color ??
              catalogo.refuerzoMosquitero.price_white ??
              0);
          detalle.push({
            material_id: catalogo.refuerzoMosquitero.id,
            nombre: catalogo.refuerzoMosquitero.name,
            tipo: 'PERFIL',
            cantidad: barrasEnteras,
            precio_unitario: precioRef,
            costo_total: barrasEnteras * precioRef,
            unidad: 'barras',
          });
        }
      }

      // ── Vidrio: siempre se calcula si la ventana tiene vidrios configurados ──
      // El mosquitero es independiente — el vidrio siempre va en la ventana
      if (cantVidrios && cantVidrios > 0 && input.glass_color_id) {
        const glassColor = await this.prisma.glassColor.findUnique({
          where: { id: input.glass_color_id },
          include: { material: true },
        });

        if (glassColor?.material) {
          const materialVidrio = glassColor.material;
          const areaVidrioCm2 = mosquiteroAncho * mosquiteroAlto * cantVidrios;
          const planchasEnteras = Math.ceil(
            (areaVidrioCm2 / PLANCHA_VIDRIO_CM2) * quantity,
          );
          const precioVidrio = esBlanco
            ? (materialVidrio.price_white ?? materialVidrio.price_color ?? 0)
            : (materialVidrio.price_color ?? materialVidrio.price_white ?? 0);

          detalle.push({
            material_id: materialVidrio.id,
            nombre: materialVidrio.name,
            tipo: 'VIDRIO',
            cantidad: planchasEnteras,
            precio_unitario: precioVidrio,
            costo_total: planchasEnteras * precioVidrio,
            unidad: 'planchas',
          });
        }
      }
    }

    await this.calcularAccesorios(
      window_type_id,
      options,
      esBlanco,
      quantity,
      detalle,
      conMosquitero,
    );

    const costo_perfiles = detalle
      .filter((d) =>
        [
          'MARCO',
          'HOJA',
          'MOSQUITERO',
          'BATIENTE',
          'TAPAJAMBA',
          'PERFIL',
        ].includes(d.tipo),
      )
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_vidrio = detalle
      .filter((d) => d.tipo === 'VIDRIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_accesorios = detalle
      .filter((d) => d.tipo === 'ACCESORIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_total = costo_perfiles + costo_vidrio + costo_accesorios;

    // Leer margen desde AppSettings — configurable por admin
    const margenDecimal = (await this.appSettings.getProfitMargin()) / 100;
    const margenDivisor = Math.max(0.01, Math.min(0.99, 1 - margenDecimal));

    return {
      costo_perfiles,
      costo_vidrio,
      costo_accesorios,
      costo_total,
      precio_sugerido_minimo: costo_total / margenDivisor,
      detalle,
    };
  }

  private async resolverPerfilesOverride(
    reglas: ResolvedRules,
    catalogo: {
      perfilMarco: any;
      perfilHoja: any;
      perfilMosquitero: any;
      perfilBatiente: any;
      perfilTapajamba: any;
    },
  ) {
    const idsACargar = [
      reglas.perfil_marco_id,
      reglas.perfil_hoja_id,
      reglas.perfil_mosquitero_id,
      reglas.perfil_batiente_id,
      reglas.perfil_tapajamba_id,
    ].filter((id): id is number => id !== null);

    const materialesOverride =
      idsACargar.length > 0
        ? await this.prisma.material.findMany({
            where: { id: { in: idsACargar } },
          })
        : [];

    const byId = new Map(materialesOverride.map((m) => [m.id, m]));

    return {
      marco:
        reglas.perfil_marco_id !== null
          ? (byId.get(reglas.perfil_marco_id) ?? catalogo.perfilMarco)
          : catalogo.perfilMarco,
      hoja:
        reglas.perfil_hoja_id !== null
          ? (byId.get(reglas.perfil_hoja_id) ?? catalogo.perfilHoja)
          : catalogo.perfilHoja,
      mosquitero:
        reglas.perfil_mosquitero_id !== null
          ? (byId.get(reglas.perfil_mosquitero_id) ?? catalogo.perfilMosquitero)
          : catalogo.perfilMosquitero,
      batiente:
        reglas.perfil_batiente_id !== null
          ? (byId.get(reglas.perfil_batiente_id) ?? catalogo.perfilBatiente)
          : catalogo.perfilBatiente,
      tapajamba:
        reglas.perfil_tapajamba_id !== null
          ? (byId.get(reglas.perfil_tapajamba_id) ?? catalogo.perfilTapajamba)
          : catalogo.perfilTapajamba,
    };
  }

  public aplicarRuleOverrides(
    catalogo: {
      regla_marco: string | null;
      regla_hoja: string | null;
      regla_mosquitero: string | null;
      regla_batiente: string | null;
      regla_tapajamba: string | null;
      ruleOverrides?: any;
    },
    options: Record<string, string>,
  ): ResolvedRules {
    let regla_marco = catalogo.regla_marco;
    let regla_hoja = catalogo.regla_hoja;
    let regla_mosquitero = catalogo.regla_mosquitero;
    let regla_batiente = catalogo.regla_batiente;
    let regla_tapajamba = catalogo.regla_tapajamba;

    let perfil_marco_id: number | null = null;
    let perfil_hoja_id: number | null = null;
    let perfil_mosquitero_id: number | null = null;
    let perfil_batiente_id: number | null = null;
    let perfil_tapajamba_id: number | null = null;
    let cant_vidrios: number | null = null;

    if (!catalogo.ruleOverrides || !options) {
      return {
        regla_marco,
        regla_hoja,
        regla_mosquitero,
        regla_batiente,
        regla_tapajamba,
        perfil_marco_id,
        perfil_hoja_id,
        perfil_mosquitero_id,
        perfil_batiente_id,
        perfil_tapajamba_id,
        cant_vidrios,
      };
    }

    const overrides = catalogo.ruleOverrides as Record<
      string,
      Record<string, any>
    >;

    // Excluir los keys de mosquitero/refuerzo del procesamiento de ruleOverrides
    // para que no interfieran con la lógica de perfiles
    const SKIP_KEYS = new Set([
      'mosquitero',
      'refuerzo_hojas',
      'refuerzo_mosquitero',
    ]);

    for (const [optionGroup, optionValue] of Object.entries(options)) {
      if (SKIP_KEYS.has(optionGroup)) continue;
      const override = overrides[optionValue];
      if (!override) continue;

      if (override.regla_marco) regla_marco = override.regla_marco;
      if (override.regla_hoja) regla_hoja = override.regla_hoja;
      if (override.regla_mosquitero)
        regla_mosquitero = override.regla_mosquitero;
      if (override.regla_batiente) regla_batiente = override.regla_batiente;
      if (override.regla_tapajamba) regla_tapajamba = override.regla_tapajamba;

      if (override.perfil_marco_id != null)
        perfil_marco_id = Number(override.perfil_marco_id);
      if (override.perfil_hoja_id != null)
        perfil_hoja_id = Number(override.perfil_hoja_id);
      if (override.perfil_mosquitero_id != null)
        perfil_mosquitero_id = Number(override.perfil_mosquitero_id);
      if (override.perfil_batiente_id != null)
        perfil_batiente_id = Number(override.perfil_batiente_id);
      if (override.perfil_tapajamba_id != null)
        perfil_tapajamba_id = Number(override.perfil_tapajamba_id);
      if (override.cant_vidrios != null)
        cant_vidrios = Number(override.cant_vidrios);
    }

    return {
      regla_marco,
      regla_hoja,
      regla_mosquitero,
      regla_batiente,
      regla_tapajamba,
      perfil_marco_id,
      perfil_hoja_id,
      perfil_mosquitero_id,
      perfil_batiente_id,
      perfil_tapajamba_id,
      cant_vidrios,
    };
  }

  public calcularMedidasHoja(
    width: number,
    height: number,
    calcParams: any,
    options: Record<string, string>,
  ): { hojaAncho: number; hojaAlto: number; vidrioDescuento: number } {
    if (!calcParams) {
      return { hojaAncho: width, hojaAlto: height, vidrioDescuento: 0 };
    }

    let hojaMargen = calcParams.hojaMargen ?? 0;
    let hojaDescuento = calcParams.hojaDescuento ?? 0;
    let hojaDivision = calcParams.hojaDivision ?? 'Completo';
    let vidrioDescuento = calcParams.vidrioDescuento ?? 0;

    if (options && calcParams.calculationOverrides) {
      const overrides = calcParams.calculationOverrides as Record<string, any>;
      const SKIP_KEYS = new Set([
        'mosquitero',
        'refuerzo_hojas',
        'refuerzo_mosquitero',
      ]);
      for (const [optionGroup, optionValue] of Object.entries(options)) {
        if (SKIP_KEYS.has(optionGroup)) continue;
        const override = overrides[optionValue as string];
        if (override) {
          hojaMargen = override.hojaMargen ?? hojaMargen;
          hojaDescuento = override.hojaDescuento ?? hojaDescuento;
          hojaDivision = override.hojaDivision ?? hojaDivision;
          vidrioDescuento = override.vidrioDescuento ?? vidrioDescuento;
        }
      }
    }

    let hojaAncho: number;
    switch (hojaDivision) {
      case 'Mitad':
        hojaAncho = (width + hojaMargen) / 2;
        break;
      case 'Tercios':
        hojaAncho = (width + hojaMargen) / 3;
        break;
      case 'Cuartos':
        hojaAncho = (width + hojaMargen) / 4;
        break;
      default:
        hojaAncho = width + hojaMargen;
        break;
    }

    return {
      hojaAncho: Number(hojaAncho.toFixed(2)),
      hojaAlto: Number((height - hojaDescuento).toFixed(2)),
      vidrioDescuento,
    };
  }

  public applyRule(regla: string, ancho: number, alto: number): number {
    const r = regla.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const mult = match ? parseInt(match[1], 10) : 1;
    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO'))
      return ancho + alto * mult;
    if (r.includes('SUMAR ANCHO Y ALTO')) return (ancho + alto) * mult;
    if (r.includes('SUMAR ALTO')) return alto * mult;
    return (ancho + alto) * mult;
  }

  public getIndividualCutsFromMeasures(
    rule: string,
    ancho: number,
    alto: number,
  ): number[] {
    const r = rule.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const mult = match ? parseInt(match[1], 10) : 1;
    const cuts: number[] = [];

    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      cuts.push(ancho);
      for (let i = 0; i < mult; i++) cuts.push(alto);
    } else if (r.includes('ANCHO') && r.includes('ALTO')) {
      const repeatCount = mult / 2;
      for (let i = 0; i < repeatCount; i++) cuts.push(ancho, alto);
    } else if (r.includes('ALTO')) {
      for (let i = 0; i < mult; i++) cuts.push(alto);
    }

    return cuts.map((c) => Number(c.toFixed(1)));
  }

  private async calcularAccesorios(
    window_type_id: number,
    options: Record<string, string>,
    esBlanco: boolean,
    quantity: number,
    detalle: MaterialCostLine[],
    conMosquitero: boolean,
  ): Promise<void> {
    const rules = await this.getAccessoryRules(window_type_id);

    for (const rule of rules) {
      const esFija = !rule.option_group && !rule.option_key;
      const aplicaCondicional =
        rule.option_group &&
        rule.option_key &&
        options[rule.option_group] === rule.option_key;

      if (!esFija && !aplicaCondicional) continue;

      // ── Si el mosquitero está desactivado, omitir accesorios de mosquitero ─
      // Identificamos accesorios de mosquitero por nombre
      if (!conMosquitero) {
        const nombreUpper = rule.material.name.toUpperCase();
        if (
          nombreUpper.includes('MOSQUITERO') ||
          nombreUpper.includes('CEDAZO') ||
          nombreUpper.includes('MAYA')
        )
          continue;
      }

      const precio = esBlanco
        ? (rule.material.price_white ?? 0)
        : (rule.material.price_color ?? rule.material.price_white ?? 0);
      const cantidad = rule.quantity * quantity;

      detalle.push({
        material_id: rule.material.id,
        nombre: rule.material.name,
        tipo: 'ACCESORIO',
        cantidad,
        precio_unitario: precio,
        costo_total: cantidad * precio,
        unidad: rule.material.unit ?? 'unidad',
      });
    }
  }

  async calcularCostoCotizacion(
    windows: WindowCostInput[],
  ): Promise<QuotationCostResult> {
    const resultados = await Promise.all(
      windows.map((w) => this.calcularCostoVentana(w)),
    );
    const costo_total_proyecto = resultados.reduce(
      (s, r) => s + r.costo_total,
      0,
    );
    const margenDecimal = (await this.appSettings.getProfitMargin()) / 100;
    const margenDivisor = Math.max(0.01, Math.min(0.99, 1 - margenDecimal));
    return {
      costo_total_proyecto,
      precio_sugerido_minimo: costo_total_proyecto / margenDivisor,
      por_ventana: resultados,
    };
  }

  // ── Genera los cortes individuales de una barra según la regla ─────────────
  // Idéntico a getCutsWithDimension del reports.service para consistencia.
  private getCutsFromRule(
    regla: string,
    ancho: number,
    alto: number,
  ): number[] {
    const r = regla.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const mult = match ? parseInt(match[1], 10) : 2;
    const cuts: number[] = [];
    const a = Number(ancho.toFixed(1));
    const h = Number(alto.toFixed(1));

    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      cuts.push(a);
      for (let i = 0; i < mult; i++) cuts.push(h);
    } else if (r.includes('ANCHO') && r.includes('ALTO')) {
      for (let i = 0; i < mult; i++) cuts.push(a);
      for (let i = 0; i < mult; i++) cuts.push(h);
    } else if (r.includes('ALTO')) {
      for (let i = 0; i < mult; i++) cuts.push(h);
    } else {
      for (let i = 0; i < mult; i++) cuts.push(a);
      for (let i = 0; i < mult; i++) cuts.push(h);
    }
    return cuts;
  }

  // ── First-Fit Decreasing bin-packing — devuelve número de barras ──────────
  private ffdBinPack(cuts: number[], barLen: number): number {
    const sorted = [...cuts].sort((a, b) => b - a);
    const bins: number[] = []; // cada bin = espacio restante
    for (const cut of sorted) {
      if (cut > barLen) continue; // corte imposible — ignorar
      let placed = false;
      for (let i = 0; i < bins.length; i++) {
        if (cut <= bins[i]) {
          bins[i] -= cut;
          placed = true;
          break;
        }
      }
      if (!placed) bins.push(barLen - cut);
    }
    return bins.length || 1;
  }
}
