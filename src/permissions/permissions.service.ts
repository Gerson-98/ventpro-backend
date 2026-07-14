// RUTA: src/permissions/permissions.service.ts
//
// Fuente de verdad de qué puede hacer cada rol. ADMIN tiene bypass total
// hardcodeado (nunca se restringe desde la BD, para que nadie pueda
// bloquearse a sí mismo desactivando un permiso por error). VENDEDOR y
// SUPERVISOR se resuelven contra la tabla role_permissions en cada consulta
// — sin caché — para que un cambio del admin surta efecto de inmediato.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async can(role: Role, permissionKey: string): Promise<boolean> {
    if (role === 'ADMIN') return true;

    const row = await this.prisma.rolePermission.findFirst({
      where: { role, permission: { key: permissionKey } },
      select: { allowed: true },
    });
    return row?.allowed ?? false;
  }

  // Set resuelto de permission keys que tiene un rol — usado por GET /permissions/me
  async getResolvedPermissions(role: Role): Promise<string[]> {
    if (role === 'ADMIN') {
      const all = await this.prisma.permission.findMany({ select: { key: true } });
      return all.map((p) => p.key);
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { role, allowed: true },
      select: { permission: { select: { key: true } } },
    });
    return rows.map((r) => r.permission.key);
  }

  // Catálogo completo + matriz de valores por rol — para la tabla del panel admin.
  // ADMIN no se incluye como columna: siempre tiene bypass total.
  async getMatrix() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      include: { rolePermissions: true },
    });

    return permissions.map((p) => ({
      key: p.key,
      label: p.label,
      category: p.category,
      roles: {
        VENDEDOR: p.rolePermissions.find((rp) => rp.role === 'VENDEDOR')?.allowed ?? false,
        SUPERVISOR: p.rolePermissions.find((rp) => rp.role === 'SUPERVISOR')?.allowed ?? false,
      },
    }));
  }

  async setPermission(role: Role, permissionKey: string, allowed: boolean) {
    const permission = await this.prisma.permission.findUnique({
      where: { key: permissionKey },
    });
    if (!permission) {
      throw new Error(`Permiso desconocido: ${permissionKey}`);
    }

    return this.prisma.rolePermission.upsert({
      where: { role_permissionId: { role, permissionId: permission.id } },
      update: { allowed },
      create: { role, permissionId: permission.id, allowed },
    });
  }
}
