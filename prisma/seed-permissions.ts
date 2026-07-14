// RUTA: prisma/seed-permissions.ts
//
// Siembra el catálogo de permisos y sus valores por defecto por rol.
// Idempotente: se puede volver a correr para agregar permisos nuevos sin
// afectar los que un admin ya haya configurado manualmente (upsert por key,
// y solo crea la fila RolePermission si no existe — no pisa un `allowed`
// que el admin ya haya cambiado).
//
// Uso: npx ts-node prisma/seed-permissions.ts

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

interface PermissionSeed {
  key: string;
  label: string;
  category: string;
  // Default de `allowed` por rol. ADMIN no se siembra: tiene bypass total
  // hardcodeado en el backend y no aparece en la matriz configurable.
  defaults: Partial<Record<Exclude<Role, 'ADMIN'>, boolean>>;
}

const PERMISSIONS: PermissionSeed[] = [
  // ── Pedidos ──────────────────────────────────────────────────────────────
  {
    key: 'orders.view_all',
    label: 'Ver pedidos de todos los vendedores',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: true },
  },
  {
    key: 'orders.view_financials',
    label: 'Ver precios, totales e IVA del pedido',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'orders.reschedule',
    label: 'Reprogramar fecha de instalación',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: true },
  },
  {
    key: 'orders.change_status',
    label: 'Cambiar el estado del pedido',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'orders.manage_checklist',
    label: 'Ver y gestionar checklist de instalación',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'orders.generate_pdf',
    label: 'Generar PDF del pedido',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'orders.edit_measurements',
    label: 'Editar medidas (ej. cambiar tamaño de marco)',
    category: 'Pedidos',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  // ── Reportes técnicos y financieros ─────────────────────────────────────
  {
    key: 'reports.profiles',
    label: 'Ver reporte de perfiles / materiales',
    category: 'Reportes',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'reports.cut_optimizer',
    label: 'Ver optimizador de plan de corte',
    category: 'Reportes',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'reports.glass_cut',
    label: 'Ver optimizador de corte de vidrio',
    category: 'Reportes',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'reports.financial_summary',
    label: 'Ver resumen financiero del pedido',
    category: 'Reportes',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  {
    key: 'reports.dashboard_profits',
    label: 'Ver dashboard de ganancias',
    category: 'Reportes',
    defaults: { VENDEDOR: false, SUPERVISOR: false },
  },
  // ── Cotizaciones ─────────────────────────────────────────────────────────
  {
    key: 'quotations.create',
    label: 'Crear cotizaciones',
    category: 'Cotizaciones',
    defaults: { VENDEDOR: true, SUPERVISOR: false },
  },
  {
    key: 'quotations.view',
    label: 'Ver cotizaciones',
    category: 'Cotizaciones',
    defaults: { VENDEDOR: true, SUPERVISOR: false },
  },
  // ── Calendario ───────────────────────────────────────────────────────────
  {
    key: 'calendar.navigate_to_order',
    label: 'Ir al detalle del pedido desde el calendario',
    category: 'Calendario',
    defaults: { VENDEDOR: false, SUPERVISOR: true },
  },
];

async function main() {
  for (const p of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, category: p.category },
      create: { key: p.key, label: p.label, category: p.category },
    });

    for (const role of ['VENDEDOR', 'SUPERVISOR'] as const) {
      const allowed = p.defaults[role] ?? false;
      const existing = await prisma.rolePermission.findUnique({
        where: { role_permissionId: { role: role as Role, permissionId: permission.id } },
      });
      // Solo crea si no existe — no pisa un valor que el admin ya haya configurado.
      if (!existing) {
        await prisma.rolePermission.create({
          data: { role: role as Role, permissionId: permission.id, allowed },
        });
      }
    }
  }

  console.log(`Sembrados ${PERMISSIONS.length} permisos.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
