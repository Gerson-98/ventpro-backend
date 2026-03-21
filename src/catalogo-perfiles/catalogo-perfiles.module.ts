import { Module } from '@nestjs/common';
import { CatalogoPerfilesService } from './catalogo-perfiles.service';
import { CatalogoPerfilesController } from './catalogo-perfiles.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CostCalculatorModule } from '../cost-calculator/cost-calculator.module';

@Module({
  imports: [PrismaModule, CostCalculatorModule],
  controllers: [CatalogoPerfilesController],
  providers: [CatalogoPerfilesService],
  exports: [CatalogoPerfilesService],
})
export class CatalogoPerfilesModule {}
