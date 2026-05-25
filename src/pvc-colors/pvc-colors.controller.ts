import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PvcColorsService } from './pvc-colors.service';
import { CreatePvcColorDto } from './dto/create-pvc-color.dto';

@UseGuards(JwtAuthGuard)
@Controller('pvc-colors')
export class PvcColorsController {
  constructor(private readonly pvcColorsService: PvcColorsService) {}

  @Post()
  create(@Body() createPvcColorDto: CreatePvcColorDto) {
    return this.pvcColorsService.create(createPvcColorDto);
  }

  @SkipThrottle()
  @Get()
  async findAll() {
    const result = await this.pvcColorsService.findAll();
    return Array.isArray(result) ? result : []; // ✅ garantiza siempre array
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pvcColorsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: CreatePvcColorDto) {
    return this.pvcColorsService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pvcColorsService.remove(+id);
  }
}
