// RUTA: src/users/users.service.ts

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service'; // Importa Prisma
import * as bcrypt from 'bcrypt'; // Importa bcrypt para encriptar

@Injectable()
export class UsersService {
  // Inyectamos el servicio de Prisma para poder hablar con la base de datos
  constructor(private prisma: PrismaService) {}

  /**
   * Crea un nuevo usuario y encripta su contraseña.
   */
  async create(createUserDto: CreateUserDto) {
    // 1. Verificamos si el email ya existe para evitar duplicados.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });
    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso.');
    }

    // 2. Encriptamos la contraseña antes de guardarla (10 es el "costo" de encriptación).
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    // 3. Creamos el usuario en la base de datos con la contraseña ya encriptada.
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto, // Usamos los datos del DTO (name, email, role)
        password: hashedPassword, // Reemplazamos la contraseña en texto plano por la encriptada
      },
    });

    // 4. ¡MUY IMPORTANTE! Eliminamos la contraseña del objeto antes de devolverlo.
    // Nunca debemos exponer ni siquiera la contraseña encriptada en las respuestas de la API.
    const { password, ...result } = user;
    return result;
  }

  /**
   * Devuelve todos los usuarios sin su contraseña.
   */
  async findAll() {
    return this.prisma.user.findMany({
      // Usamos `select` para elegir explícitamente qué campos devolver, excluyendo la contraseña.
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
  }

  /**
   * Busca un usuario por su ID, sin devolver la contraseña.
   */
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID #${id} no encontrado.`);
    }
    return user;
  }

  /**
   * Busca un usuario por su email.
   * ¡OJO! Este método SÍ devuelve la contraseña.
   * Solo debe ser usado internamente por el AuthService para la validación del login.
   */
  async findOneByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado.`);
    }
    return user;
  }

  /**
   * Actualiza un usuario (implementación básica).
   */
  async update(id: number, updateUserDto: UpdateUserDto) {
    // Si se está actualizando la contraseña, también deberíamos encriptarla.
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  /**
   * Elimina un usuario.
   */
  async remove(id: number) {
    return this.prisma.user.delete({ where: { id } });
  }
}
