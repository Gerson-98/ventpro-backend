import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Campos que envía "Editar Ventana" desde el Pedido (EditOrderWindowModal).
// El ValidationPipe global usa whitelist + forbidNonWhitelisted: cualquier
// campo que el frontend mande y no esté declarado aquí hace que la petición
// entera se rechace con 400 — por eso antes "no guardaba las medidas".
export class UpdateWindowDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  window_type_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  color_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  glass_color_id?: number | null;

  // Medidas en cm: aceptan enteros (120) y decimales (120.5).
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  width_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  height_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  // Si el pedido tiene el precio congelado, el service lo ignora.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @IsOptional()
  @IsString()
  design_image_url?: string | null;
}
