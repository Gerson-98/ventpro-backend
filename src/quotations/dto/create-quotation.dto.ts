import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class QuotationWindowDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsString()
  @IsOptional()
  design_image_url?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsNumber()
  @IsNotEmpty()
  width_m: number;

  @IsNumber()
  @IsNotEmpty()
  height_m: number;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  price_per_m2?: number;

  @IsNumber()
  @IsNotEmpty()
  window_type_id: number;

  @IsNumber()
  @IsNotEmpty()
  color_id: number;

  @IsNumber()
  @IsNotEmpty()
  glass_color_id: number;

  @IsObject()
  @IsOptional()
  options?: any;
}

export class CreateQuotationDto {
  @IsString()
  @IsNotEmpty()
  project: string;

  @IsNumber()
  @IsNotEmpty()
  price_per_m2: number;

  @IsNumber()
  @IsOptional()
  clientId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationWindowDto)
  windows: QuotationWindowDto[];

  @IsBoolean()
  @IsOptional()
  include_iva?: boolean;

  @IsNumber()
  @IsOptional()
  total_price?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reference_image_url?: string;
}

export class ConfirmQuotationDto {
  @IsDateString()
  @IsNotEmpty()
  installationStartDate: string;

  @IsDateString()
  @IsNotEmpty()
  installationEndDate: string;

  // ── Datos que el vendedor confirma con el cliente SOLO la primera vez que
  // se confirma la cotización (ver confirm() en el service). Al re-confirmar
  // (reabrir → editar → confirmar de nuevo) estos campos se omiten y el
  // backend conserva lo que ya había — no tiene sentido volver a preguntar.
  // Por eso son opcionales acá; confirm() exige que vengan solo cuando
  // corresponde (primera confirmación).
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsOptional()
  marcoUbicacion?: string[];

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  quitarEtiquetas?: string;

  // Cliente real (nombre/teléfono/dirección) que se confirma por teléfono
  // al momento de agendar — reemplaza cualquier cliente genérico con el
  // que se haya creado la cotización original.
  @IsNumber()
  @IsOptional()
  clientId?: number;

  // Referencias de instalación (código de garita, portón, piso, etc.) —
  // texto libre opcional, también solo en la primera confirmación.
  @IsString()
  @IsOptional()
  referenciasInstalacion?: string;
}
