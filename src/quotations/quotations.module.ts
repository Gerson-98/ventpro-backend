// src/quotations/quotations.module.ts

import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WindowsModule } from '../windows/windows.module';
import { CostCalculatorModule } from '../cost-calculator/cost-calculator.module';
import { PermissionsModule } from '../permissions/permissions.module';
@Module({
  imports: [PrismaModule, WindowsModule, CostCalculatorModule, PermissionsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
