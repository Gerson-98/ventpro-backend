import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CatalogoPerfilesService } from './catalogo-perfiles.service';
import { CreateCatalogoPerfilesDto } from './dto/create-catalogo-perfiles.dto';
import { UpdateCatalogoPerfilesDto } from './dto/update-catalogo-perfiles.dto';

@Controller('catalogo-perfiles')
export class CatalogoPerfilesController {
  constructor(private readonly service: CatalogoPerfilesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('by-window-type/:windowTypeId')
  findByWindowType(@Param('windowTypeId', ParseIntPipe) id: number) {
    return this.service.findByWindowType(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatalogoPerfilesDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatalogoPerfilesDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
