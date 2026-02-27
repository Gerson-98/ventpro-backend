// RUTA: src/orders/dto/update-order.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
// La clase UpdateOrderDto se queda como está.
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

// ✨ AÑADE ESTA NUEVA CLASE AL FINAL DEL ARCHIVO ✨
// Este es el "contrato" específico para la acción de reprogramar.
export class RescheduleOrderDto {
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
