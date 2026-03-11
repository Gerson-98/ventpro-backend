// RUTA: src/auth/auth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  /**
   * Valida si un usuario existe y si su contraseña es correcta.
   */
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Genera access_token (15m) + refresh_token (7 días, guardado en BD).
   */
  async login(user: any): Promise<{ access_token: string; refresh_token: string }> {
    const payload = { name: user.name, sub: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });
    const refresh_token = await this.generateRefreshToken(user.id);
    return { access_token, refresh_token };
  }

  /**
   * Valida el refresh_token, genera nuevos tokens (rotación).
   * Invalida el refresh_token anterior.
   */
  async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Rotación: genera nuevo refresh token (invalida el anterior)
    const new_refresh_token = await this.generateRefreshToken(stored.userId);

    const payload = {
      name: stored.user.name,
      sub: stored.user.id,
      role: stored.user.role,
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    return { access_token, refresh_token: new_refresh_token };
  }

  /**
   * Revoca el refresh_token (logout).
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Genera un refresh_token criptográficamente seguro,
   * revoca todos los anteriores del usuario (seguridad contra robo).
   */
  private async generateRefreshToken(userId: number): Promise<string> {
    // Revoca todos los refresh tokens activos del usuario
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return token;
  }
}
