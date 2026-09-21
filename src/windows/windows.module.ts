import { Module } from '@nestjs/common';
import { WindowsController } from './windows.controller';
import { WindowsService } from './windows.service';
import { PrismaService } from '../prisma/prisma.service';
import { PerfilFormulasModule } from '../perfil-formulas/perfil-formulas.module';

@Module({
  imports: [PerfilFormulasModule],
  controllers: [WindowsController],
  providers: [WindowsService, PrismaService],
  exports: [WindowsService],
})
export class WindowsModule {}
