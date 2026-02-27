import { Module } from '@nestjs/common';
import { WindowsController } from './windows.controller';
import { WindowsService } from './windows.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WindowsController],
  providers: [WindowsService, PrismaService],
  exports: [WindowsService],
})
export class WindowsModule {}
