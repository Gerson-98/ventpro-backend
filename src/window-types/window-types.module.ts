import { Module } from '@nestjs/common';
import { WindowTypesService } from './window-types.service';
import { WindowTypesController } from './window-types.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WindowTypesController],
  providers: [WindowTypesService, PrismaService],
  exports: [WindowTypesService],
})
export class WindowTypesModule {}
