// RUTA: src/reports/reports.module.ts

import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CostCalculatorService } from '../cost-calculator/cost-calculator.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService, CostCalculatorService],
})
export class ReportsModule {}
