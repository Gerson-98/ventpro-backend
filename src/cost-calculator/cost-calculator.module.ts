import { Module } from '@nestjs/common';
import { CostCalculatorService } from './cost-calculator.service';
import { CostCalculatorController } from './cost-calculator.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CostCalculatorController],
  providers: [CostCalculatorService],
  exports: [CostCalculatorService], // Lo exportamos para que QuotationsModule lo pueda usar
})
export class CostCalculatorModule {}
