// RUTA: src/permissions/permissions.controller.ts

import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PermissionsService } from './permissions.service';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // Permisos resueltos del usuario logueado — consumido por el frontend
  // (PermissionsContext) para decidir qué mostrar/habilitar, sin hardcodear rol.
  @Get('me')
  async getMine(@Request() req) {
    const permissions = await this.permissionsService.getResolvedPermissions(
      req.user.role,
    );
    return { role: req.user.role, permissions };
  }

  // Catálogo completo + matriz por rol — para la tabla del panel admin.
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  getMatrix() {
    return this.permissionsService.getMatrix();
  }

  // Togglea un permiso para un rol. Solo ADMIN — este endpoint NUNCA se
  // vuelve él mismo un permiso configurable (evita el auto-bloqueo).
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch()
  async setPermission(
    @Body() body: { role: string; permissionKey: string; allowed: boolean },
  ) {
    const { role, permissionKey, allowed } = body;
    if (role !== 'VENDEDOR' && role !== 'SUPERVISOR') {
      throw new BadRequestException(
        'Solo se pueden configurar permisos de VENDEDOR o SUPERVISOR. ADMIN siempre tiene acceso total.',
      );
    }
    if (!permissionKey || typeof allowed !== 'boolean') {
      throw new BadRequestException('permissionKey y allowed son requeridos');
    }
    await this.permissionsService.setPermission(role as Role, permissionKey, allowed);
    return this.permissionsService.getMatrix();
  }
}
