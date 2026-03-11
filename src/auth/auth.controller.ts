// RUTA: src/auth/auth.controller.ts

import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto'; // ✨ Crearemos este DTO a continuación

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ✨ La única ruta que necesitamos: POST /auth/login
  @Throttle({ login: { ttl: 60000, limit: 5 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // 1. Validamos al usuario
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      // Si la validación falla, lanzamos un error claro.
      throw new UnauthorizedException('Credenciales inválidas');
    }
    // 2. Si la validación es exitosa, generamos el token
    return this.authService.login(user);
  }
}
