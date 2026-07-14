// RUTA: src/permissions/permissions.guard.ts
//
// Reemplaza a RolesGuard para endpoints cuya autorización depende de un
// permiso configurable (no de un rol fijo). ADMIN siempre pasa (bypass
// resuelto dentro de PermissionsService.can()).

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './permission.decorator';
import { PermissionsService } from './permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }

    const allowed = await this.permissionsService.can(user.role, requiredPermission);
    if (!allowed) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }

    return true;
  }
}
