import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  UpdateOrderDto,
  RescheduleOrderDto,
  UpdateOrderStatusDto,
} from './dto/update-order.dto';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('scheduled')
  findScheduled(@Request() req) {
    return this.ordersService.findScheduled(req.user);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('month') month?: string,
  ) {
    return this.ordersService.findAll(req.user, +page, +limit, { search, status, month });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.findOne(id, req.user);
  }

  @Post()
  create(@Body() data: CreateOrderDto) {
    return this.ordersService.create(data);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateOrderDto, @Request() req) {
    return this.ordersService.update(id, data, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.ordersService.remove(id, req.user);
  }

  @Patch(':id/reschedule')
  reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() rescheduleOrderDto: RescheduleOrderDto,
    @Request() req,
  ) {
    return this.ordersService.reschedule(id, rescheduleOrderDto, req.user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @Request() req,
  ) {
    return this.ordersService.updateStatus(id, updateOrderStatusDto, req.user);
  }

  @Patch(':id/marco-size')
  swapMarcoSize(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { marcoSize: '4.5' | '5.0' },
    @Request() req,
  ) {
    return this.ordersService.swapMarcoSize(id, body.marcoSize, req.user);
  }
}
