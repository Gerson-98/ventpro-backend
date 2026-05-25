import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WindowTypeOptionsService } from './window-type-options.service';
import { CreateWindowTypeOptionDto } from './dto/create-window-type-option.dto';
import { UpdateWindowTypeOptionDto } from './dto/update-window-type-option.dto';

@Controller('window-type-options')
export class WindowTypeOptionsController {
  constructor(private readonly service: WindowTypeOptionsService) {}

  @SkipThrottle()
  @Get()
  findAll(@Query('windowTypeId') windowTypeId?: string) {
    if (windowTypeId)
      return this.service.findByWindowType(Number(windowTypeId));
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWindowTypeOptionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWindowTypeOptionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
