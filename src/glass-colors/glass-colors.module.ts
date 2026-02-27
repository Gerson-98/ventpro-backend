import { Module } from '@nestjs/common';
import { GlassColorsService } from './glass-colors.service';
import { GlassColorsController } from './glass-colors.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GlassColorsController],
  providers: [GlassColorsService, PrismaService], // ✅ Asegura que PrismaService esté aquí
  exports: [GlassColorsService],
})
export class GlassColorsModule {}
