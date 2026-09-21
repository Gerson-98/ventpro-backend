// RUTA: src/product-wizard/product-wizard.module.ts

import { Module } from '@nestjs/common';
import { ProductWizardService } from './product-wizard.service';
import { ProductWizardController } from './product-wizard.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PerfilFormulasModule } from '../perfil-formulas/perfil-formulas.module';

@Module({
  imports: [PrismaModule, PerfilFormulasModule],
  controllers: [ProductWizardController],
  providers: [ProductWizardService],
  exports: [ProductWizardService],
})
export class ProductWizardModule {}
