import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GlassColorsService } from './glass-colors.service';

@UseGuards(JwtAuthGuard)
@Controller('glass-colors')
export class GlassColorsController {
  constructor(private readonly glassColorsService: GlassColorsService) {}

  @Post()
  create(@Body() body: { name: string; description?: string }) {
    return this.glassColorsService.create(body);
  }

  @SkipThrottle()
  @Get()
  findAll() {
    return this.glassColorsService.findAll();
  }

  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.glassColorsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: { name?: string; description?: string }) {
    return this.glassColorsService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.glassColorsService.remove(+id);
  }
}
