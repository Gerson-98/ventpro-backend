import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WindowTypService } from './window-typ.service';
import { CreateWindowTypDto } from './dto/create-window-typ.dto';
import { UpdateWindowTypDto } from './dto/update-window-typ.dto';

@Controller('window-typ')
export class WindowTypController {
  constructor(private readonly windowTypService: WindowTypService) {}

  @Post()
  create(@Body() createWindowTypDto: CreateWindowTypDto) {
    return this.windowTypService.create(createWindowTypDto);
  }

  @Get()
  findAll() {
    return this.windowTypService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.windowTypService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWindowTypDto: UpdateWindowTypDto) {
    return this.windowTypService.update(+id, updateWindowTypDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.windowTypService.remove(+id);
  }
}
