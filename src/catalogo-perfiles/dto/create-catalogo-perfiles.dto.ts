import { IsInt, IsOptional, IsString, Min, IsNotEmpty } from 'class-validator';

export class CreateCatalogoPerfilesDto {
  @IsInt()
  @IsNotEmpty()
  window_type_id: number;

  @IsOptional() @IsInt() perfil_marco_id?: number | null;
  @IsOptional() @IsInt() perfil_hoja_id?: number | null;
  @IsOptional() @IsInt() perfil_mosquitero_id?: number | null;
  @IsOptional() @IsInt() perfil_batiente_id?: number | null;
  @IsOptional() @IsInt() perfil_tapajamba_id?: number | null;

  @IsOptional() @IsString() regla_marco?: string | null;
  @IsOptional() @IsString() regla_hoja?: string | null;
  @IsOptional() @IsString() regla_mosquitero?: string | null;
  @IsOptional() @IsString() regla_batiente?: string | null;
  @IsOptional() @IsString() regla_tapajamba?: string | null;

  @IsOptional() @IsInt() @Min(0) cant_vidrios?: number;
}
