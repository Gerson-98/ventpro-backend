import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WindowTypesService } from './window-types.service';

@UseGuards(JwtAuthGuard)
@Controller('window-types')
export class WindowTypesController {
  constructor(private readonly windowTypesService: WindowTypesService) {}

  @Post()
  create(
    @Body()
    data: {
      name: string;
      displayName?: string;
      description?: string;
      pvcColorIds?: number[];
    },
  ) {
    return this.windowTypesService.create(data);
  }

  @SkipThrottle()
  @Get()
  findAll() {
    return this.windowTypesService.findAll();
  }

  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowTypesService.findOne(+id);
  }

  @SkipThrottle()
  @Get('by-pvc/:colorId')
  findByPvc(@Param('colorId') colorId: string) {
    return this.windowTypesService.findByPvcColor(Number(colorId));
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: { name?: string; displayName?: string | null; description?: string },
  ) {
    return this.windowTypesService.update(+id, data);
  }

  // El frontend envía PATCH — este alias apunta al mismo handler
  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() data: { name?: string; displayName?: string | null; description?: string },
  ) {
    return this.windowTypesService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.windowTypesService.remove(+id);
  }
}
