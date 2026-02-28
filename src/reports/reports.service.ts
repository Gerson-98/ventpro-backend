// RUTA: src/reports/reports.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Window, Material, AccessoryRule } from '@prisma/client';

type AccessoryRuleWithMaterial = AccessoryRule & { material: Material };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async processWindowsToReport(windows: any[]) {
    const allMaterials = await this.prisma.material.findMany();
    const materialsMap = new Map(allMaterials.map((m) => [m.name, m]));

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

    const profilesReportMap = new Map<string, any>();
    const accessoriesReportMap = new Map<string, any>();
    const glassReportMap = new Map<string, any>();

    for (const window of windows) {
      if (!window || !window.windowType || !window.pvcColor) continue;

      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;
      const options = (window.options as any) || {};

      let dynamicProfiles = [
        {
          type: 'MARCO',
          material: catalogEntry.perfilMarco,
          rule: catalogEntry.regla_marco,
        },
        {
          type: 'HOJA',
          material: catalogEntry.perfilHoja,
          rule: catalogEntry.regla_hoja,
        },
        {
          type: 'MOSQUITERO',
          material: catalogEntry.perfilMosquitero,
          rule: catalogEntry.regla_mosquitero,
        },
        {
          type: 'BATIENTE',
          material: catalogEntry.perfilBatiente,
          rule: catalogEntry.regla_batiente,
        },
        {
          type: 'TAPAJAMBA',
          material: catalogEntry.perfilTapajamba,
          rule: catalogEntry.regla_tapajamba,
        },
      ];

      const isDuela = window.glassColor?.name.toUpperCase().includes('DUELA');

      switch (window.windowType.name) {
        case 'PUERTA CORREDIZA 2 HOJAS 66 CM MARCO 45 CM':
        case 'VENTANA CORREDIZA 2 HOJAS 55 CM MARCO 45 CM':
        case 'VENTANA CORREDIZA 2 HOJAS 55 CM MARCO 5 CM':
        case 'VENTANA CORREDIZA 4 HOJAS 55 CM MARCO 45 CM':
        case 'VENTANA CORREDIZA 4 HOJAS 55 CM MARCO 5 CM':
        case 'PUERTA CORREDIZA 3 HOJAS 66 CM MARCO 45 CM':
        case 'PUERTA CORREDIZA 3 HOJAS 66 CM MARCO 5 CM':
        case 'VENTANA CORREDIZA 3 HOJAS 55 CM MARCO 45 CM':
        case 'VENTANA CORREDIZA 3 HOJAS 55 CM MARCO 5 CM':
        case 'PUERTA CORREDIZA 4 HOJAS 66 CM MARCO 45 CM':
        case 'PUERTA CORREDIZA 4 HOJAS 66 CM MARCO 5 CM':
          if (isDuela) {
            const batienteCorredizo = materialsMap.get('BATIENTE CORREDIZO');
            const batienteInsulado = materialsMap.get('BATIENTE INSULADO');
            if (batienteCorredizo && batienteInsulado) {
              dynamicProfiles = dynamicProfiles.map((p) =>
                p.material?.id === batienteCorredizo.id
                  ? { ...p, material: batienteInsulado }
                  : p,
              );
            }
          }
          break;
        case 'PUERTA ANDINA':
          if (window.glassColor?.name.toUpperCase() === 'VIDRIO Y DUELA') {
            const batienteParaDuela = materialsMap.get('BATIENTE PARA DUELA');
            if (batienteParaDuela && catalogEntry.regla_batiente) {
              dynamicProfiles.push({
                type: 'BATIENTE',
                material: batienteParaDuela,
                rule: catalogEntry.regla_batiente,
              });
            }
          }
          break;
        case 'VENTANA ABATIBLE':
          const materialHojaAbatible =
            options.tipo_perfil === 'adentro'
              ? materialsMap.get('HOJA ABATIBLE ADENTRO')
              : materialsMap.get('HOJA ABATIBLE AFUERA');
          if (materialHojaAbatible && catalogEntry.regla_hoja) {
            dynamicProfiles = dynamicProfiles.map((p) =>
              p.type === 'HOJA' ? { ...p, material: materialHojaAbatible } : p,
            );
          }
          if (options.cantidad_hojas === '2') {
            const tDeFijo = materialsMap.get('T DE FIJO');
            if (tDeFijo) {
              const key = `${window.pvcColor.name}|${tDeFijo.name}`;
              const existing = profilesReportMap.get(key) || {
                material: tDeFijo,
                pvcColor: window.pvcColor.name,
                totalLength: 0,
              };
              existing.totalLength += window.height_cm * windowQuantity;
              profilesReportMap.set(key, existing);
            }
          }
          break;
      }

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

      // 2. PERFILES
      for (const profile of dynamicProfiles) {
        if (profile.material && profile.rule) {
          const requiredLength = this.calculateProfileLength(
            profile.rule,
            profile.type,
            window,
          );
          const key = `${window.pvcColor.name}|${profile.material.name}`;
          const existing = profilesReportMap.get(key) || {
            material: profile.material,
            pvcColor: window.pvcColor.name,
            totalLength: 0,
          };
          existing.totalLength += requiredLength * windowQuantity;
          profilesReportMap.set(key, existing);
        }
      }

      // 3. VIDRIOS
      if (window.glassColor) {
        const glassNameUpper = window.glassColor.name.toUpperCase();
        let vAncho = window.vidrioAncho || 0;
        let vAlto = window.vidrioAlto || 0;

        if (vAncho === 0 || vAlto === 0) {
          const reglaBase = catalogEntry.regla_hoja || catalogEntry.regla_marco;
          if (reglaBase) {
            vAncho =
              this.calculateProfileLength(reglaBase, 'ANCHO', window) - 9;
            vAlto = this.calculateProfileLength(reglaBase, 'ALTO', window) - 9;
          }
        }

        if (glassNameUpper.includes('DUELA')) {
          const duelaMaterial = materialsMap.get('DUELA');
          if (duelaMaterial) {
            const stripsNeeded = Math.ceil(vAlto / 15);
            const totalDuelaLength = stripsNeeded * vAncho;
            const key = `${window.pvcColor.name}|${duelaMaterial.name}`;
            const existing = profilesReportMap.get(key) || {
              material: duelaMaterial,
              pvcColor: window.pvcColor.name,
              totalLength: 0,
            };
            existing.totalLength += totalDuelaLength * windowQuantity;
            profilesReportMap.set(key, existing);
          }
        } else if (glassNameUpper !== 'VIDRIO Y DUELA') {
          const glassMaterial = materialsMap.get(window.glassColor.name);
          if (glassMaterial && vAncho > 0 && vAlto > 0) {
            const key = glassMaterial.name;
            const glassCount = catalogEntry.cant_vidrios ?? 1;
            const glassArea = vAncho * vAlto * glassCount * windowQuantity;
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
        const barras = Math.ceil(item.totalLength / 580);
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
          include: {
            windowType: { include: { calculation: true } },
            pvcColor: true,
            glassColor: true,
          },
        },
      },
    });
    if (!quotation)
      throw new NotFoundException(`Cotización #${quotationId} no encontrada`);

    const normalizedWindows = quotation.quotation_windows.map((qw) => {
      const calc = qw.windowType?.calculation;

      const hAncho = calc
        ? qw.width_cm - (calc.hojaDescuento || 0)
        : qw.width_cm;
      const hAlto = calc
        ? qw.height_cm - (calc.hojaDescuento || 0)
        : qw.height_cm;

      return {
        ...qw,
        window_type_id: qw.window_type_id,
        windowType: qw.windowType,
        pvcColor: qw.pvcColor,
        glassColor: qw.glassColor,
        hojaAncho: hAncho,
        hojaAlto: hAlto,
        vidrioAncho: calc ? hAncho - (calc.vidrioDescuento || 0) : hAncho,
        vidrioAlto: calc ? hAlto - (calc.vidrioDescuento || 0) : hAlto,
      };
    });

    return this.processWindowsToReport(normalizedWindows);
  }

  // ─── NUEVO: Costo de materiales de un pedido ─────────────────────────────
  async getOrderMaterialCost(orderId: number): Promise<number> {
    const materials = await this.generateProfilesReport(orderId);
    return materials.reduce((sum, item) => sum + (item.precioTotal || 0), 0);
  }

  // ─── NUEVO: Resumen financiero individual de un pedido ───────────────────
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

  // ─── NUEVO: Dashboard de ganancias (todos los pedidos completados/activos) ─
  async getDashboardProfits(filters: {
    fromDate?: string;
    toDate?: string;
    status?: string;
  }) {
    const where: any = {};

    // Filtro por estado — por defecto excluye solo cancelados
    if (filters.status && filters.status !== 'todos') {
      where.status = filters.status;
    } else {
      where.status = { not: 'cancelado' };
    }

    // Filtro por rango de fechas (basado en createdAt)
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
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

    // Calcular costo de materiales para cada pedido en paralelo
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
          // Pedido sin ventanas o sin catálogo — lo incluimos con costo 0
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

    // Totales acumulados
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

    // Agrupar por mes para la gráfica
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

  // ─── generateCutOptimization (con trazabilidad por ventana) ────────────────
  // Cada corte ahora lleva { length, windowLabel } para que el frontend pueda
  // mostrar a qué ventana pertenece cada corte en el plan impreso.
  private async generateCutOptimization(windows: any[]) {
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

    for (let wi = 0; wi < windows.length; wi++) {
      const window = windows[wi];
      if (!window || !window.windowType || !window.pvcColor) continue;
      const catalogEntry = catalogMap.get(window.window_type_id);
      if (!catalogEntry) continue;

      const windowQuantity = window.quantity || 1;

      // Etiqueta legible para el fabricante: "V1 · 1.20x1.50m"
      const windowLabel = `V${wi + 1} - ${(window.width_cm / 100).toFixed(2)}x${(window.height_cm / 100).toFixed(2)}m`;

      const profiles = [
        {
          type: 'MARCO',
          material: catalogEntry.perfilMarco,
          rule: catalogEntry.regla_marco,
        },
        {
          type: 'HOJA',
          material: catalogEntry.perfilHoja,
          rule: catalogEntry.regla_hoja,
        },
        {
          type: 'MOSQUITERO',
          material: catalogEntry.perfilMosquitero,
          rule: catalogEntry.regla_mosquitero,
        },
        {
          type: 'BATIENTE',
          material: catalogEntry.perfilBatiente,
          rule: catalogEntry.regla_batiente,
        },
        {
          type: 'TAPAJAMBA',
          material: catalogEntry.perfilTapajamba,
          rule: catalogEntry.regla_tapajamba,
        },
      ];

      for (const profile of profiles) {
        if (!profile.material || !profile.rule) continue;

        const individualCuts = this.getIndividualCuts(
          profile.rule,
          profile.type,
          window,
        );
        if (individualCuts.length === 0) continue;

        // Expandir por cantidad, etiquetando cada pieza
        const allCuts: LabeledCut[] = [];
        for (let qi = 0; qi < windowQuantity; qi++) {
          const suffix =
            windowQuantity > 1 ? ` (${qi + 1}/${windowQuantity})` : '';
          for (const cut of individualCuts) {
            allCuts.push({ length: cut, windowLabel: windowLabel + suffix });
          }
        }

        const isSlidingType = this.isSlidingWindowType(window.windowType.name);
        const isHojaOrMosquitero =
          profile.type === 'HOJA' || profile.type === 'MOSQUITERO';

        if (isSlidingType && isHojaOrMosquitero) {
          const hojaProfileName = catalogEntry.perfilHoja?.name;
          const mosquiteroProfileName = catalogEntry.perfilMosquitero?.name;
          if (!hojaProfileName || !mosquiteroProfileName) continue;

          const key = `${window.pvcColor.name}|${hojaProfileName}|${mosquiteroProfileName}`;
          if (!combinableCutList.has(key)) {
            combinableCutList.set(key, {
              color: window.pvcColor.name,
              hojaCuts: [],
              mosquiteroCuts: [],
            });
          }
          if (profile.type === 'HOJA') {
            combinableCutList.get(key)!.hojaCuts.push(...allCuts);
          } else {
            combinableCutList.get(key)!.mosquiteroCuts.push(...allCuts);
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
      const { optimizedHojaBins, optimizedMosquiteroBins } =
        this.optimizeCombinedCutsLabeled(
          value.hojaCuts,
          value.mosquiteroCuts,
          BAR_LENGTH,
        );
      if (optimizedHojaBins.length > 0)
        this.formatAndAddResultLabeled(
          optimizationResult,
          hojaProfileName,
          color,
          optimizedHojaBins,
          BAR_LENGTH,
        );
      if (optimizedMosquiteroBins.length > 0)
        this.formatAndAddResultLabeled(
          optimizationResult,
          mosquiteroProfileName,
          color,
          optimizedMosquiteroBins,
          BAR_LENGTH,
        );
    }

    return optimizationResult;
  }

  // ── Helpers con trazabilidad de ventana ──────────────────────────────────────

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

  private optimizeCombinedCutsLabeled(
    hojaCuts: { length: number; windowLabel: string }[],
    mosquiteroCuts: { length: number; windowLabel: string }[],
    barLength: number,
  ) {
    type LC = { length: number; windowLabel: string };
    const freq = new Map<number, { hoja: LC[]; mosquitero: LC[] }>();
    hojaCuts.forEach((c) => {
      const f = freq.get(c.length) || { hoja: [], mosquitero: [] };
      f.hoja.push(c);
      freq.set(c.length, f);
    });
    mosquiteroCuts.forEach((c) => {
      const f = freq.get(c.length) || { hoja: [], mosquitero: [] };
      f.mosquitero.push(c);
      freq.set(c.length, f);
    });

    const finalHoja: LC[] = [];
    const finalMosq: LC[] = [];

    // Primera pasada: triples (2 hojas + 1 mosquitero misma medida en una barra)
    for (const [, f] of freq.entries()) {
      const triples = Math.min(
        Math.floor(f.hoja.length / 2),
        f.mosquitero.length,
      );
      for (let i = 0; i < triples; i++) {
        finalHoja.push(f.hoja.shift()!, f.hoja.shift()!);
        finalMosq.push(f.mosquitero.shift()!);
      }
    }
    // Segunda pasada: restantes
    for (const [, f] of freq.entries()) {
      finalHoja.push(...f.hoja);
      finalMosq.push(...f.mosquitero);
    }

    return {
      optimizedHojaBins: this.optimizeCutsLabeled(finalHoja, barLength),
      optimizedMosquiteroBins: this.optimizeCutsLabeled(finalMosq, barLength),
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
          // Cada corte: { length: number, windowLabel: string }
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

  private isSlidingWindowType(typeName: string): boolean {
    return typeName.toUpperCase().includes('CORREDIZA');
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

  private getIndividualCuts(
    rule: string,
    profileType: string,
    window: Window,
  ): number[] {
    const useWindowMeasures =
      profileType === 'MARCO' || profileType === 'TAPAJAMBA';
    const width = useWindowMeasures ? window.width_cm : (window.hojaAncho ?? 0);
    const height = useWindowMeasures
      ? window.height_cm
      : (window.hojaAlto ?? 0);
    const multiplierMatch = rule.match(/\*(\d+)$/);
    const multiplier = multiplierMatch ? parseInt(multiplierMatch[1], 10) : 1;
    const cuts: number[] = [];

    if (rule.includes('SUMAR ANCHO Y MULTIPLICAR ALTO')) {
      cuts.push(width);
      for (let i = 0; i < multiplier; i++) cuts.push(height);
    } else if (rule.includes('ANCHO') && rule.includes('ALTO')) {
      // *N = N piezas totales (N/2 anchos + N/2 altos)
      // Ej: *4 → 2 anchos + 2 altos; *6 → 3 anchos + 3 altos
      const repeatCount = multiplier / 2;
      for (let i = 0; i < repeatCount; i++) cuts.push(width, height);
    } else if (rule.includes('ALTO')) {
      for (let i = 0; i < multiplier; i++) cuts.push(height);
    }

    return cuts.map((cut) => Number(cut.toFixed(1)));
  }

  private calculateProfileLength(
    rule: string,
    profileType: string,
    window: Window,
  ): number {
    const useWindowMeasures =
      profileType === 'MARCO' || profileType === 'TAPAJAMBA';
    const currentWidth = useWindowMeasures
      ? window.width_cm
      : (window.hojaAncho ?? 0);
    const currentHeight = useWindowMeasures
      ? window.height_cm
      : (window.hojaAlto ?? 0);
    const multiplierMatch = rule.match(/\*(\d+)$/);
    const multiplier = multiplierMatch ? parseInt(multiplierMatch[1], 10) : 1;

    if (rule.includes('SUMAR ANCHO Y MULTIPLICAR ALTO'))
      return currentWidth + currentHeight * multiplier;
    let length = 0;
    if (rule.includes('ANCHO') && rule.includes('ALTO'))
      // (ancho + alto) * multiplicador: para *2 → 2 anchos + 2 altos
      length = (currentWidth + currentHeight) * multiplier;
    else if (rule.includes('ALTO')) length = currentHeight * multiplier;
    else length = 0;
    return length;
  }
}
