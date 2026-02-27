import { Module } from '@nestjs/common';
import { ProfileTypesService } from './profile-types.service';
import { ProfileTypesController } from './profile-types.controller';

@Module({
  controllers: [ProfileTypesController],
  providers: [ProfileTypesService],
})
export class ProfileTypesModule {}
