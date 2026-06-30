import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MaterialType } from '@prisma/client';

export class CreateMaterialDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @IsString()
  name: string;

  @IsEnum(MaterialType, {
    message: 'Tipo debe ser PERFIL, VIDRIO o ACCESORIO.',
  })
  type: MaterialType;

  @IsNumber()
  @Min(0)
  price_white: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_color?: number | null;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  coverage_per_unit?: number | null;
}
