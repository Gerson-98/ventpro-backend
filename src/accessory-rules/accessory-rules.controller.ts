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
import { AccessoryRulesService } from './accessory-rules.service';
import { CreateAccessoryRuleDto } from './dto/create-accessory-rule.dto';
import { UpdateAccessoryRuleDto } from './dto/update-accessory-rule.dto';

@Controller('accessory-rules')
export class AccessoryRulesController {
  constructor(private readonly service: AccessoryRulesService) {}

  @Get()
  findAll(@Query('windowTypeId') windowTypeId?: string) {
    return this.service.findAll(
      windowTypeId ? Number(windowTypeId) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAccessoryRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessoryRuleDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
