import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowDto } from './create-window.dto';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  glass_color_id?: number;

  @IsOptional()
  @Type(() => Number)
  width_cm?: number;

  @IsOptional()
  @Type(() => Number)
  height_cm?: number;
}
