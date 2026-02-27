import { IsNumber, IsString, IsOptional } from 'class-validator';

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
}
