import {
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class CreateAccessoryRuleDto {
  @IsInt()
  @IsNotEmpty()
  window_type_id: number;

  @IsInt()
  @IsNotEmpty()
  material_id: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  option_group?: string | null;

  @IsOptional()
  @IsString()
  option_key?: string | null;

  // ── Cantidad por fórmula (ignora "quantity" si está definido) ─────────────
  // 'PER_BARRA' | 'PER_M2'
  @IsOptional()
  @IsString()
  formula_type?: string | null;

  // 'marco' | 'hoja' | 'mosquitero' | 'batiente' | 'tapajamba'
  @IsOptional()
  @IsString()
  formula_slot?: string | null;

  @IsOptional()
  @IsNumber()
  formula_factor?: number | null;
}
