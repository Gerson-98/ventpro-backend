import { Module } from '@nestjs/common';
import { PvcColorsService } from './pvc-colors.service';
import { PvcColorsController } from './pvc-colors.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PvcColorsController],
  providers: [PvcColorsService, PrismaService],
})
export class PvcColorsModule {}
