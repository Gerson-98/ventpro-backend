// RUTA: src/cost-calculator/cost-calculator.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

// ── Resultado ampliado de aplicarRuleOverrides ────────────────────────────────
// Ahora incluye también los IDs de perfil resueltos según las opciones elegidas.
// null significa "usar el perfil base del catálogo sin cambios".
export interface ResolvedRules {
  regla_marco: string | null;
  regla_hoja: string | null;
  regla_mosquitero: string | null;
  regla_batiente: string | null;
  regla_tapajamba: string | null;
  // Perfiles resueltos — null = usar el del catálogo base
  perfil_marco_id: number | null;
  perfil_hoja_id: number | null;
  perfil_mosquitero_id: number | null;
  perfil_batiente_id: number | null;
  perfil_tapajamba_id: number | null;
  // cant_vidrios resuelto — null = usar el del catálogo base
  cant_vidrios: number | null;
}

const LARGO_BARRA_CM = 580;
const PLANCHA_VIDRIO_CM2 = 35310;
const MARGEN_MINIMO = 0.4;

// ── TTL del cache de catálogos: 5 minutos ─────────────────────────────────────
// Los catálogos (tipos de ventana, cálculos, perfiles) raramente cambian en runtime.
// Cachearlos elimina el 60-70% de las queries al calcular costos de ventanas.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CostCalculatorService {
  constructor(private prisma: PrismaService) {}

  // ── Cache en memoria (por instancia del servicio) ─────────────────────────
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

  // Limpia el cache manualmente — llamar desde admin cuando se actualicen catálogos
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
      },
    });
    // Cachear aunque sea null (tipo de ventana sin catálogo configurado)
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

    // ── Usar métodos con cache — evita 4 queries repetidas por ventana ────────
    // En una cotización de 80 ventanas del mismo tipo, esto pasa de ~320 queries
    // a ~4 queries (solo la primera vez por window_type_id en esa sesión).
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

    const detalle: MaterialCostLine[] = [];

    if (catalogo) {
      // ── Aplicar ruleOverrides + perfilOverrides según opciones elegidas ────
      const reglas = this.aplicarRuleOverrides(catalogo, options);

      // ── Resolver perfiles finales: override tiene prioridad sobre base ─────
      // Si aplicarRuleOverrides devuelve un perfil_X_id != null, ese perfil
      // reemplaza al del catálogo base. Hay que cargarlo desde BD.
      const perfilesOverride = await this.resolverPerfilesOverride(
        reglas,
        catalogo,
      );

      // ── cant_vidrios resuelto ──────────────────────────────────────────────
      const cantVidrios = reglas.cant_vidrios ?? catalogo.cant_vidrios;

      const perfiles = [
        {
          perfil: perfilesOverride.marco,
          regla: reglas.regla_marco,
          ancho: width_cm,
          alto: height_cm,
          label: 'MARCO',
        },
        {
          perfil: perfilesOverride.hoja,
          regla: reglas.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
          label: 'HOJA',
        },
        {
          perfil: perfilesOverride.mosquitero,
          regla: reglas.regla_mosquitero,
          ancho: mosquiteroAncho,
          alto: mosquiteroAlto,
          label: 'MOSQUITERO',
        },
        {
          perfil: perfilesOverride.batiente,
          regla: reglas.regla_batiente,
          ancho: hojaAncho,
          alto: hojaAlto,
          label: 'BATIENTE',
        },
        {
          perfil: perfilesOverride.tapajamba,
          regla: reglas.regla_tapajamba,
          ancho: width_cm,
          alto: height_cm,
          label: 'TAPAJAMBA',
        },
      ];

      for (const { perfil, regla, ancho, alto, label } of perfiles) {
        if (!perfil || !regla) continue;

        const metrosTotales = this.applyRule(regla, ancho, alto);
        const barras = metrosTotales / LARGO_BARRA_CM;

        const precio = esBlanco
          ? (perfil.price_white ?? 0)
          : (perfil.price_color ?? perfil.price_white ?? 0);

        const barrasEnteras = Math.ceil(barras * quantity);
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
      }

      // ── Vidrio ─────────────────────────────────────────────────────────────
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
    );

    const costo_perfiles = detalle
      .filter((d) =>
        ['MARCO', 'HOJA', 'MOSQUITERO', 'BATIENTE', 'TAPAJAMBA'].includes(
          d.tipo,
        ),
      )
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_vidrio = detalle
      .filter((d) => d.tipo === 'VIDRIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_accesorios = detalle
      .filter((d) => d.tipo === 'ACCESORIO')
      .reduce((s, d) => s + d.costo_total, 0);
    const costo_total = costo_perfiles + costo_vidrio + costo_accesorios;

    return {
      costo_perfiles,
      costo_vidrio,
      costo_accesorios,
      costo_total,
      precio_sugerido_minimo: costo_total / MARGEN_MINIMO,
      detalle,
    };
  }

  // ── Helper: carga desde BD los perfiles resueltos por el override ──────────
  // Si el override no cambió un perfil (null), usa el del catálogo base.
  // Esto evita N+1 — solo consulta los perfiles que realmente cambiaron.
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
    // Recolectar IDs únicos que necesitan cargarse desde BD
    const idsACargar = [
      reglas.perfil_marco_id,
      reglas.perfil_hoja_id,
      reglas.perfil_mosquitero_id,
      reglas.perfil_batiente_id,
      reglas.perfil_tapajamba_id,
    ].filter((id): id is number => id !== null);

    // Una sola query para todos los perfiles que cambiaron
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

  /**
   * Aplica ruleOverrides del catálogo según las opciones elegidas por el usuario.
   *
   * ── Formato del JSON ruleOverrides (ampliado) ──────────────────────────────
   * Ahora soporta además de reglas, overrides de perfil y cant_vidrios:
   *
   * {
   *   "afuera": {
   *     "perfil_hoja_id": 56,
   *     "regla_hoja": "SUMAR ANCHO Y ALTO Y *4"
   *   },
   *   "adentro": {
   *     "perfil_hoja_id": 11,
   *     "regla_hoja": "SUMAR ANCHO Y ALTO Y *4"
   *   },
   *   "1": {
   *     "cant_vidrios": 1
   *   },
   *   "2": {
   *     "cant_vidrios": 2
   *   },
   *   "laterales_ocultos": {
   *     "regla_mosquitero": "SUMAR ANCHO Y ALTO Y *4"
   *   }
   * }
   *
   * Campos soportados en cada override:
   *   regla_marco, regla_hoja, regla_mosquitero, regla_batiente, regla_tapajamba
   *   perfil_marco_id, perfil_hoja_id, perfil_mosquitero_id,
   *   perfil_batiente_id, perfil_tapajamba_id
   *   cant_vidrios
   *
   * null en los campos de perfil/cant_vidrios = sin cambio, usar el base.
   */
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
    // Empezar con las reglas base del catálogo
    let regla_marco = catalogo.regla_marco;
    let regla_hoja = catalogo.regla_hoja;
    let regla_mosquitero = catalogo.regla_mosquitero;
    let regla_batiente = catalogo.regla_batiente;
    let regla_tapajamba = catalogo.regla_tapajamba;

    // Perfiles: null = sin override, usar el base
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

    // Iterar todos los valores de las opciones elegidas por el usuario
    for (const optionValue of Object.values(options)) {
      const override = overrides[optionValue];
      if (!override) continue;

      // ── Reglas de cálculo ──────────────────────────────────────────────────
      if (override.regla_marco) regla_marco = override.regla_marco;
      if (override.regla_hoja) regla_hoja = override.regla_hoja;
      if (override.regla_mosquitero)
        regla_mosquitero = override.regla_mosquitero;
      if (override.regla_batiente) regla_batiente = override.regla_batiente;
      if (override.regla_tapajamba) regla_tapajamba = override.regla_tapajamba;

      // ── Perfiles (IDs de material) ─────────────────────────────────────────
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

      // ── Cantidad de vidrios ────────────────────────────────────────────────
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
      for (const optionValue of Object.values(options)) {
        if (overrides[optionValue as string]) {
          const override = overrides[optionValue as string];
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
    const multiplier = match ? parseInt(match[1], 10) : 1;
    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO'))
      return ancho + alto * multiplier;
    if (r.includes('SUMAR ANCHO Y ALTO')) return (ancho + alto) * multiplier;
    if (r.includes('SUMAR ALTO')) return alto * multiplier;
    return (ancho + alto) * multiplier;
  }

  public getIndividualCutsFromMeasures(
    rule: string,
    ancho: number,
    alto: number,
  ): number[] {
    const r = rule.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const multiplier = match ? parseInt(match[1], 10) : 1;
    const cuts: number[] = [];

    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      cuts.push(ancho);
      for (let i = 0; i < multiplier; i++) cuts.push(alto);
    } else if (r.includes('ANCHO') && r.includes('ALTO')) {
      const repeatCount = multiplier / 2;
      for (let i = 0; i < repeatCount; i++) cuts.push(ancho, alto);
    } else if (r.includes('ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push(alto);
    }

    return cuts.map((c) => Number(c.toFixed(1)));
  }

  private async calcularAccesorios(
    window_type_id: number,
    options: Record<string, string>,
    esBlanco: boolean,
    quantity: number,
    detalle: MaterialCostLine[],
  ): Promise<void> {
    // Usar cache — las reglas de accesorios no cambian en runtime
    const rules = await this.getAccessoryRules(window_type_id);

    for (const rule of rules) {
      const esFija = !rule.option_group && !rule.option_key;
      const aplicaCondicional =
        rule.option_group &&
        rule.option_key &&
        options[rule.option_group] === rule.option_key;
      if (!esFija && !aplicaCondicional) continue;

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
    return {
      costo_total_proyecto,
      precio_sugerido_minimo: costo_total_proyecto / MARGEN_MINIMO,
      por_ventana: resultados,
    };
  }
}
