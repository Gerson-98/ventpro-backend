import { Module } from '@nestjs/common';
import { WindowTypService } from './window-typ.service';
import { WindowTypController } from './window-typ.controller';

@Module({
  controllers: [WindowTypController],
  providers: [WindowTypService],
})
export class WindowTypModule {}
