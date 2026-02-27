// ventpro-backend/src/window-calculations/window-calculations.module.ts

import { Module } from '@nestjs/common';
import { WindowCalculationsService } from './window-calculations.service';
import { WindowCalculationsController } from './window-calculations.controller';
import { PrismaModule } from '../prisma/prisma.module'; // Importante

@Module({
  imports: [PrismaModule], // Añade PrismaModule aquí
  controllers: [WindowCalculationsController],
  providers: [WindowCalculationsService],
})
export class WindowCalculationsModule {}
