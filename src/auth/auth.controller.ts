// RUTA: src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

// Frontend (ventpro-frontend.onrender.com) y backend (ventpro-backend-yah0.onrender.com)
// son cross-site bajo la PSL (*.onrender.com), por lo que la cookie del refresh
// debe ser SameSite=None + Secure en producción para que viaje en POST cross-site.
// Path '/auth' permite que /auth/refresh Y /auth/logout reciban la cookie
// (el path anterior '/auth/refresh' impedía revocar el token en el logout).
const REFRESH_COOKIE_OPTIONS = (isProduction: boolean) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/auth',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Devuelve access_token en body + refresh_token en httpOnly cookie.
   */
  // Sobreescribe el límite del throttler 'global' SOLO para esta ruta — no
  // crea un throttler nuevo que aplicaría a todo el sitio (ver app.module.ts).
  @Throttle({ global: { ttl: 60000, limit: 5 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const { access_token, refresh_token } = await this.authService.login(user);

    res.cookie(
      'refresh_token',
      refresh_token,
      REFRESH_COOKIE_OPTIONS(process.env.NODE_ENV === 'production'),
    );

    return { access_token };
  }

  /**
   * POST /auth/refresh
   * Lee el refresh_token de la httpOnly cookie,
   * devuelve un nuevo access_token + rota el refresh_token.
   */
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req as any).cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException('No hay refresh token');

    const { access_token, refresh_token } =
      await this.authService.refresh(refreshToken);

    res.cookie(
      'refresh_token',
      refresh_token,
      REFRESH_COOKIE_OPTIONS(process.env.NODE_ENV === 'production'),
    );

    return { access_token };
  }

  /**
   * POST /auth/logout
   * Revoca el refresh_token en BD y limpia la cookie.
   */
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req as any).cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refresh_token', { path: '/auth' });
    return { message: 'Sesión cerrada correctamente' };
  }
}
