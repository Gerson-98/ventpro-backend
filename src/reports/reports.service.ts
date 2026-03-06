// RUTA: src/reports/reports.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Window, Material, AccessoryRule } from '@prisma/client';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';

type AccessoryRuleWithMaterial = AccessoryRule & { material: Material };

// ── Tipo para Series de Máquina ───────────────────────────────────────────────
// Cada serie = 1 ciclo de la cortadora con 3 ranuras (2 HOJA + 1 MOSQUITERO).
// Las 3 barras reciben exactamente el mismo patrón de cortes.
interface MachineSerie {
  serieIndex: number;
  cuts: { length: number; windowLabel: string }[];
  totalUsed: number;
  waste: number;
  efficiency: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private costCalculator: CostCalculatorService,
  ) {}

  private async enrichWindowMeasures(windows: any[]): Promise<any[]> {
    const allCalcParams = await this.prisma.windowCalculation.findMany();
    const calcParamsMap = new Map(
      allCalcParams.map((c) => [c.window_type_id, c]),
    );

    return windows.map((window) => {
      const options = (window.options as Record<string, string>) || {};
      const calcParams = calcParamsMap.get(window.window_type_id ?? 0);

      const { hojaAncho, hojaAlto, vidrioDescuento } =
        this.costCalculator.calcularMedidasHoja(
          window.width_cm,
          window.height_cm,
          calcParams,
          options,
        );

      const mosquiteroAncho = Number((hojaAncho - vidrioDescuento).toFixed(2));
      const mosquiteroAlto = Number((hojaAlto - vidrioDescuento).toFixed(2));

      return {
        ...window,
        hojaAncho,
        hojaAlto,
        mosquiteroAncho,
        mosquiteroAlto,
        vidrioAncho: mosquiteroAncho,
        vidrioAlto: mosquiteroAlto,
      };
    });
  }

  private async processWindowsToReport(windows: any[]) {
    const enrichedWindows = await this.enrichWindowMeasures(windows);

    // ── Cargar todos los materiales una sola vez ───────────────────────────
    // materialsMap: por nombre (para DUELA, etc.)
    // materialsById: por ID (para resolver perfil overrides del ruleOverrides)
    const allMaterials = await this.prisma.material.findMany();
    const materialsMap = new Map(allMaterials.map((m) => [m.name, m]));
    const materialsById = new Map(allMaterials.map((m) => [m.id, m]));

    const catalogMap = new Map(
      (
        await this.prisma.catalogoPerfiles.findMany({
          include: {
            perfilMarco: true,
            perfilHoja: true,
            perfilMosquitero: true,
            perfilBatiente: true,
            perfilTapajamba: true,
          },
        })
      ).map((p) => [p.window_type_id, p]),
    );

    const accessoryRules: AccessoryRuleWithMaterial[] =
      await this.prisma.accessoryRule.findMany({
        include: { material: true },
      });

    const rulesByWindowType = new Map<number, AccessoryRuleWithMaterial[]>();
    accessoryRules.forEach((rule) => {
      if (!rulesByWindowType.has(rule.window_type_id))
        rulesByWindowType.set(rule.window_type_id, []);
      rulesByWindowType.get(rule.window_type_id)!.push(rule);
    });

    // ── Tipo para acumular piezas individuales por perfil ───────────────────
    // Los perfiles de corte acumulan piezas físicas (cuts[]) y se cuentan
    // con bin-packing FFD — igual que el optimizador de corte.
    // DUELA es un caso especial: material continuo que usa totalLength.
    interface ProfileAccum {
      material: any;
      pvcColor: string;
      cuts: number[];
      totalLength: number; // solo usado por DUELA
      isDuela: boolean;
    }
    const profilesReportMap = new Map<string, ProfileAccum>();
    const accessoriesReportMap = new Map<string, any>();
    const glassReportMap = new Map<string, any>();

    const BAR_LENGTH_REPORT = 580;

    for (const window of enrichedWindows) {
      if (!window || !window.windowType || !window.pvcColor) continue;

      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;
      const options = (window.options as any) || {};

      const hojaAncho = window.hojaAncho ?? window.width_cm;
      const hojaAlto = window.hojaAlto ?? window.height_cm;
      const mosquiteroAncho = window.mosquiteroAncho ?? hojaAncho;
      const mosquiteroAlto = window.mosquiteroAlto ?? hojaAlto;
      const vidrioAncho = window.vidrioAncho ?? hojaAncho;
      const vidrioAlto = window.vidrioAlto ?? hojaAlto;

      // ── aplicarRuleOverrides ahora resuelve reglas + perfiles + cant_vidrios
      const reglas = this.costCalculator.aplicarRuleOverrides(
        catalogEntry,
        options,
      );

      // ── Resolver perfil final para cada slot ──────────────────────────────
      // Si el ruleOverrides definió un perfil_X_id para la opción elegida,
      // ese material reemplaza al base. Sin ningún switch hardcodeado.
      const perfilMarcoFinal =
        reglas.perfil_marco_id !== null
          ? (materialsById.get(reglas.perfil_marco_id) ??
            catalogEntry.perfilMarco)
          : catalogEntry.perfilMarco;
      const perfilHojaFinal =
        reglas.perfil_hoja_id !== null
          ? (materialsById.get(reglas.perfil_hoja_id) ??
            catalogEntry.perfilHoja)
          : catalogEntry.perfilHoja;
      const perfilMosquiteroFinal =
        reglas.perfil_mosquitero_id !== null
          ? (materialsById.get(reglas.perfil_mosquitero_id) ??
            catalogEntry.perfilMosquitero)
          : catalogEntry.perfilMosquitero;
      const perfilBatienteFinal =
        reglas.perfil_batiente_id !== null
          ? (materialsById.get(reglas.perfil_batiente_id) ??
            catalogEntry.perfilBatiente)
          : catalogEntry.perfilBatiente;
      const perfilTapajambaFinal =
        reglas.perfil_tapajamba_id !== null
          ? (materialsById.get(reglas.perfil_tapajamba_id) ??
            catalogEntry.perfilTapajamba)
          : catalogEntry.perfilTapajamba;

      // ── cant_vidrios resuelto ──────────────────────────────────────────────
      const cantVidrios = reglas.cant_vidrios ?? catalogEntry.cant_vidrios;

      // ── El switch hardcodeado fue ELIMINADO completamente ─────────────────
      // Antes: casos especiales para PUERTA DE LUJO, VENTANA ABATIBLE, etc.
      // Ahora: todo se configura en el JSON ruleOverrides desde la app.
      // El admin elige qué perfil usar según cada opción — sin tocar código.
      const dynamicProfiles = [
        {
          type: 'MARCO',
          material: perfilMarcoFinal,
          rule: reglas.regla_marco,
          ancho: window.width_cm,
          alto: window.height_cm,
        },
        {
          type: 'HOJA',
          material: perfilHojaFinal,
          rule: reglas.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
        },
        {
          type: 'MOSQUITERO',
          material: perfilMosquiteroFinal,
          rule: reglas.regla_mosquitero,
          ancho: mosquiteroAncho,
          alto: mosquiteroAlto,
        },
        {
          type: 'BATIENTE',
          material: perfilBatienteFinal,
          rule: reglas.regla_batiente,
          ancho: hojaAncho,
          alto: hojaAlto,
        },
        {
          type: 'TAPAJAMBA',
          material: perfilTapajambaFinal,
          rule: reglas.regla_tapajamba,
          ancho: window.width_cm,
          alto: window.height_cm,
        },
      ];

      // 1. ACCESORIOS
      if (window.window_type_id) {
        const rules = rulesByWindowType.get(window.window_type_id) || [];
        for (const rule of rules) {
          const shouldAdd =
            !rule.option_group ||
            options[rule.option_group] === rule.option_key;
          if (shouldAdd && rule.material) {
            const key = `${rule.material.name}|${window.pvcColor.name}`;
            const existing = accessoriesReportMap.get(key) || {
              material: rule.material,
              quantity: 0,
              pvcColor: window.pvcColor.name,
              note: '',
            };
            if (rule.material.name === 'LANCETA')
              existing.note = `Cortar a ${window.width_cm} cm`;
            existing.quantity += rule.quantity * windowQuantity;
            accessoriesReportMap.set(key, existing);
          }
        }
      }

      // 2. PERFILES — acumular piezas individuales (no metros lineales)
      //    para que el conteo de barras use bin-packing real (FFD),
      //    idéntico al optimizador de corte.
      for (const profile of dynamicProfiles) {
        if (profile.material && profile.rule) {
          const individualCuts = this.getCutsWithDimension(
            profile.rule,
            profile.ancho,
            profile.alto,
          );
          if (individualCuts.length === 0) continue;

          const key = `${window.pvcColor.name}|${profile.material.name}`;
          if (!profilesReportMap.has(key)) {
            profilesReportMap.set(key, {
              material: profile.material,
              pvcColor: window.pvcColor.name,
              cuts: [],
              totalLength: 0,
              isDuela: false,
            });
          }
          const existing = profilesReportMap.get(key)!;
          // Agregar cada pieza × cantidad de ventanas
          for (let q = 0; q < windowQuantity; q++) {
            for (const cut of individualCuts) {
              existing.cuts.push(Number(cut.length.toFixed(1)));
            }
          }
        }
      }

      // 3. VIDRIOS
      if (window.glassColor) {
        const glassNameUpper = window.glassColor.name.toUpperCase();

        if (glassNameUpper.includes('DUELA')) {
          const duelaMaterial = materialsMap.get('DUELA');
          if (duelaMaterial) {
            const stripsNeeded = Math.ceil(vidrioAlto / 15);
            const totalDuelaLength = stripsNeeded * vidrioAncho;
            const key = `${window.pvcColor.name}|${duelaMaterial.name}`;
            if (!profilesReportMap.has(key)) {
              profilesReportMap.set(key, {
                material: duelaMaterial,
                pvcColor: window.pvcColor.name,
                cuts: [],
                totalLength: 0,
                isDuela: true,
              });
            }
            profilesReportMap.get(key)!.totalLength +=
              totalDuelaLength * windowQuantity;
          }
        } else if (glassNameUpper !== 'VIDRIO Y DUELA') {
          const glassMaterial = materialsMap.get(window.glassColor.name);
          if (glassMaterial && vidrioAncho > 0 && vidrioAlto > 0) {
            const key = glassMaterial.name;
            const glassCount = cantVidrios ?? 1;
            const glassArea =
              vidrioAncho * vidrioAlto * glassCount * windowQuantity;
            const existing = glassReportMap.get(key) || {
              material: glassMaterial,
              totalArea: 0,
            };
            existing.totalArea += glassArea;
            glassReportMap.set(key, existing);
          }
        }
      }
    }

    const profilesReport = Array.from(profilesReportMap.values()).map(
      (item) => {
        const isWhite = item.pvcColor.toUpperCase().includes('BLANCO');
        const price = isWhite
          ? item.material.price_white
          : item.material.price_color;
        // DUELA usa totalLength (material continuo sin piezas individuales)
        // Todos los demás perfiles usan bin-packing FFD (mismo algoritmo que el optimizador)
        const barras = item.isDuela
          ? Math.ceil(item.totalLength / BAR_LENGTH_REPORT)
          : this.optimizeCuts(item.cuts, BAR_LENGTH_REPORT).length;
        return {
          tipo: 'PERFIL',
          nombre: item.material.name,
          color: item.pvcColor,
          cantidad: barras,
          unidad: item.material.unit || 'Barra 5.8m',
          precioUnitario: price || 0,
          precioTotal: (price || 0) * barras,
        };
      },
    );

    const accessoriesReport = Array.from(accessoriesReportMap.values()).map(
      (item) => {
        const isWhite = item.pvcColor.toUpperCase().includes('BLANCO');
        const price = isWhite
          ? item.material.price_white
          : item.material.price_color;
        return {
          tipo: 'ACCESORIO',
          nombre: item.material.name,
          color: isWhite ? 'Blanco' : 'Negro',
          cantidad: item.quantity,
          unidad: item.material.unit || 'Unidades',
          precioUnitario: price || 0,
          precioTotal: (price || 0) * item.quantity,
          note: item.note,
        };
      },
    );

    const glassReport = Array.from(glassReportMap.values()).map((item) => {
      const price = item.material.price_white || item.material.price_color || 0;
      const planchas = Math.ceil(item.totalArea / 35310);
      return {
        tipo: 'VIDRIO',
        nombre: item.material.name,
        color: item.material.name,
        cantidad: planchas,
        unidad: 'Planchas',
        precioUnitario: price,
        precioTotal: price * planchas,
      };
    });

    return [...profilesReport, ...accessoriesReport, ...glassReport].sort(
      (a, b) =>
        a.tipo.localeCompare(b.tipo) ||
        a.color.localeCompare(b.color) ||
        a.nombre.localeCompare(b.nombre),
    );
  }

  async generateProfilesReport(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
        },
      },
    });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);
    return this.processWindowsToReport(order.windows);
  }

  async generateProfilesReportByQuotation(quotationId: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        quotation_windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
        },
      },
    });
    if (!quotation)
      throw new NotFoundException(`Cotización #${quotationId} no encontrada`);

    const normalizedWindows = quotation.quotation_windows.map((qw) => ({
      ...qw,
      window_type_id: qw.window_type_id,
      windowType: qw.windowType,
      pvcColor: qw.pvcColor,
      glassColor: qw.glassColor,
      options: qw.options || {},
      quantity: qw.quantity || 1,
    }));

    return this.processWindowsToReport(normalizedWindows);
  }

  async getOrderMaterialCost(orderId: number): Promise<number> {
    const materials = await this.generateProfilesReport(orderId);
    return materials.reduce((sum, item) => sum + (item.precioTotal || 0), 0);
  }

  async getOrderFinancialSummary(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        project: true,
        total: true,
        status: true,
        include_iva: true,
        installationStartDate: true,
        createdAt: true,
        client: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);

    const salePrice = order.total || 0;
    const materialCost = await this.getOrderMaterialCost(orderId);
    const profit = salePrice - materialCost;
    const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    return {
      orderId: order.id,
      project: order.project,
      client: order.client?.name || '—',
      status: order.status,
      salePrice,
      materialCost,
      profit,
      profitMargin: Number(profitMargin.toFixed(2)),
      createdAt: order.createdAt,
      installationStartDate: order.installationStartDate,
    };
  }

  async getDashboardProfits(filters: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    userId?: number;
  }) {
    const where: any = {};

    if (filters.status && filters.status !== 'todos') {
      where.status = filters.status;
    } else {
      where.status = { not: 'cancelado' };
    }

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    if (filters.userId) {
      where.generatedFromQuotation = { userId: filters.userId };
    }

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        project: true,
        total: true,
        status: true,
        include_iva: true,
        createdAt: true,
        installationStartDate: true,
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summaries = await Promise.all(
      orders.map(async (order) => {
        try {
          const materialCost = await this.getOrderMaterialCost(order.id);
          const salePrice = order.total || 0;
          const profit = salePrice - materialCost;
          const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
          return {
            orderId: order.id,
            project: order.project,
            client: order.client?.name || '—',
            status: order.status,
            salePrice,
            materialCost,
            profit,
            profitMargin: Number(profitMargin.toFixed(2)),
            createdAt: order.createdAt,
            installationStartDate: order.installationStartDate,
          };
        } catch {
          const salePrice = order.total || 0;
          return {
            orderId: order.id,
            project: order.project,
            client: order.client?.name || '—',
            status: order.status,
            salePrice,
            materialCost: 0,
            profit: salePrice,
            profitMargin: 100,
            createdAt: order.createdAt,
            installationStartDate: order.installationStartDate,
          };
        }
      }),
    );

    const totals = summaries.reduce(
      (acc, s) => ({
        totalSales: acc.totalSales + s.salePrice,
        totalMaterialCost: acc.totalMaterialCost + s.materialCost,
        totalProfit: acc.totalProfit + s.profit,
      }),
      { totalSales: 0, totalMaterialCost: 0, totalProfit: 0 },
    );

    const avgMargin =
      totals.totalSales > 0
        ? (totals.totalProfit / totals.totalSales) * 100
        : 0;

    const monthlyMap = new Map<
      string,
      { month: string; sales: number; cost: number; profit: number }
    >();

    for (const s of summaries) {
      const date = new Date(s.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('es-GT', {
        month: 'short',
        year: 'numeric',
      });
      const existing = monthlyMap.get(key) || {
        month: label,
        sales: 0,
        cost: 0,
        profit: 0,
      };
      existing.sales += s.salePrice;
      existing.cost += s.materialCost;
      existing.profit += s.profit;
      monthlyMap.set(key, existing);
    }

    const monthlyData = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        month: v.month,
        sales: Number(v.sales.toFixed(2)),
        cost: Number(v.cost.toFixed(2)),
        profit: Number(v.profit.toFixed(2)),
      }));

    return {
      orders: summaries,
      totals: {
        totalSales: Number(totals.totalSales.toFixed(2)),
        totalMaterialCost: Number(totals.totalMaterialCost.toFixed(2)),
        totalProfit: Number(totals.totalProfit.toFixed(2)),
        avgMargin: Number(avgMargin.toFixed(2)),
        orderCount: summaries.length,
      },
      monthlyData,
    };
  }

  async generateCutOptimizationReport(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
        },
      },
    });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);
    return this.generateCutOptimization(order.windows);
  }

  private async generateCutOptimization(windows: any[]) {
    const enrichedWindows = await this.enrichWindowMeasures(windows);

    const allMaterials = await this.prisma.material.findMany();
    const materialsById = new Map(allMaterials.map((m) => [m.id, m]));

    const catalogMap = new Map(
      (
        await this.prisma.catalogoPerfiles.findMany({
          include: {
            perfilMarco: true,
            perfilHoja: true,
            perfilMosquitero: true,
            perfilBatiente: true,
            perfilTapajamba: true,
          },
        })
      ).map((p) => [p.window_type_id, p]),
    );

    const BAR_LENGTH = 580;
    type LabeledCut = { length: number; windowLabel: string };

    const individualCutList = new Map<
      string,
      { color: string; cuts: LabeledCut[] }
    >();
    const combinableCutList = new Map<
      string,
      { color: string; hojaCuts: LabeledCut[]; mosquiteroCuts: LabeledCut[] }
    >();

    for (let wi = 0; wi < enrichedWindows.length; wi++) {
      const window = enrichedWindows[wi];
      if (!window || !window.windowType || !window.pvcColor) continue;
      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;
      const windowLabel = `V${wi + 1} - ${(window.width_cm / 100).toFixed(2)}x${(window.height_cm / 100).toFixed(2)}m`;

      const hojaAncho = window.hojaAncho ?? window.width_cm;
      const hojaAlto = window.hojaAlto ?? window.height_cm;
      const mosquiteroAncho = window.mosquiteroAncho ?? hojaAncho;
      const mosquiteroAlto = window.mosquiteroAlto ?? hojaAlto;

      const optionsCut = (window.options as Record<string, string>) || {};
      const reglasCut = this.costCalculator.aplicarRuleOverrides(
        catalogEntry,
        optionsCut,
      );

      // ── Resolver perfiles con overrides ────────────────────────────────────
      const perfilHojaFinal =
        reglasCut.perfil_hoja_id !== null
          ? (materialsById.get(reglasCut.perfil_hoja_id) ??
            catalogEntry.perfilHoja)
          : catalogEntry.perfilHoja;
      const perfilMosquiteroFinal =
        reglasCut.perfil_mosquitero_id !== null
          ? (materialsById.get(reglasCut.perfil_mosquitero_id) ??
            catalogEntry.perfilMosquitero)
          : catalogEntry.perfilMosquitero;

      const profiles = [
        {
          type: 'MARCO',
          material:
            reglasCut.perfil_marco_id !== null
              ? (materialsById.get(reglasCut.perfil_marco_id) ??
                catalogEntry.perfilMarco)
              : catalogEntry.perfilMarco,
          rule: reglasCut.regla_marco,
          ancho: window.width_cm,
          alto: window.height_cm,
        },
        {
          type: 'HOJA',
          material: perfilHojaFinal,
          rule: reglasCut.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
        },
        {
          type: 'MOSQUITERO',
          material: perfilMosquiteroFinal,
          rule: reglasCut.regla_mosquitero,
          ancho: hojaAncho, // cedazo usa misma medida que hoja, no la del vidrio
          alto: hojaAlto,
        },
        {
          type: 'BATIENTE',
          material:
            reglasCut.perfil_batiente_id !== null
              ? (materialsById.get(reglasCut.perfil_batiente_id) ??
                catalogEntry.perfilBatiente)
              : catalogEntry.perfilBatiente,
          rule: reglasCut.regla_batiente,
          ancho: hojaAncho,
          alto: hojaAlto,
        },
        {
          type: 'TAPAJAMBA',
          material:
            reglasCut.perfil_tapajamba_id !== null
              ? (materialsById.get(reglasCut.perfil_tapajamba_id) ??
                catalogEntry.perfilTapajamba)
              : catalogEntry.perfilTapajamba,
          rule: reglasCut.regla_tapajamba,
          ancho: window.width_cm,
          alto: window.height_cm,
        },
      ];

      // Whitelist: solo estos perfiles entran al optimizador de cortes
      const CUT_PROFILES_WHITELIST = new Set([
        'HOJA ABATIBLE ADENTRO',
        'HOJA ABATIBLE AFUERA',
        'HOJA ANDINA',
        'HOJA CEDAZO',
        'HOJA CORREDIZA S60 5,5 CM',
        'HOJA CORREDIZA S60 6,6 CM',
        'HOJA DE LUJO ADENTRO',
        'HOJA DE LUJO AFUERA',
        'HOJA PROYECTABLE',
        'MARCO CORREDIZO S80 4,5 CM',
        'MARCO CORREDIZO S80 5 CM',
        'MARCO FIJO 60',
      ]);

      for (const profile of profiles) {
        if (!profile.material || !profile.rule) continue;
        if (!CUT_PROFILES_WHITELIST.has(profile.material.name)) continue;

        // Generar cortes con etiqueta de dimensión (A=Ancho, H=Alto)
        const individualCutsWithDim = this.getCutsWithDimension(
          profile.rule,
          profile.ancho,
          profile.alto,
        );
        if (individualCutsWithDim.length === 0) continue;

        const allCuts: LabeledCut[] = [];
        for (let q = 0; q < windowQuantity; q++) {
          individualCutsWithDim.forEach(({ length, dim }) => {
            const baseLabel = `V${wi + 1}`;
            const dimLabel = `${baseLabel} ${dim} - ${(window.width_cm / 100).toFixed(2)}x${(window.height_cm / 100).toFixed(2)}m`;
            allCuts.push({ length, windowLabel: dimLabel });
          });
        }

        const isSliding = this.isSlidingWindowType(window.windowType.name);
        if (
          isSliding &&
          (profile.type === 'HOJA' || profile.type === 'MOSQUITERO') &&
          catalogEntry.perfilHoja &&
          catalogEntry.perfilMosquitero
        ) {
          const key = `${window.pvcColor.name}|${catalogEntry.perfilHoja.name}|${catalogEntry.perfilMosquitero.name}`;
          if (!combinableCutList.has(key)) {
            combinableCutList.set(key, {
              color: window.pvcColor.name,
              hojaCuts: [],
              mosquiteroCuts: [],
            });
          }
          // Etiquetar cada corte con su tipo de perfil para que el modal
          // pueda distinguir HOJA de CEDAZO dentro de una barra combinada ⚡
          // Formato sufijo: "|HOJA" o "|CEDAZO" — parseCutLabel lo extrae sin romper nada
          const profileTag = profile.type === 'HOJA' ? '|HOJA' : '|CEDAZO';
          const taggedCuts = allCuts.map((c) => ({
            ...c,
            windowLabel: c.windowLabel + profileTag,
          }));
          if (profile.type === 'HOJA') {
            combinableCutList.get(key)!.hojaCuts.push(...taggedCuts);
          } else {
            combinableCutList.get(key)!.mosquiteroCuts.push(...taggedCuts);
          }
        } else {
          const key = `${window.pvcColor.name}|${profile.material.name}`;
          if (!individualCutList.has(key))
            individualCutList.set(key, {
              color: window.pvcColor.name,
              cuts: [],
            });
          individualCutList.get(key)!.cuts.push(...allCuts);
        }
      }
    }

    const optimizationResult: any = {};

    for (const [key, value] of individualCutList.entries()) {
      const [color, profileName] = key.split('|');
      const optimizedBins = this.optimizeCutsLabeled(value.cuts, BAR_LENGTH);
      this.formatAndAddResultLabeled(
        optimizationResult,
        profileName,
        color,
        optimizedBins,
        BAR_LENGTH,
      );
    }

    for (const [key, value] of combinableCutList.entries()) {
      const [color, hojaProfileName, mosquiteroProfileName] = key.split('|');
      const { combinedBins, hojaOnlyBins, mosquiteroOnlyBins, machineSeries } =
        this.optimizeCombinedCutsLabeled(
          value.hojaCuts,
          value.mosquiteroCuts,
          BAR_LENGTH,
        );

      const combinedName = `${hojaProfileName} + ${mosquiteroProfileName}`;

      if (machineSeries !== null && machineSeries.length > 0) {
        // ── Modo Series de Máquina ────────────────────────────────────────────
        // Las piezas de HOJA y MOSQUITERO son idénticas en longitud.
        // Cada serie = 1 ciclo de máquina con 3 barras (2 HOJA + 1 MOSQUITERO).
        // Total barras contabilizadas = series × 3 (2 HOJA + 1 MOSQUITERO).
        if (!optimizationResult[combinedName])
          optimizationResult[combinedName] = [];
        optimizationResult[combinedName].push({
          color,
          // totalBars = N series × 3 barras físicas (para el resumen global)
          totalBars: machineSeries.length * 3,
          // machineSeries: true indica al frontend que use el modo de series
          machineSeries: true,
          // Desglose para el footer del bloque
          totalHojaBars: machineSeries.length * 2,
          totalCedazoBars: machineSeries.length * 1,
          // Las series en sí — cada una con sus cortes (sin tag |HOJA o |CEDAZO)
          series: machineSeries,
          // Campo bars vacío — no se usa en modo serie, pero mantiene compatibilidad
          // con el modal en caso de recibir un frontend antiguo que lo espere
          bars: [],
        });
      } else {
        // ── Fallback: modo antiguo de barras combinadas ───────────────────────
        // Las piezas difieren entre HOJA y MOSQUITERO (overrides de reglas).
        // Se usa el emparejamiento por largo original.
        if (combinedBins.length > 0)
          this.formatAndAddResultLabeled(
            optimizationResult,
            combinedName,
            color,
            combinedBins,
            BAR_LENGTH,
          );
      }

      // ✂ Sobrantes independientes (iguales en ambos modos)
      if (hojaOnlyBins.length > 0)
        this.formatAndAddResultLabeled(
          optimizationResult,
          hojaProfileName,
          color,
          hojaOnlyBins,
          BAR_LENGTH,
        );
      if (mosquiteroOnlyBins.length > 0)
        this.formatAndAddResultLabeled(
          optimizationResult,
          mosquiteroProfileName,
          color,
          mosquiteroOnlyBins,
          BAR_LENGTH,
        );
    }

    return optimizationResult;
  }

  // ── Cortes individuales con etiqueta de dimensión ────────────────────────────
  // Retorna cada corte con 'A' (ancho) o 'H' (alto) según la regla
  private getCutsWithDimension(
    rule: string,
    ancho: number,
    alto: number,
  ): { length: number; dim: string }[] {
    // Genera los cortes físicos individuales con su dimensión (A=Ancho, H=Alto).
    // Regla "SUMAR ANCHO Y ALTO * 2" → 2 anchos + 2 altos = 4 cortes físicos.
    // Nota: getIndividualCutsFromMeasures en cost-calculator usa multiplier/2 porque
    // calcula pares para metros lineales. Aquí calculamos piezas reales para el optimizador.
    const r = rule.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const multiplier = match ? parseInt(match[1], 10) : 2; // default 2 (1A+1H)
    const cuts: { length: number; dim: string }[] = [];
    const a = Number(ancho.toFixed(1));
    const h = Number(alto.toFixed(1));

    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      // Ej: "SUMAR ANCHO Y MULTIPLICAR ALTO * 3" → 1 pieza de ancho + 3 de alto
      cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else if (r.includes('ANCHO') && r.includes('ALTO')) {
      // Ej: "SUMAR ANCHO Y ALTO * 2" → multiplier/2 = 1 PAR = 1A+1H × multiplier veces
      // Pero "* 2" significa 2 anchos + 2 altos en total
      // multiplier anchos + multiplier altos:
      for (let i = 0; i < multiplier; i++) cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else if (r.includes('SUMAR ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else if (r.includes('ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else {
      // Fallback
      for (let i = 0; i < multiplier; i++) cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    }

    return cuts;
  }

  private isSlidingWindowType(typeName: string): boolean {
    return typeName.toUpperCase().includes('CORREDIZA');
  }

  private optimizeCutsLabeled(
    cuts: { length: number; windowLabel: string }[],
    barLength: number,
  ): { length: number; windowLabel: string }[][] {
    const sorted = [...cuts].sort((a, b) => b.length - a.length);
    const bins: {
      cuts: { length: number; windowLabel: string }[];
      remaining: number;
    }[] = [];
    for (const cut of sorted) {
      let placed = false;
      for (const bin of bins) {
        if (cut.length <= bin.remaining) {
          bin.cuts.push(cut);
          bin.remaining -= cut.length;
          placed = true;
          break;
        }
      }
      if (!placed)
        bins.push({ cuts: [cut], remaining: barLength - cut.length });
    }
    return bins.map((b) => b.cuts);
  }

  // ── Algoritmo de Series de Máquina ──────────────────────────────────────────
  // La cortadora carga 3 perfiles simultáneamente en un solo ciclo:
  //   Ranura 1 → barra de HOJA
  //   Ranura 2 → barra de HOJA
  //   Ranura 3 → barra de CEDAZO / MOSQUITERO
  //
  // Las 3 barras reciben EXACTAMENTE los mismos cortes en el mismo ciclo.
  // Por eso el plan de corte se organiza en "series": cada serie = 1 ciclo de máquina
  // con las 3 ranuras mostrando el mismo patrón de cortes.
  //
  // Fundamento: para ventana corrediza, HOJA y MOSQUITERO usan las mismas dimensiones
  // (hojaAncho / hojaAlto), por lo que sus piezas son idénticas en longitud.
  // Solo difieren en el nombre del perfil (material físico diferente, mismo largo).
  //
  // Algoritmo:
  //   1. Verificar que los largos de hojaCuts y mosquiteroCuts son equivalentes.
  //      Si no → fallback al modo antiguo para no perder exactitud.
  //   2. Usar SOLO los hojaCuts (sin tag) para correr FFD → N bins.
  //   3. Cada bin = 1 serie (3 filas con mismo patrón: HOJA, HOJA, MOSQUITERO).
  //   4. Calcular sobrantes: si hay piezas de hoja sin correspondencia en mosquitero
  //      (o viceversa) → tratarlas con FFD individual como antes.
  private optimizeCombinedCutsLabeled(
    hojaCuts: { length: number; windowLabel: string }[],
    mosquiteroCuts: { length: number; windowLabel: string }[],
    barLength: number,
  ): {
    combinedBins: { length: number; windowLabel: string }[][];
    hojaOnlyBins: { length: number; windowLabel: string }[][];
    mosquiteroOnlyBins: { length: number; windowLabel: string }[][];
    // Nuevo: cuando las piezas son idénticas se produce el formato "series de máquina"
    machineSeries: MachineSerie[] | null;
  } {
    // ── Paso 1: Verificar si los largos son equivalentes (modo serie posible) ──
    // Contamos frecuencias por largo en ambas listas y las comparamos.
    // CASO NORMAL: HOJA y MOSQUITERO tienen el mismo número de piezas.
    // CASO DOBLE: la regla HOJA usa N=4 (2A+2H duplicados) mientras MOSQUITERO usa N=2 (2A+2H).
    //   En ese caso hojaCuts tiene exactamente el doble de piezas que mosquiteroCuts,
    //   pero las DIMENSIONES son idénticas. La máquina igual puede cortar 2 HOJA + 1 MOSQUITERO
    //   por ciclo — simplemente cada barra HOJA usa la mitad de los cortes de la lista.
    //   Solución: si hoja tiene exactamente 2× piezas, tomar 1 de cada 2 (deduplicar) antes
    //   de comparar y antes del FFD, produciendo los mismos N bins que con MOSQUITERO.

    const hojaFreq = new Map<number, number>();
    for (const c of hojaCuts)
      hojaFreq.set(c.length, (hojaFreq.get(c.length) ?? 0) + 1);

    const mosquiteroFreq = new Map<number, number>();
    for (const c of mosquiteroCuts)
      mosquiteroFreq.set(c.length, (mosquiteroFreq.get(c.length) ?? 0) + 1);

    // Detectar si HOJA tiene exactamente el doble de piezas que MOSQUITERO
    // con las mismas dimensiones (ratio 2:1 en todas las frecuencias)
    let hojaIsDouble = false;
    if (
      hojaCuts.length === mosquiteroCuts.length * 2 &&
      hojaFreq.size === mosquiteroFreq.size
    ) {
      hojaIsDouble = true;
      for (const [len, mCount] of mosquiteroFreq.entries()) {
        if (hojaFreq.get(len) !== mCount * 2) {
          hojaIsDouble = false;
          break;
        }
      }
    }

    // Si hoja es doble, normalizar tomando 1 de cada 2 piezas (mantiene windowLabels)
    const effectiveHojaCuts = hojaIsDouble
      ? hojaCuts.filter((_, i) => i % 2 === 0)
      : hojaCuts;

    // Recalcular frecuencias con la lista efectiva
    const effectiveHojaFreq = new Map<number, number>();
    for (const c of effectiveHojaCuts)
      effectiveHojaFreq.set(
        c.length,
        (effectiveHojaFreq.get(c.length) ?? 0) + 1,
      );

    // Verificar que las frecuencias son iguales → mismas piezas en ambos perfiles
    let canUseMachineSeries = effectiveHojaFreq.size === mosquiteroFreq.size;
    if (canUseMachineSeries) {
      for (const [len, count] of effectiveHojaFreq.entries()) {
        if (mosquiteroFreq.get(len) !== count) {
          canUseMachineSeries = false;
          break;
        }
      }
    }

    if (canUseMachineSeries && effectiveHojaCuts.length > 0) {
      // ── Modo Series de Máquina ──────────────────────────────────────────────
      // Los cortes son idénticos en HOJA (efectiva) y MOSQUITERO.
      // Corremos FFD SOLO con effectiveHojaCuts y producimos N bins.
      // Cada bin = 1 serie → 3 barras en la máquina (2 HOJA + 1 MOSQUITERO).
      // totalHojaBars = N bins × 2 (porque la barra HOJA se carga dos veces por ciclo).

      // Limpiar el tag |HOJA del windowLabel para que la serie sea legible
      const cleanedHojaCuts = effectiveHojaCuts.map((c) => ({
        ...c,
        windowLabel: c.windowLabel
          .replace(/\|HOJA$/, '')
          .replace(/\|CEDAZO$/, ''),
      }));

      const bins = this.optimizeCutsLabeled(cleanedHojaCuts, barLength);

      const series: MachineSerie[] = bins.map((bin, idx) => {
        const totalUsed = bin.reduce((s, c) => s + c.length, 0);
        const waste = Number((barLength - totalUsed).toFixed(1));
        return {
          serieIndex: idx + 1,
          cuts: [...bin].sort((a, b) => b.length - a.length),
          totalUsed: Number(totalUsed.toFixed(1)),
          waste,
          efficiency: Number(((totalUsed / barLength) * 100).toFixed(2)),
        };
      });

      // No hay sobrantes cuando los largos son idénticos
      return {
        combinedBins: [],
        hojaOnlyBins: [],
        mosquiteroOnlyBins: [],
        machineSeries: series,
      };
    }

    // ── Fallback: modo antiguo de emparejamiento por largo ──────────────────
    // Se usa cuando HOJA y MOSQUITERO tienen piezas de distinto largo
    // (ventanas con overrides de reglas que diferencian los perfiles).

    const hojaByLength = new Map<
      number,
      { length: number; windowLabel: string }[]
    >();
    for (const cut of hojaCuts) {
      if (!hojaByLength.has(cut.length)) hojaByLength.set(cut.length, []);
      hojaByLength.get(cut.length)!.push(cut);
    }
    const mosquiteroByLength = new Map<
      number,
      { length: number; windowLabel: string }[]
    >();
    for (const cut of mosquiteroCuts) {
      if (!mosquiteroByLength.has(cut.length))
        mosquiteroByLength.set(cut.length, []);
      mosquiteroByLength.get(cut.length)!.push(cut);
    }

    const pairedCuts: { length: number; windowLabel: string }[] = [];
    const hojaLeftover: { length: number; windowLabel: string }[] = [];
    const mosquiteroLeftover: { length: number; windowLabel: string }[] = [];

    for (const [length, hojaGroup] of hojaByLength.entries()) {
      const mosquiteroGroup = mosquiteroByLength.get(length) ?? [];
      const pairCount = Math.min(hojaGroup.length, mosquiteroGroup.length);
      for (let i = 0; i < pairCount; i++) {
        pairedCuts.push(hojaGroup[i]);
        pairedCuts.push(mosquiteroGroup[i]);
      }
      for (let i = pairCount; i < hojaGroup.length; i++)
        hojaLeftover.push(hojaGroup[i]);
      for (let i = pairCount; i < mosquiteroGroup.length; i++)
        mosquiteroLeftover.push(mosquiteroGroup[i]);
    }
    for (const [length, mosquiteroGroup] of mosquiteroByLength.entries()) {
      if (!hojaByLength.has(length))
        mosquiteroLeftover.push(...mosquiteroGroup);
    }

    return {
      combinedBins:
        pairedCuts.length > 0
          ? this.optimizeCutsLabeled(pairedCuts, barLength)
          : [],
      hojaOnlyBins:
        hojaLeftover.length > 0
          ? this.optimizeCutsLabeled(hojaLeftover, barLength)
          : [],
      mosquiteroOnlyBins:
        mosquiteroLeftover.length > 0
          ? this.optimizeCutsLabeled(mosquiteroLeftover, barLength)
          : [],
      machineSeries: null, // fallback: no hay series de máquina
    };
  }

  private formatAndAddResultLabeled(
    resultObj: any,
    profileName: string,
    color: string,
    bins: { length: number; windowLabel: string }[][],
    barLength: number,
  ) {
    if (!resultObj[profileName]) resultObj[profileName] = [];
    resultObj[profileName].push({
      color,
      totalBars: bins.length,
      bars: bins.map((bar, index) => {
        const totalUsed = bar.reduce((sum, c) => sum + c.length, 0);
        const sorted = [...bar].sort((a, b) => b.length - a.length);
        return {
          barNumber: index + 1,
          cuts: sorted.map((c) => ({
            length: c.length,
            windowLabel: c.windowLabel,
          })),
          totalUsed: Number(totalUsed.toFixed(1)),
          waste: Number((barLength - totalUsed).toFixed(1)),
          efficiency: Number(((totalUsed / barLength) * 100).toFixed(2)),
        };
      }),
    });
  }

  private optimizeCuts(cuts: number[], barLength: number): number[][] {
    const sortedCuts = cuts.sort((a, b) => b - a);
    const bins: { cuts: number[]; remaining: number }[] = [];
    for (const cut of sortedCuts) {
      let placed = false;
      for (const bin of bins) {
        if (cut <= bin.remaining) {
          bin.cuts.push(cut);
          bin.remaining -= cut;
          placed = true;
          break;
        }
      }
      if (!placed) bins.push({ cuts: [cut], remaining: barLength - cut });
    }
    return bins.map((bin) => bin.cuts);
  }

  private optimizeCombinedCuts(
    hojaCuts: number[],
    mosquiteroCuts: number[],
    barLength: number,
  ) {
    const cutFrequencies = new Map<
      number,
      { hoja: number; mosquitero: number }
    >();
    hojaCuts.forEach((cut) => {
      const f = cutFrequencies.get(cut) || { hoja: 0, mosquitero: 0 };
      f.hoja++;
      cutFrequencies.set(cut, f);
    });
    mosquiteroCuts.forEach((cut) => {
      const f = cutFrequencies.get(cut) || { hoja: 0, mosquitero: 0 };
      f.mosquitero++;
      cutFrequencies.set(cut, f);
    });

    const finalHojaCuts: number[] = [];
    const finalMosquiteroCuts: number[] = [];

    for (const [cutLength, freqs] of cutFrequencies.entries()) {
      const numTriples = Math.min(Math.floor(freqs.hoja / 2), freqs.mosquitero);
      if (numTriples > 0) {
        for (let i = 0; i < numTriples; i++) {
          finalHojaCuts.push(cutLength, cutLength);
          finalMosquiteroCuts.push(cutLength);
        }
        freqs.hoja -= numTriples * 2;
        freqs.mosquitero -= numTriples;
      }
    }
    for (const [cutLength, freqs] of cutFrequencies.entries()) {
      for (let i = 0; i < freqs.hoja; i++) finalHojaCuts.push(cutLength);
      for (let i = 0; i < freqs.mosquitero; i++)
        finalMosquiteroCuts.push(cutLength);
    }

    return {
      optimizedHojaBins: this.optimizeCuts(finalHojaCuts, barLength),
      optimizedMosquiteroBins: this.optimizeCuts(
        finalMosquiteroCuts,
        barLength,
      ),
    };
  }

  private formatAndAddResult(
    resultObj: any,
    profileName: string,
    color: string,
    bins: number[][],
    barLength: number,
  ) {
    if (!resultObj[profileName]) resultObj[profileName] = [];
    resultObj[profileName].push({
      color,
      totalBars: bins.length,
      bars: bins.map((bar, index) => {
        const totalUsed = bar.reduce((sum, cut) => sum + cut, 0);
        return {
          barNumber: index + 1,
          cuts: bar.sort((a, b) => b - a),
          totalUsed: Number(totalUsed.toFixed(1)),
          waste: Number((barLength - totalUsed).toFixed(1)),
          efficiency: Number(((totalUsed / barLength) * 100).toFixed(2)),
        };
      }),
    });
  }
}
