// src/quotations/quotations.module.ts

import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WindowsModule } from '../windows/windows.module';
import { CostCalculatorModule } from '../cost-calculator/cost-calculator.module';
@Module({
  imports: [PrismaModule, WindowsModule, CostCalculatorModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
