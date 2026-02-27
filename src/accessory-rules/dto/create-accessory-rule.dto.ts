import { IsInt, IsOptional, IsString, Min, IsNotEmpty } from 'class-validator';

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
}
