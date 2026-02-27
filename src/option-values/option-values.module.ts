import { Module } from '@nestjs/common';
import { OptionValuesService } from './option-values.service';
import { OptionValuesController } from './option-values.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OptionValuesController],
  providers: [OptionValuesService],
  exports: [OptionValuesService],
})
export class OptionValuesModule {}
