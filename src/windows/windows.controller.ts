import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
  findAll() {
    return this.windowsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowsService.findOne(Number(id));
  }

  @Post()
  async create(@Body() data: any) {
    console.log('🧾 Datos recibidos del frontend:', data);
    return this.windowsService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWindowDto) {
    return this.windowsService.updateWindow(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.windowsService.remove(Number(id));
  }

  // ✅ DUPLICAR VENTANA
  @Post(':id/duplicate')
  async duplicateWindow(@Param('id') id: number) {
    return this.windowsService.duplicateWindow(Number(id));
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
