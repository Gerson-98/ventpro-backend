// RUTA: src/cost-calculator/cost-calculator.module.ts

import { Module } from '@nestjs/common';
import { CostCalculatorService } from './cost-calculator.service';
import { CostCalculatorController } from './cost-calculator.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { PerfilFormulasModule } from '../perfil-formulas/perfil-formulas.module';

@Module({
  imports: [AppSettingsModule, PerfilFormulasModule],
  controllers: [CostCalculatorController],
  providers: [CostCalculatorService, PrismaService],
  exports: [CostCalculatorService],
})
export class CostCalculatorModule {}
