import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WindowsService } from './windows.service';
import { UpdateWindowDto } from './dto/update-window.dto';

@UseGuards(JwtAuthGuard)
@Controller('windows')
export class WindowsController {
  constructor(private readonly windowsService: WindowsService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.windowsService.findAll(+page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowsService.findOne(Number(id));
  }

  @Post()
  async create(@Body() data: any) {
    return this.windowsService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWindowDto, @Request() req) {
    return this.windowsService.updateWindow(Number(id), dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.windowsService.remove(Number(id), req.user);
  }

  // ✅ DUPLICAR VENTANA
  @Post(':id/duplicate')
  async duplicateWindow(@Param('id') id: number, @Request() req) {
    return this.windowsService.duplicateWindow(Number(id), req.user);
  }

  @Post('calculate-preview')
  async calculatePreview(
    @Body()
    data: {
      window_type_id: number;
      width_cm: number;
      height_cm: number;
    },
  ) {
    return this.windowsService.calculateWindowMeasurements(
      data.window_type_id,
      data.width_cm,
      data.height_cm,
    );
  }
}
