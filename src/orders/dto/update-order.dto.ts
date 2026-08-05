// RUTA: src/orders/dto/update-order.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
// La clase UpdateOrderDto se queda como está.
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

// Reprograma la fecha de FABRICACIÓN (Calendario de Fabricación).
// El nombre de los campos en el wire se mantiene por compatibilidad con el
// frontend existente; internamente el service los guarda en
// fabricationStartDate/fabricationEndDate.
export class RescheduleOrderDto {
  @IsDateString()
  @IsNotEmpty()
  installationStartDate: string;

  @IsDateString()
  @IsNotEmpty()
  installationEndDate: string;
}

// Agenda la fecha REAL de instalación (Calendario de Instalación, nuevo).
// Al agendar, el pedido pasa automáticamente a estado "agendado".
export class ScheduleInstallationDto {
  @IsDateString()
  @IsNotEmpty()
  installationStartDate: string;

  @IsDateString()
  @IsNotEmpty()
  installationEndDate: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;
}
