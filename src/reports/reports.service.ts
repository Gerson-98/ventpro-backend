// RUTA: src/reports/reports.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Window, Material, AccessoryRule } from '@prisma/client';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';
import { guillotinePack } from '../common/guillotine-pack';

type AccessoryRuleWithMaterial = AccessoryRule & { material: Material };

// ── Movido al scope de archivo para que todos los métodos lo reconozcan ──────
type LabeledCut = { length: number; windowLabel: string };

// Desperdicio de sierra por corte a 45° (inglete) — aplica a todos los perfiles
const KERF_CM = 2;

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
            // ── NUEVOS ──────────────────────────────────────────────────────
            refuerzoHoja: true,
            refuerzoMosquitero: true,
          },
        })
      ).map((p) => [p.window_type_id, p]),
    );

    const accessoryRules: AccessoryRuleWithMaterial[] =
      await this.prisma.accessoryRule.findMany({ include: { material: true } });

    const rulesByWindowType = new Map<number, AccessoryRuleWithMaterial[]>();
    accessoryRules.forEach((rule) => {
      if (!rulesByWindowType.has(rule.window_type_id))
        rulesByWindowType.set(rule.window_type_id, []);
      rulesByWindowType.get(rule.window_type_id)!.push(rule);
    });

    interface ProfileAccum {
      material: any;
      pvcColor: string;
      cuts: number[];
      totalLength: number;
      isDuela: boolean;
    }
    const profilesReportMap = new Map<string, ProfileAccum>();
    const accessoriesReportMap = new Map<string, any>();
    // glassReportMap ahora guarda piezas individuales para usar guillotinePack
    const glassReportMap = new Map<
      string,
      {
        material: any;
        sheetWidth: number;
        sheetHeight: number;
        pieces: { width: number; height: number; label: string }[];
      }
    >();

    const BAR_LENGTH_REPORT = 580;

    for (const window of enrichedWindows) {
      if (!window || !window.windowType || !window.pvcColor) continue;

      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;
      const options = (window.options as any) || {};

      // ── Mosquitero y refuerzo ────────────────────────────────────────────
      const conMosquitero = this.costCalculator.tieneMosquitero(
        options,
        catalogEntry,
      );
      const conRefuerzoHojas = this.costCalculator.tieneRefuerzoHojas(options);
      const conRefuerzoMosquitero =
        this.costCalculator.tieneRefuerzoMosquitero(options);

      const hojaAncho = window.hojaAncho ?? window.width_cm;
      const hojaAlto = window.hojaAlto ?? window.height_cm;
      const mosquiteroAncho = window.mosquiteroAncho ?? hojaAncho;
      const mosquiteroAlto = window.mosquiteroAlto ?? hojaAlto;
      const vidrioAncho = window.vidrioAncho ?? hojaAncho;
      const vidrioAlto = window.vidrioAlto ?? hojaAlto;

      const reglas = this.costCalculator.aplicarRuleOverrides(
        catalogEntry,
        options,
        window.glassColor?.name,
      );

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

      const cantVidrios = reglas.cant_vidrios ?? catalogEntry.cant_vidrios;

      const dynamicProfiles = [
        {
          type: 'MARCO',
          material: perfilMarcoFinal,
          rule: reglas.regla_marco,
          ancho: window.width_cm,
          alto: window.height_cm,
          incluir: true,
        },
        {
          type: 'HOJA',
          material: perfilHojaFinal,
          rule: reglas.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
          incluir: true,
        },
        {
          type: 'MOSQUITERO',
          material: perfilMosquiteroFinal,
          rule: reglas.regla_mosquitero,
          ancho: mosquiteroAncho,
          alto: mosquiteroAlto,
          incluir: conMosquitero,
        },
        {
          type: 'BATIENTE',
          material: perfilBatienteFinal,
          rule: reglas.regla_batiente,
          ancho: hojaAncho,
          alto: hojaAlto,
          incluir: true,
        },
        {
          type: 'TAPAJAMBA',
          material: perfilTapajambaFinal,
          rule: reglas.regla_tapajamba,
          ancho: window.width_cm,
          alto: window.height_cm,
          incluir: true,
        },
      ];

      // 0. Barras/área aproximadas por slot — solo para evaluar accesorios con
      //    fórmula (PER_BARRA/PER_M2). Es una aproximación por ventana (sin
      //    bin-packing global), suficiente para cantidades de empaque/silicón/malla.
      const slotMetricsForWindow: Record<
        string,
        { barras: number; areaM2: number }
      > = {};
      for (const profile of dynamicProfiles) {
        if (!profile.incluir || !profile.material || !profile.rule) continue;
        const cuts = this.getCutsWithDimension(
          profile.rule,
          profile.ancho,
          profile.alto,
        );
        const totalLength =
          cuts.reduce((s, c) => s + c.length, 0) * windowQuantity;
        slotMetricsForWindow[profile.type.toLowerCase()] = {
          barras: Math.ceil(totalLength / BAR_LENGTH_REPORT),
          areaM2: (profile.ancho * profile.alto * windowQuantity) / 10000,
        };
      }

      // 1. ACCESORIOS
      if (window.window_type_id) {
        const rules = rulesByWindowType.get(window.window_type_id) || [];
        for (const rule of rules) {
          const shouldAdd =
            !rule.option_group ||
            options[rule.option_group] === rule.option_key;
          if (!shouldAdd || !rule.material) continue;

          // Omitir accesorios de mosquitero si no lleva mosquitero
          if (!conMosquitero) {
            const nombreUpper = rule.material.name.toUpperCase();
            if (
              nombreUpper.includes('MOSQUITERO') ||
              nombreUpper.includes('CEDAZO') ||
              nombreUpper.includes('MAYA')
            )
              continue;
          }

          // ── Cantidad por fórmula (barras/m2, convertido a unidades de venta) o fija ──
          let cantidadAcumular: number;
          if (rule.formula_type && rule.formula_slot) {
            const metrics = slotMetricsForWindow[
              rule.formula_slot.toLowerCase()
            ] ?? { barras: 0, areaM2: 0 };
            const factor = rule.formula_factor ?? 1;
            const necesario =
              rule.formula_type === 'PER_M2'
                ? metrics.areaM2 * factor
                : metrics.barras * factor;
            const coverage = rule.material.coverage_per_unit ?? 1;
            cantidadAcumular = Math.ceil(necesario / coverage);
          } else {
            cantidadAcumular = rule.quantity * windowQuantity;
          }
          if (cantidadAcumular <= 0) continue;

          const key = `${rule.material.name}|${window.pvcColor.name}`;
          const existing = accessoriesReportMap.get(key) || {
            material: rule.material,
            quantity: 0,
            pvcColor: window.pvcColor.name,
            note: '',
          };
          if (rule.material.name === 'LANCETA')
            existing.note = `Cortar a ${window.width_cm} cm`;
          existing.quantity += cantidadAcumular;
          accessoriesReportMap.set(key, existing);
        }
      }

      // 2. PERFILES + REFUERZOS
      for (const profile of dynamicProfiles) {
        if (!profile.incluir || !profile.material || !profile.rule) continue;

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
        for (let q = 0; q < windowQuantity; q++) {
          for (const cut of individualCuts) {
            existing.cuts.push(Number(cut.length.toFixed(1)));
          }
        }

        // ── Refuerzo Hojas: misma cuts que HOJA ───────────────────────────
        if (
          profile.type === 'HOJA' &&
          conRefuerzoHojas &&
          catalogEntry.refuerzoHoja
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoHoja.name}`;
          if (!profilesReportMap.has(refKey)) {
            profilesReportMap.set(refKey, {
              material: catalogEntry.refuerzoHoja,
              pvcColor: window.pvcColor.name,
              cuts: [],
              totalLength: 0,
              isDuela: false,
            });
          }
          const refExisting = profilesReportMap.get(refKey)!;
          for (let q = 0; q < windowQuantity; q++) {
            for (const cut of individualCuts) {
              refExisting.cuts.push(Number(cut.length.toFixed(1)));
            }
          }
        }

        // ── Refuerzo Mosquitero: misma cuts que MOSQUITERO ────────────────
        if (
          profile.type === 'MOSQUITERO' &&
          conRefuerzoMosquitero &&
          catalogEntry.refuerzoMosquitero
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoMosquitero.name}`;
          if (!profilesReportMap.has(refKey)) {
            profilesReportMap.set(refKey, {
              material: catalogEntry.refuerzoMosquitero,
              pvcColor: window.pvcColor.name,
              cuts: [],
              totalLength: 0,
              isDuela: false,
            });
          }
          const refExisting = profilesReportMap.get(refKey)!;
          for (let q = 0; q < windowQuantity; q++) {
            for (const cut of individualCuts) {
              refExisting.cuts.push(Number(cut.length.toFixed(1)));
            }
          }
        }
      }

      // 3. VIDRIOS (solo si tiene mosquitero)
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
          // El vidrio siempre se calcula — independiente de si lleva mosquitero
          const glassMaterial = materialsMap.get(window.glassColor.name);
          if (glassMaterial && vidrioAncho > 0 && vidrioAlto > 0) {
            const key = glassMaterial.name;
            const glassCount = cantVidrios ?? 1;
            const sheetWidth = Number(window.glassColor.sheet_width ?? 213);
            const sheetHeight = Number(window.glassColor.sheet_height ?? 165.8);
            if (!glassReportMap.has(key)) {
              glassReportMap.set(key, {
                material: glassMaterial,
                sheetWidth,
                sheetHeight,
                pieces: [],
              });
            }
            const entry = glassReportMap.get(key)!;
            // Agregar una pieza por cada vidrio × cantidad de ventanas
            for (let q = 0; q < glassCount * windowQuantity; q++) {
              entry.pieces.push({
                width: Number(vidrioAncho.toFixed(1)),
                height: Number(vidrioAlto.toFixed(1)),
                label: `V${enrichedWindows.indexOf(window) + 1}`,
              });
            }
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
      // Usar guillotinePack igual que buildGlassCutData para que coincidan los números
      const sheets = guillotinePack(
        item.pieces,
        item.sheetWidth,
        item.sheetHeight,
      );
      const planchas = sheets.length;
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
    const orderWhere: any = {};

    if (filters.status && filters.status !== 'todos') {
      orderWhere.status = filters.status;
    } else {
      orderWhere.status = { not: 'cancelado' };
    }

    if (filters.fromDate || filters.toDate) {
      orderWhere.createdAt = {};
      if (filters.fromDate)
        orderWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        // Usar setUTCHours(29,...) en lugar de setHours(23,...):
        // new Date("2026-05-31") devuelve medianoche UTC. setHours() aplica en
        // zona horaria LOCAL del servidor (UTC-6 en Guatemala), produciendo solo
        // 05:59:59 UTC — excluyendo toda la jornada laboral. setUTCHours(29,…)
        // suma 29 h desde UTC midnight → 2026-06-01T05:59:59.999Z, que equivale
        // al final del día en hora local guatemalteca (UTC-6).
        to.setUTCHours(29, 59, 59, 999);
        orderWhere.createdAt.lte = to;
      }
    }

    if (filters.userId) {
      orderWhere.generatedFromQuotation = { userId: filters.userId };
    }

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        project: true,
        total: true,
        status: true,
        include_iva: true,
        createdAt: true,
        installationStartDate: true,
        client: { select: { name: true } },
        generatedFromQuotation: {
          select: { user: { select: { id: true, name: true } } },
        },
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
            seller: order.generatedFromQuotation?.user?.name || '—',
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
            seller: order.generatedFromQuotation?.user?.name || '—',
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

    // Cotizaciones para monitor de comisiones por vendedor
    const quotationWhere: any = {};
    if (filters.userId) quotationWhere.userId = filters.userId;
    if (filters.fromDate || filters.toDate) {
      quotationWhere.createdAt = {};
      if (filters.fromDate)
        quotationWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setUTCHours(29, 59, 59, 999); // mismo criterio que el filtro de pedidos
        quotationWhere.createdAt.lte = to;
      }
    }

    const quotations = await this.prisma.quotation.findMany({
      where: quotationWhere,
      select: {
        id: true,
        quotationNumber: true,
        project: true,
        status: true,
        total_price: true,
        createdAt: true,
        client: { select: { name: true } },
        user: { select: { id: true, name: true } },
        generatedOrder: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const quotationSummaries = quotations.map((q) => ({
      quotationId: q.id,
      quotationNumber: q.quotationNumber,
      project: q.project,
      client: q.client?.name || '—',
      seller: q.user?.name || '—',
      status: q.status,
      totalPrice: q.total_price || 0,
      convertedToOrder: !!q.generatedOrder,
      orderId: q.generatedOrder?.id || null,
      createdAt: q.createdAt,
    }));

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
      quotations: quotationSummaries,
      totals: {
        totalSales: Number(totals.totalSales.toFixed(2)),
        totalMaterialCost: Number(totals.totalMaterialCost.toFixed(2)),
        totalProfit: Number(totals.totalProfit.toFixed(2)),
        avgMargin: Number(avgMargin.toFixed(2)),
        orderCount: summaries.length,
        quotationCount: quotationSummaries.length,
        quotationsConverted: quotationSummaries.filter(
          (q) => q.convertedToOrder,
        ).length,
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

  // ─── NUEVO: Optimización global multi-pedido ──────────────────────────────
  // Fusiona las ventanas de varios pedidos en un solo lote y corre el mismo
  // algoritmo FFD (generateCutOptimization) para minimizar desperdicio global.
  // Devuelve además una lista de ventanas con su proyecto para que el frontend
  // pueda identificar qué V# pertenece a qué pedido.
  async generateMultiOrderCutOptimization(orderIds: number[]) {
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: {
        windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
        },
      },
    });
    if (orders.length === 0) {
      throw new NotFoundException('No se encontraron pedidos');
    }
    // Preservar orden de orderIds solicitado
    const ordersSorted = orderIds
      .map((id) => orders.find((o) => o.id === id))
      .filter((o): o is typeof orders[number] => !!o);

    // Merge windows en un solo array manteniendo el orden: pedido1.ventanas, pedido2.ventanas, ...
    const mergedWindows: any[] = [];
    const windowSummaries: Array<{
      index: number;
      label: string;
      orderId: number;
      project: string;
      windowTypeName: string;
      pvcColor: string;
      glassColor: string;
      width_cm: number;
      height_cm: number;
      quantity: number;
      hasMosquitero: boolean;
    }> = [];

    ordersSorted.forEach((order) => {
      order.windows.forEach((w) => {
        mergedWindows.push(w);
        const options = (w.options as Record<string, string>) || {};
        windowSummaries.push({
          index: mergedWindows.length, // 1-based; coincide con V# interno (wi+1)
          label: `V${mergedWindows.length}`,
          orderId: order.id,
          project: order.project,
          windowTypeName: w.windowType?.name ?? '',
          pvcColor: w.pvcColor?.name ?? '',
          glassColor: w.glassColor?.name ?? '',
          width_cm: Number(w.width_cm),
          height_cm: Number(w.height_cm),
          quantity: w.quantity || 1,
          hasMosquitero: options['mosquitero'] === 'con_mosquitero',
        });
      });
    });

    const optimization = await this.generateCutOptimization(mergedWindows);

    return {
      optimization,
      windows: windowSummaries,
      orders: ordersSorted.map((o) => ({ id: o.id, project: o.project })),
    };
  }

  async generateGlassCutReport(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        windows: {
          include: { windowType: true, pvcColor: true, glassColor: true },
        },
      },
    });
    if (!order) throw new NotFoundException(`Pedido #${orderId} no encontrado`);
    return this.buildGlassCutData(order.windows);
  }

  async generateGlassCutByQuotation(quotationId: number) {
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
    return this.buildGlassCutData(normalizedWindows);
  }

  private async buildGlassCutData(windows: any[]) {
    const enrichedWindows = await this.enrichWindowMeasures(windows);
    const catalogMap = new Map(
      (await this.prisma.catalogoPerfiles.findMany()).map((p) => [
        p.window_type_id,
        p,
      ]),
    );

    interface GlassPiece {
      width: number;
      height: number;
      windowLabel: string;
      quantity: number;
    }
    interface GlassGroup {
      glassName: string;
      sheetWidth: number;
      sheetHeight: number;
      pieces: GlassPiece[];
    }
    const glassByType = new Map<string, GlassGroup>();

    for (let wi = 0; wi < enrichedWindows.length; wi++) {
      const window = enrichedWindows[wi];
      if (!window || !window.glassColor) continue;
      const glassName = window.glassColor.name;
      if (glassName.toUpperCase().includes('DUELA')) continue;

      const sheetWidth = Number(window.glassColor.sheet_width ?? 213);
      const sheetHeight = Number(window.glassColor.sheet_height ?? 165.8);

      const catalogEntry = catalogMap.get(window.window_type_id);
      const options = (window.options as any) || {};
      const reglas = catalogEntry
        ? this.costCalculator.aplicarRuleOverrides(catalogEntry, options, window.glassColor?.name)
        : null;
      const cantVidrios =
        reglas?.cant_vidrios ?? catalogEntry?.cant_vidrios ?? 1;

      const vidrioAncho = window.vidrioAncho ?? window.width_cm;
      const vidrioAlto = window.vidrioAlto ?? window.height_cm;
      if (vidrioAncho <= 0 || vidrioAlto <= 0) continue;

      const windowLabel = `V${wi + 1}`;
      const windowQuantity = window.quantity || 1;
      const key = glassName;
      if (!glassByType.has(key))
        glassByType.set(key, {
          glassName,
          sheetWidth,
          sheetHeight,
          pieces: [],
        });
      glassByType.get(key)!.pieces.push({
        width: Number(vidrioAncho.toFixed(1)),
        height: Number(vidrioAlto.toFixed(1)),
        windowLabel,
        quantity: cantVidrios * windowQuantity,
      });
    }

    const result: any = {};
    for (const [key, value] of glassByType.entries()) {
      const { sheetWidth, sheetHeight, pieces } = value;
      const expandedPieces: { width: number; height: number; label: string }[] =
        [];
      for (const p of pieces) {
        for (let q = 0; q < p.quantity; q++) {
          expandedPieces.push({
            width: p.width,
            height: p.height,
            label: p.windowLabel,
          });
        }
      }
      const sheets = guillotinePack(expandedPieces, sheetWidth, sheetHeight);
      const totalPieces = pieces.reduce((s, p) => s + p.quantity, 0);
      const totalArea = pieces.reduce(
        (s, p) => s + p.width * p.height * p.quantity,
        0,
      );
      result[key] = {
        glassName: value.glassName,
        sheetWidth,
        sheetHeight,
        planchaSize: `${sheetWidth} × ${sheetHeight} cm`,
        pieces,
        totalPieces,
        totalArea: Number(totalArea.toFixed(1)),
        minPlanchas: sheets.length,
        sheets,
      };
    }
    return result;
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
            refuerzoHoja: true,
            refuerzoMosquitero: true,
          },
        })
      ).map((p) => [p.window_type_id, p]),
    );

    const BAR_LENGTH = 580;

    const individualCutList = new Map<
      string,
      { color: string; cuts: LabeledCut[] }
    >();
    // Corredizas: se cortan en la máquina en "series" de barras idénticas
    // (2 hojas + 1 mosquitero por pasada, o 2 hojas sin mosquitero). Se guarda
    // por bucket (color + perfil hoja + perfil mosquitero) la lista de ventanas
    // con su patrón de una hoja (unit) y cuántas hojas/mosquiteros necesita.
    const machineCutList = new Map<
      string,
      {
        color: string;
        hojaProfileName: string;
        mosqProfileName: string | null;
        windows: {
          label: string;
          unit: LabeledCut[];
          nHoja: number;
          nMosq: number;
        }[];
      }
    >();

    for (let wi = 0; wi < enrichedWindows.length; wi++) {
      const window = enrichedWindows[wi];
      if (!window || !window.windowType || !window.pvcColor) continue;
      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;
      const windowLabel = `V${wi + 1} - ${(window.width_cm / 100).toFixed(2)}x${(window.height_cm / 100).toFixed(2)}m`;
      const options = (window.options as Record<string, string>) || {};

      // ── Mosquitero y refuerzos ───────────────────────────────────────────
      // Para el plan de corte, requerir 'con_mosquitero' explícito.
      // tieneMosquitero() retorna true cuando la key está ausente (ventanas sin
      // la opción guardada), lo que metía cedazo a ventanas que no lo llevan.
      const conMosquiteroCut =
        catalogEntry.perfilMosquitero != null &&
        options['mosquitero'] === 'con_mosquitero';
      const conRefuerzoHojas = this.costCalculator.tieneRefuerzoHojas(options);
      const conRefuerzoMosquitero =
        this.costCalculator.tieneRefuerzoMosquitero(options);

      const hojaAncho = window.hojaAncho ?? window.width_cm;
      const hojaAlto = window.hojaAlto ?? window.height_cm;
      const mosquiteroAncho = window.mosquiteroAncho ?? hojaAncho;
      const mosquiteroAlto = window.mosquiteroAlto ?? hojaAlto;

      const reglasCut = this.costCalculator.aplicarRuleOverrides(
        catalogEntry,
        options,
        window.glassColor?.name,
      );

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
          incluir: true,
        },
        {
          type: 'HOJA',
          material: perfilHojaFinal,
          rule: reglasCut.regla_hoja,
          ancho: hojaAncho,
          alto: hojaAlto,
          incluir: true,
        },
        {
          type: 'MOSQUITERO',
          material: perfilMosquiteroFinal,
          rule: reglasCut.regla_mosquitero,
          ancho: hojaAncho,
          alto: hojaAlto,
          // Solo incluir cedazo cuando el mosquitero está marcado explícitamente.
          // (tieneMosquitero() da true si la opción no existe → metía cedazo a
          //  ventanas sin mosquitero como la puerta 4H o la abatible).
          incluir: conMosquiteroCut,
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
          incluir: true,
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
          incluir: true,
        },
      ];

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
        'MARCO FIJO S60',
        'MARCO FIJO S80',
        // ── Refuerzos también entran al plan de corte ────────────────────────
        'REFUERZO HOJA 5,5 CM',
        'REFUERZO HOJA 6,6 CM',
        'REFUERZO CEDAZO',
      ]);

      const isSliding = this.isSlidingWindowType(window.windowType.name);

      for (const profile of profiles) {
        if (!profile.incluir || !profile.material || !profile.rule) continue;
        if (!CUT_PROFILES_WHITELIST.has(profile.material.name)) continue;

        // ── Corredizas: HOJA + MOSQUITERO → serie de máquina ─────────────────
        //   La máquina corta barras idénticas al mismo tiempo: 2 hojas + 1
        //   mosquitero, o 2 hojas sin mosquitero. Se resuelve todo en la
        //   iteración de HOJA; la de MOSQUITERO se omite para no duplicar.
        if (isSliding && profile.type === 'MOSQUITERO') continue;

        if (isSliding && profile.type === 'HOJA') {
          const hojaCutsDim = this.getCutsWithDimension(
            profile.rule,
            profile.ancho,
            profile.alto,
          );
          // Cada hoja (y cada mosquitero) = 2 anchos + 2 altos = 4 piezas.
          if (hojaCutsDim.length > 0 && hojaCutsDim.length % 4 === 0) {
            const a = Number(profile.ancho.toFixed(1));
            const h = Number(profile.alto.toFixed(1));
            const baseLabel = `V${wi + 1}`;
            const dims = `${(window.width_cm / 100).toFixed(2)}x${(window.height_cm / 100).toFixed(2)}m`;
            const unit: LabeledCut[] = [
              { length: a, windowLabel: `${baseLabel} A - ${dims}` },
              { length: a, windowLabel: `${baseLabel} A - ${dims}` },
              { length: h, windowLabel: `${baseLabel} H - ${dims}` },
              { length: h, windowLabel: `${baseLabel} H - ${dims}` },
            ];
            const nHoja = hojaCutsDim.length / 4;

            let nMosq = 0;
            let mosqProfileName: string | null = null;
            if (
              conMosquiteroCut &&
              perfilMosquiteroFinal &&
              CUT_PROFILES_WHITELIST.has(perfilMosquiteroFinal.name) &&
              reglasCut.regla_mosquitero
            ) {
              const mosqCutsDim = this.getCutsWithDimension(
                reglasCut.regla_mosquitero,
                hojaAncho,
                hojaAlto,
              );
              if (mosqCutsDim.length > 0 && mosqCutsDim.length % 4 === 0) {
                nMosq = mosqCutsDim.length / 4;
                mosqProfileName = perfilMosquiteroFinal.name;
              }
            }

            const key = `${window.pvcColor.name}|${profile.material.name}|${mosqProfileName ?? ''}`;
            if (!machineCutList.has(key)) {
              machineCutList.set(key, {
                color: window.pvcColor.name,
                hojaProfileName: profile.material.name,
                mosqProfileName,
                windows: [],
              });
            }
            const mEntry = machineCutList.get(key)!;
            for (let q = 0; q < windowQuantity; q++) {
              mEntry.windows.push({ label: baseLabel, unit, nHoja, nMosq });
            }

            // Refuerzo de hojas / mosquitero: mismos cortes, se cortan aparte.
            if (conRefuerzoHojas && catalogEntry.refuerzoHoja) {
              const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoHoja.name}`;
              if (!individualCutList.has(refKey))
                individualCutList.set(refKey, {
                  color: window.pvcColor.name,
                  cuts: [],
                });
              const ref = individualCutList.get(refKey)!;
              for (let q = 0; q < windowQuantity; q++)
                for (let l = 0; l < nHoja; l++) ref.cuts.push(...unit);
            }
            if (conRefuerzoMosquitero && catalogEntry.refuerzoMosquitero && nMosq > 0) {
              const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoMosquitero.name}`;
              if (!individualCutList.has(refKey))
                individualCutList.set(refKey, {
                  color: window.pvcColor.name,
                  cuts: [],
                });
              const ref = individualCutList.get(refKey)!;
              for (let q = 0; q < windowQuantity; q++)
                for (let s = 0; s < nMosq; s++) ref.cuts.push(...unit);
            }
            continue;
          }
          // Si no descompone limpio, cae al manejo individual de abajo.
        }

        // ── Perfiles individuales (MARCO, BATIENTE, TAPAJAMBA, no corredizas) ─
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

        const key = `${window.pvcColor.name}|${profile.material.name}`;
        if (!individualCutList.has(key))
          individualCutList.set(key, { color: window.pvcColor.name, cuts: [] });
        individualCutList.get(key)!.cuts.push(...allCuts);

        // Refuerzos para casos no-corredizos (misma medida que el perfil base).
        if (
          profile.type === 'HOJA' &&
          conRefuerzoHojas &&
          catalogEntry.refuerzoHoja
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoHoja.name}`;
          if (!individualCutList.has(refKey))
            individualCutList.set(refKey, { color: window.pvcColor.name, cuts: [] });
          individualCutList.get(refKey)!.cuts.push(...allCuts);
        }
        if (
          profile.type === 'MOSQUITERO' &&
          conRefuerzoMosquitero &&
          catalogEntry.refuerzoMosquitero
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoMosquitero.name}`;
          if (!individualCutList.has(refKey))
            individualCutList.set(refKey, { color: window.pvcColor.name, cuts: [] });
          individualCutList.get(refKey)!.cuts.push(...allCuts);
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

    for (const value of machineCutList.values()) {
      const series = this.buildMachineSeriesFromWindows(
        value.windows,
        BAR_LENGTH,
      );
      if (series.length === 0) continue;

      const sectionName = value.mosqProfileName
        ? `${value.hojaProfileName} + ${value.mosqProfileName}`
        : value.hojaProfileName;

      const totalHojaBars = series.reduce((s, x) => s + x.hojaBars, 0);
      const totalMosqBars = series.reduce((s, x) => s + x.mosqBars, 0);

      if (!optimizationResult[sectionName]) optimizationResult[sectionName] = [];
      optimizationResult[sectionName].push({
        color: value.color,
        machineSeries: true,
        totalBars: totalHojaBars + totalMosqBars,
        totalHojaBars,
        totalCedazoBars: totalMosqBars,
        series: series.map((s, i) => ({ serieIndex: i + 1, ...s })),
        bars: [],
      });
    }

    return optimizationResult;
  }

  private getCutsWithDimension(
    rule: string,
    ancho: number,
    alto: number,
  ): { length: number; dim: string }[] {
    const r = rule.toUpperCase().trim();
    const match = r.match(/\*\s*(\d+)/);
    const multiplier = match ? parseInt(match[1], 10) : 2;
    const cuts: { length: number; dim: string }[] = [];
    const a = Number(ancho.toFixed(1));
    const h = Number(alto.toFixed(1));

    if (r.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else if (r.includes('ANCHO') && r.includes('ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else if (r.includes('SUMAR ALTO') || r.includes('ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    } else {
      for (let i = 0; i < multiplier; i++) cuts.push({ length: a, dim: 'A' });
      for (let i = 0; i < multiplier; i++) cuts.push({ length: h, dim: 'H' });
    }

    return cuts;
  }

  private isSlidingWindowType(typeName: string): boolean {
    return typeName.toUpperCase().includes('CORREDIZA');
  }

  private optimizeCutsLabeled(
    cuts: LabeledCut[],
    barLength: number,
  ): LabeledCut[][] {
    const sorted = [...cuts].sort((a, b) => b.length - a.length);
    const bins: { cuts: LabeledCut[]; remaining: number }[] = [];
    for (const cut of sorted) {
      const effective = cut.length + KERF_CM;
      let placed = false;
      for (const bin of bins) {
        if (effective <= bin.remaining) {
          bin.cuts.push(cut);
          bin.remaining -= effective;
          placed = true;
          break;
        }
      }
      if (!placed)
        bins.push({ cuts: [cut], remaining: barLength - effective });
    }
    return bins.map((b) => b.cuts);
  }

  // ── Serie de máquina ────────────────────────────────────────────────────
  // La cortadora carga varias barras y las corta con el MISMO patrón a la vez:
  //   · con mosquitero → 2 barras de hoja + 1 de mosquitero
  //   · sin mosquitero → 2 barras de hoja (sin la de mosquitero)
  // Cada "pasada" produce hasta 2 hojas + 1 mosquitero. Una ventana con más
  // hojas (3H, 4H) se parte en varias pasadas: p.ej. 3 hojas + 2 mosquiteros
  // = (2 hojas + 1 mosquitero) + (1 hoja + 1 mosquitero).
  // Las piezas de todas las ventanas con la misma "firma" de pasada se empacan
  // juntas (FFD) en barras de 580 cm para aprovechar la barra y reducir sobra.
  private buildMachineSeriesFromWindows(
    windows: {
      label: string;
      unit: LabeledCut[];
      nHoja: number;
      nMosq: number;
    }[],
    barLength: number,
  ): {
    hojaBars: number;
    mosqBars: number;
    cuts: LabeledCut[];
    totalUsed: number;
    waste: number;
    efficiency: number;
  }[] {
    // 1. Descomponer cada ventana en pasadas y agrupar por firma (hojas,mosq).
    const poolBySig = new Map<
      string,
      { hojaBars: number; mosqBars: number; cuts: LabeledCut[] }
    >();
    for (const w of windows) {
      let h = w.nHoja;
      let m = w.nMosq;
      const passes: { hb: number; mb: number }[] = [];
      while (h > 0) {
        const hb = Math.min(h, 2);
        const mb = m > 0 ? 1 : 0;
        passes.push({ hb, mb });
        h -= hb;
        m -= mb;
      }
      // Mosquiteros sobrantes (raro): se cortan solos.
      while (m > 0) {
        passes.push({ hb: 0, mb: 1 });
        m -= 1;
      }
      for (const pass of passes) {
        const sig = `${pass.hb}h${pass.mb}m`;
        if (!poolBySig.has(sig))
          poolBySig.set(sig, {
            hojaBars: pass.hb,
            mosqBars: pass.mb,
            cuts: [],
          });
        poolBySig.get(sig)!.cuts.push(...w.unit);
      }
    }

    // 2. Empacar cada firma en barras (FFD con kerf) → cada barra es una serie.
    //    Orden: primero las pasadas con más barras (2h1m antes que 1h1m, etc.).
    const sigs = [...poolBySig.keys()].sort((a, b) => {
      const pa = poolBySig.get(a)!;
      const pb = poolBySig.get(b)!;
      return (
        pb.hojaBars + pb.mosqBars - (pa.hojaBars + pa.mosqBars) ||
        pb.hojaBars - pa.hojaBars
      );
    });

    const series: {
      hojaBars: number;
      mosqBars: number;
      cuts: LabeledCut[];
      totalUsed: number;
      waste: number;
      efficiency: number;
    }[] = [];

    for (const sig of sigs) {
      const pool = poolBySig.get(sig)!;
      const bins = this.optimizeCutsLabeled(pool.cuts, barLength);
      for (const bin of bins) {
        const sorted = [...bin].sort((a, b) => b.length - a.length);
        const totalUsed = sorted.reduce((s, c) => s + c.length, 0);
        series.push({
          hojaBars: pool.hojaBars,
          mosqBars: pool.mosqBars,
          cuts: sorted,
          totalUsed: Number(totalUsed.toFixed(1)),
          waste: Number(
            (barLength - totalUsed - sorted.length * KERF_CM).toFixed(1),
          ),
          efficiency: Number(((totalUsed / barLength) * 100).toFixed(2)),
        });
      }
    }

    return series;
  }

  private optimizeCombinedCutsLabeled(
    hojaCuts: LabeledCut[],
    mosquiteroCuts: LabeledCut[],
    barLength: number,
  ): {
    combinedBins: LabeledCut[][];
    hojaOnlyBins: LabeledCut[][];
    mosquiteroOnlyBins: LabeledCut[][];
    machineSeries: MachineSerie[] | null;
  } {
    const hojaFreq = new Map<number, number>();
    for (const c of hojaCuts)
      hojaFreq.set(c.length, (hojaFreq.get(c.length) ?? 0) + 1);
    const mosquiteroFreq = new Map<number, number>();
    for (const c of mosquiteroCuts)
      mosquiteroFreq.set(c.length, (mosquiteroFreq.get(c.length) ?? 0) + 1);

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

    const effectiveHojaCuts = hojaIsDouble
      ? hojaCuts.filter((_, i) => i % 2 === 0)
      : hojaCuts;
    const effectiveHojaFreq = new Map<number, number>();
    for (const c of effectiveHojaCuts)
      effectiveHojaFreq.set(
        c.length,
        (effectiveHojaFreq.get(c.length) ?? 0) + 1,
      );

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
      const cleanedHojaCuts = effectiveHojaCuts.map((c) => ({
        ...c,
        windowLabel: c.windowLabel
          .replace(/\|HOJA$/, '')
          .replace(/\|CEDAZO$/, ''),
      }));
      const bins = this.optimizeCutsLabeled(cleanedHojaCuts, barLength);
      const series: MachineSerie[] = bins.map((bin, idx) => {
        const totalUsed = bin.reduce((s, c) => s + c.length, 0);
        return {
          serieIndex: idx + 1,
          cuts: [...bin].sort((a, b) => b.length - a.length),
          totalUsed: Number(totalUsed.toFixed(1)),
          waste: Number((barLength - totalUsed - bin.length * KERF_CM).toFixed(1)),
          efficiency: Number(((totalUsed / barLength) * 100).toFixed(2)),
        };
      });
      return {
        combinedBins: [],
        hojaOnlyBins: [],
        mosquiteroOnlyBins: [],
        machineSeries: series,
      };
    }

    // Fallback
    const hojaByLength = new Map<number, LabeledCut[]>();
    for (const cut of hojaCuts) {
      if (!hojaByLength.has(cut.length)) hojaByLength.set(cut.length, []);
      hojaByLength.get(cut.length)!.push(cut);
    }
    const mosquiteroByLength = new Map<number, LabeledCut[]>();
    for (const cut of mosquiteroCuts) {
      if (!mosquiteroByLength.has(cut.length))
        mosquiteroByLength.set(cut.length, []);
      mosquiteroByLength.get(cut.length)!.push(cut);
    }

    const pairedCuts: LabeledCut[] = [];
    const hojaLeftover: LabeledCut[] = [];
    const mosquiteroLeftover: LabeledCut[] = [];

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
      machineSeries: null,
    };
  }

  private formatAndAddResultLabeled(
    resultObj: any,
    profileName: string,
    color: string,
    bins: LabeledCut[][],
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
          waste: Number((barLength - totalUsed - bar.length * KERF_CM).toFixed(1)),
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
}
