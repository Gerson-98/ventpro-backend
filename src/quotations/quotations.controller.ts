import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/permission.decorator';
import { QuotationsService } from './quotations.service';
import {
  CreateQuotationDto,
  ConfirmQuotationDto,
} from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';

@UseGuards(JwtAuthGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @UseGuards(PermissionsGuard)
  @RequirePermission('quotations.create')
  @Post()
  create(@Body() createQuotationDto: CreateQuotationDto, @Request() req) {
    return this.quotationsService.create(createQuotationDto, req.user);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission('quotations.view')
  @Get()
  findAll(
    @Request() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('clientStatus') clientStatus?: string,
  ) {
    return this.quotationsService.findAll(req.user, +page, +limit, {
      search,
      quotationStatus: status,
      clientStatus,
    });
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission('quotations.view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.quotationsService.findOne(id, req.user);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() confirmQuotationDto: ConfirmQuotationDto,
    @Request() req,
  ) {
    return this.quotationsService.confirm(id, confirmQuotationDto, req.user);
  }

  // ── Reabrir cotización confirmada para poder editarla ──────────────────────
  // Solo ADMIN. El pedido vinculado no se toca hasta re-confirmar.
  @Post(':id/reopen')
  reopen(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.quotationsService.reopen(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateQuotationDto: UpdateQuotationDto,
    @Request() req,
  ) {
    return this.quotationsService.update(id, updateQuotationDto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.quotationsService.remove(id, req.user);
  }
}
