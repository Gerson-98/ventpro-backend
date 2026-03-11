import { Type } from 'class-transformer';
import {
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
}
