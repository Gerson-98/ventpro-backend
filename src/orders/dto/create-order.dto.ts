import { IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  project: string;

  @IsNumber()
  total: number; // 👈 ahora es number, no string

  @IsString()
  @IsOptional()
  status?: string;

  @IsNumber()
  clientId: number;

  @IsBoolean()
  @IsOptional()
  include_iva?: boolean;

  // Congela/descongela el precio final del pedido.
  @IsBoolean()
  @IsOptional()
  priceLocked?: boolean;

  @IsNumber()
  @IsOptional()
  version?: number;

  // "YYYY-MM" para mover el pedido a otro mes contable; null = volver al mes de creación.
  @IsString()
  @IsOptional()
  accountingMonth?: string | null;
}
