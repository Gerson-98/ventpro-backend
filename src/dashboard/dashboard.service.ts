// RUTA: src/dashboard/dashboard.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(user: { id: number; role: string }) {
    const isAdmin = user.role === 'ADMIN';
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Filtro de ownership para vendedores
    const orderWhere = isAdmin
      ? {}
      : {
          generatedFromQuotation: {
            userId: user.id,
          },
        };

    const quotationWhere = isAdmin ? {} : { userId: user.id };

    const [
      totalClients,
      totalOrders,
      totalWindows,
      totalSales,
      activeOrders,
      completedOrders,
      totalQuotations,
      confirmedQuotations,
      salesThisMonth,
      salesLastMonth,
      ordersThisMonth,
      ordersLastMonth,
      monthlyData,
    ] = await this.prisma.$transaction([
      // Totales generales
      this.prisma.client.count(),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.window.count(),
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { total: true },
      }),

      // Pedidos por estado
      this.prisma.order.count({
        where: { ...orderWhere, status: { in: ['en_proceso', 'en_fabricacion', 'listo_para_instalar', 'en_ruta'] } },
      }),
      this.prisma.order.count({
        where: { ...orderWhere, status: 'completado' },
      }),

      // Cotizaciones
      this.prisma.quotation.count({ where: quotationWhere }),
      this.prisma.quotation.count({
        where: { ...quotationWhere, status: 'confirmado' },
      }),

      // Ventas este mes
      this.prisma.order.aggregate({
        where: {
          ...orderWhere,
          createdAt: { gte: startOfMonth },
        },
        _sum: { total: true },
      }),

      // Ventas mes anterior
      this.prisma.order.aggregate({
        where: {
          ...orderWhere,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { total: true },
      }),

      // Pedidos este mes
      this.prisma.order.count({
        where: { ...orderWhere, createdAt: { gte: startOfMonth } },
      }),

      // Pedidos mes anterior
      this.prisma.order.count({
        where: {
          ...orderWhere,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),

      // Datos mensuales para gráfica (últimos 6 meses) — solo los campos necesarios
      this.prisma.order.findMany({
        where: {
          ...orderWhere,
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
          },
        },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Procesar datos mensuales para la gráfica
    const monthlyMap: Record<string, { pedidos: number; ventas: number }> = {};
    monthlyData.forEach((row) => {
      const date = new Date(row.createdAt);
      const key = date.toLocaleString('es-GT', {
        month: 'short',
        year: 'numeric',
      });
      if (!monthlyMap[key]) monthlyMap[key] = { pedidos: 0, ventas: 0 };
      monthlyMap[key].pedidos += 1;
      monthlyMap[key].ventas += Number(row.total || 0);
    });

    const monthly = Object.entries(monthlyMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

    // Calcular variación mes a mes
    const salesThisMonthVal = Number(salesThisMonth._sum.total || 0);
    const salesLastMonthVal = Number(salesLastMonth._sum.total || 0);
    const salesChange =
      salesLastMonthVal > 0
        ? Math.round(
            ((salesThisMonthVal - salesLastMonthVal) / salesLastMonthVal) * 100,
          )
        : null;
    const ordersChange =
      ordersLastMonth > 0
        ? Math.round(
            ((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100,
          )
        : null;

    return {
      totals: {
        clients: totalClients,
        orders: totalOrders,
        windows: totalWindows,
        sales: Number(totalSales._sum.total || 0),
      },
      orders: {
        active: activeOrders,
        completed: completedOrders,
        thisMonth: ordersThisMonth,
        lastMonth: ordersLastMonth,
        change: ordersChange,
      },
      quotations: {
        total: totalQuotations,
        confirmed: confirmedQuotations,
        pending: totalQuotations - confirmedQuotations,
      },
      sales: {
        thisMonth: salesThisMonthVal,
        lastMonth: salesLastMonthVal,
        change: salesChange,
      },
      monthly,
    };
  }
}
