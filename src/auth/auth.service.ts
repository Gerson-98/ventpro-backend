// RUTA: src/auth/auth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service'; // Para buscar usuarios
import { JwtService } from '@nestjs/jwt'; // Para crear los tokens
import * as bcrypt from 'bcrypt'; // Para comparar contraseñas

@Injectable()
export class AuthService {
  // Inyectamos los servicios que necesitamos
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
   * Valida si un usuario existe y si su contraseña es correcta.
   * Esta es la lógica central del login.
   * @param email - El email del usuario que intenta iniciar sesión.
   * @param pass - La contraseña en texto plano que envía el usuario.
   */
  async validateUser(email: string, pass: string): Promise<any> {
    // 1. Buscamos al usuario por su email. Usamos la función que ya creamos en UsersService.
    const user = await this.usersService.findOneByEmail(email);

    // 2. Si el usuario existe, comparamos la contraseña enviada con la encriptada en la BD.
    // bcrypt.compare hace esta magia de forma segura.
    if (user && (await bcrypt.compare(pass, user.password))) {
      // 3. Si la contraseña es correcta, devolvemos el usuario SIN la contraseña.
      // Esto es crucial por seguridad.
      const { password, ...result } = user;
      return result;
    }

    // 4. Si el usuario no existe o la contraseña es incorrecta, devolvemos null.
    return null;
  }

  /**
   * Genera el token de acceso (el pase digital) para un usuario validado.
   * @param user - El objeto del usuario que ya ha sido validado.
   */
  async login(user: any) {
    // El "payload" es la información que guardaremos dentro del token.
    // Solo guardamos lo esencial y no sensible.
    const payload = {
      name: user.name,
      sub: user.id, // 'sub' (subject) es el estándar para el ID del usuario en JWT.
      role: user.role,
    };

    // Usamos el JwtService para "firmar" el payload y crear el token.
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // NOTA: Las funciones create, findAll, findOne, update y remove no tienen sentido
  // en un servicio de autenticación, por lo que las eliminamos.
}
