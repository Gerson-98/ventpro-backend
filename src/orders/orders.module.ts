import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaService } from '../prisma/prisma.service';
import { CostCalculatorModule } from '../cost-calculator/cost-calculator.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [CostCalculatorModule, PermissionsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService],
})
export class OrdersModule {}
