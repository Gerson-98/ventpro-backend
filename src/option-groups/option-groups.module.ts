import { Module } from '@nestjs/common';
import { OptionGroupsService } from './option-groups.service';
import { OptionGroupsController } from './option-groups.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OptionGroupsController],
  providers: [OptionGroupsService],
  exports: [OptionGroupsService],
})
export class OptionGroupsModule {}
