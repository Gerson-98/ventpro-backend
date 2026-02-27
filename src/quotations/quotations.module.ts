// src/quotations/quotations.module.ts

import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { PrismaModule } from '../prisma/prisma.module'; // ✨ 1. Importa el módulo de Prisma
import { WindowsModule } from '../windows/windows.module';
@Module({
  // ✨ 2. Añade PrismaModule a la lista de imports
  imports: [PrismaModule, WindowsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
