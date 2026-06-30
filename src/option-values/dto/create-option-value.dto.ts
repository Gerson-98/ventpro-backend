import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateOptionValueDto {
  @IsInt()
  group_id: number;

  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  // ── Visibilidad condicional: este valor solo aparece si el grupo
  // depends_on_group_key tiene seleccionado depends_on_value_key.
  @IsOptional()
  @IsString()
  depends_on_group_key?: string | null;

  @IsOptional()
  @IsString()
  depends_on_value_key?: string | null;

  // ── Si se define, seleccionar este valor fuerza el estado del mosquitero.
  @IsOptional()
  @IsBoolean()
  forces_mosquitero?: boolean | null;
}
