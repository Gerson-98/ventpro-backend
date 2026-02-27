// RUTA: src/users/users.module.ts

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module'; // ✨ 1. Importa el PrismaModule

@Module({
  imports: [PrismaModule], // ✨ 2. Añade PrismaModule a la lista de imports
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // ✨ 3. Exporta el UsersService para que otros módulos lo puedan usar
})
export class UsersModule {}
