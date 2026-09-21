// src/quotations/quotations.module.ts

import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WindowsModule } from '../windows/windows.module';
import { CostCalculatorModule } from '../cost-calculator/cost-calculator.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PerfilFormulasModule } from '../perfil-formulas/perfil-formulas.module';
@Module({
  imports: [PrismaModule, WindowsModule, CostCalculatorModule, PermissionsModule, PerfilFormulasModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
