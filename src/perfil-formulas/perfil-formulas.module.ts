// RUTA: src/perfil-formulas/perfil-formulas.module.ts

import { Module } from '@nestjs/common';
import { PerfilFormulasService } from './perfil-formulas.service';
import { PerfilFormulasController } from './perfil-formulas.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PerfilFormulasController],
  providers: [PerfilFormulasService],
  exports: [PerfilFormulasService],
})
export class PerfilFormulasModule {}
