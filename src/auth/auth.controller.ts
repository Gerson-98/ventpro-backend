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

const REFRESH_COOKIE_OPTIONS = (isProduction: boolean) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
  path: '/auth/refresh',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Devuelve access_token en body + refresh_token en httpOnly cookie.
   */
  @Throttle({ login: { ttl: 60000, limit: 5 } })
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
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { message: 'Sesión cerrada correctamente' };
  }
}
