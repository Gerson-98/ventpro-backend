import { Module } from '@nestjs/common';
import { AccessoryRulesService } from './accessory-rules.service';
import { AccessoryRulesController } from './accessory-rules.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AccessoryRulesController],
  providers: [AccessoryRulesService],
  exports: [AccessoryRulesService],
})
export class AccessoryRulesModule {}
