// RUTA: src/reports/reports.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Window, Material, AccessoryRule } from '@prisma/client';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';

type AccessoryRuleWithMaterial = AccessoryRule & { material: Material };

// ── Movido al scope de archivo para que todos los métodos lo reconozcan ──────
type LabeledCut = { length: number; windowLabel: string };

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
        to.setHours(23, 59, 59, 999);
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
        to.setHours(23, 59, 59, 999);
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
        ? this.costCalculator.aplicarRuleOverrides(catalogEntry, options)
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
      const options = (window.options as Record<string, string>) || {};

      // ── Mosquitero y refuerzos ───────────────────────────────────────────
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

      const reglasCut = this.costCalculator.aplicarRuleOverrides(
        catalogEntry,
        options,
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
          incluir: conMosquitero,
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
        'MARCO FIJO 60',
        // ── Refuerzos también entran al plan de corte ────────────────────────
        'REFUERZO HOJA 5,5 CM',
        'REFUERZO HOJA 6,6 CM',
        'REFUERZO CEDAZO',
      ]);

      for (const profile of profiles) {
        if (!profile.incluir || !profile.material || !profile.rule) continue;
        if (!CUT_PROFILES_WHITELIST.has(profile.material.name)) continue;

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

        // ── Refuerzo Hojas: mismos cortes que HOJA ───────────────────────
        if (
          profile.type === 'HOJA' &&
          conRefuerzoHojas &&
          catalogEntry.refuerzoHoja
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoHoja.name}`;
          if (!individualCutList.has(refKey))
            individualCutList.set(refKey, {
              color: window.pvcColor.name,
              cuts: [],
            });
          individualCutList.get(refKey)!.cuts.push(...allCuts);
        }

        // ── Refuerzo Mosquitero: mismos cortes que MOSQUITERO ────────────
        if (
          profile.type === 'MOSQUITERO' &&
          conRefuerzoMosquitero &&
          catalogEntry.refuerzoMosquitero
        ) {
          const refKey = `${window.pvcColor.name}|${catalogEntry.refuerzoMosquitero.name}`;
          if (!individualCutList.has(refKey))
            individualCutList.set(refKey, {
              color: window.pvcColor.name,
              cuts: [],
            });
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
        if (!optimizationResult[combinedName])
          optimizationResult[combinedName] = [];
        optimizationResult[combinedName].push({
          color,
          totalBars: machineSeries.length * 3,
          machineSeries: true,
          totalHojaBars: machineSeries.length * 2,
          totalCedazoBars: machineSeries.length * 1,
          series: machineSeries,
          bars: [],
        });
      } else {
        if (combinedBins.length > 0)
          this.formatAndAddResultLabeled(
            optimizationResult,
            combinedName,
            color,
            combinedBins,
            BAR_LENGTH,
          );
      }

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
          waste: Number((barLength - totalUsed).toFixed(1)),
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
}

// ── Algoritmo MaxRects-BSSF para optimización 2D de vidrio ───────────────────
// Guillotina con Best Short Side Fit. Retorna planchas con piezas y wasteRects.
function guillotinePack(
  pieces: { width: number; height: number; label: string }[],
  sheetW: number,
  sheetH: number,
): { pieces: { x: number; y: number; width: number; height: number; label: string }[]; wasteRects: { x: number; y: number; width: number; height: number }[] }[] {

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const sorted = [...pieces].sort((a, b) => (b.width * b.height) - (a.width * a.height));

  interface FreeRect { x: number; y: number; w: number; h: number; }
  interface Sheet {
    placed: { x: number; y: number; width: number; height: number; label: string }[];
    freeRects: FreeRect[];
  }

  const sheets: Sheet[] = [];

  function newSheet(): Sheet {
    return {
      placed: [],
      freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }],
    };
  }

  // Short Side Fit score: menor es mejor
  function bssfScore(fr: FreeRect, pw: number, ph: number): number {
    const leftoverH = Math.abs(fr.w - pw);
    const leftoverV = Math.abs(fr.h - ph);
    return Math.min(leftoverH, leftoverV);
  }

  function tryPlace(sheet: Sheet, pw: number, ph: number, label: string): boolean {
    let bestScore = Infinity;
    let bestFr: FreeRect | null = null;
    let bestRotated = false;

    for (const fr of sheet.freeRects) {
      if (pw <= fr.w && ph <= fr.h) {
        const score = bssfScore(fr, pw, ph);
        if (score < bestScore) { bestScore = score; bestFr = fr; bestRotated = false; }
      }
      if (ph <= fr.w && pw <= fr.h) {
        const score = bssfScore(fr, ph, pw);
        if (score < bestScore) { bestScore = score; bestFr = fr; bestRotated = true; }
      }
    }

    if (!bestFr) return false;

    const fw = bestRotated ? ph : pw;
    const fh = bestRotated ? pw : ph;
    const px = round1(bestFr.x);
    const py = round1(bestFr.y);

    sheet.placed.push({ x: px, y: py, width: round1(fw), height: round1(fh), label });

    const fr = bestFr;
    const newFrees: FreeRect[] = [];

    // Corte HORIZONTAL PRIMERO: rect derecho hereda altura de la pieza,
    // rect inferior hereda el ancho COMPLETO del free rect original.
    // Esto mantiene franjas inferiores amplias y contiguas → mejor empaquetado.

    // Derecha de la pieza (alto = alto de la pieza, no del free rect)
    if (fr.w - fw > 0.5) {
      newFrees.push({
        x: round1(fr.x + fw), y: round1(fr.y),
        w: round1(fr.w - fw), h: round1(fh),
      });
    }
    // Abajo de la pieza (ancho COMPLETO del free rect original)
    if (fr.h - fh > 0.5) {
      newFrees.push({
        x: round1(fr.x), y: round1(fr.y + fh),
        w: round1(fr.w), h: round1(fr.h - fh),
      });
    }

    sheet.freeRects = sheet.freeRects.filter(f => f !== fr);
    sheet.freeRects.push(...newFrees);

    // Eliminar free rects que se solapan con la pieza recién colocada
    sheet.freeRects = sheet.freeRects.filter(f => {
      const noOverlap =
        f.x >= px + fw || f.x + f.w <= px ||
        f.y >= py + fh || f.y + f.h <= py;
      return noOverlap && f.w > 0.5 && f.h > 0.5;
    });

    return true;
  }

  for (const piece of sorted) {
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlace(sheet, piece.width, piece.height, piece.label)) { placed = true; break; }
    }
    if (!placed) {
      const sheet = newSheet();
      sheets.push(sheet);
      tryPlace(sheet, piece.width, piece.height, piece.label);
    }
  }

  return sheets
    .filter(s => s.placed.length > 0)
    .map(s => ({
      pieces: s.placed,
      wasteRects: s.freeRects
        .filter(f => f.w > 1 && f.h > 1)
        .map(f => ({
          x: round1(f.x), y: round1(f.y),
          width: round1(f.w), height: round1(f.h),
        })),
    }));
}
