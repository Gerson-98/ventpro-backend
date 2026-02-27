import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WindowCalculationsService } from './window-calculations.service';

@UseGuards(JwtAuthGuard)
@Controller('window-calculations')
export class WindowCalculationsController {
  constructor(
    private readonly calculationsService: WindowCalculationsService,
  ) {}

  @Get()
  findAll() {
    return this.calculationsService.findAllTypesWithCalculations();
  }

  @Post()
  upsert(@Body() data: any) {
    return this.calculationsService.upsert(data);
  }
}
