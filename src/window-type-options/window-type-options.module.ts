import { Module } from '@nestjs/common';
import { WindowTypeOptionsService } from './window-type-options.service';
import { WindowTypeOptionsController } from './window-type-options.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WindowTypeOptionsController],
  providers: [WindowTypeOptionsService],
  exports: [WindowTypeOptionsService],
})
export class WindowTypeOptionsModule {}
