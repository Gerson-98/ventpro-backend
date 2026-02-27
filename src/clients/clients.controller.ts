import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { ClientStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(Number(id));
  }

  @Post()
  create(
    @Body()
    data: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      status?: ClientStatus; // ✨ Permite recibir el estado
    },
  ) {
    return this.clientsService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      status?: ClientStatus; // ✨ Permite actualizar el estado
    },
  ) {
    return this.clientsService.update(Number(id), data);
  }

  // ✨ Creamos un endpoint dedicado para actualizar el estado desde la cotización
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() data: { status: ClientStatus },
  ) {
    return this.clientsService.updateStatus(Number(id), data.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(Number(id));
  }
}
