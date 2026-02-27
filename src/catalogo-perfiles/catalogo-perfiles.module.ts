import { Module } from '@nestjs/common';
import { CatalogoPerfilesService } from './catalogo-perfiles.service';
import { CatalogoPerfilesController } from './catalogo-perfiles.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogoPerfilesController],
  providers: [CatalogoPerfilesService],
  exports: [CatalogoPerfilesService],
})
export class CatalogoPerfilesModule {}
