// RUTA: src/users/dto/create-user.dto.ts

import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsEnum,
} from 'class-validator';
import { Role } from '@prisma/client'; // Importa el Enum 'Role' desde el cliente de Prisma

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;
}
