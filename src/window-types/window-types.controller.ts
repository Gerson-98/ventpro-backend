import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
} from '@nestjs/common';
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
      description?: string;
      pvcColorIds?: number[];
    },
  ) {
    return this.windowTypesService.create(data);
  }

  @Get()
  findAll() {
    return this.windowTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowTypesService.findOne(+id);
  }

  @Get('by-pvc/:colorId')
  findByPvc(@Param('colorId') colorId: string) {
    return this.windowTypesService.findByPvcColor(Number(colorId));
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: { name?: string; description?: string },
  ) {
    return this.windowTypesService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.windowTypesService.remove(+id);
  }
}
