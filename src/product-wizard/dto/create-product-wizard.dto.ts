// RUTA: src/product-wizard/dto/create-product-wizard.dto.ts

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class FormulaStepDto {
  @IsIn(['sumar', 'restar', 'multiplicar', 'dividir'])
  op: 'sumar' | 'restar' | 'multiplicar' | 'dividir';

  @IsNumber()
  value: number;
}

export class PerfilInputDto {
  @IsIn(['MARCO', 'HOJA', 'TAPAJAMBA', 'BATIENTE', 'MOSQUITERO'])
  slot: 'MARCO' | 'HOJA' | 'TAPAJAMBA' | 'BATIENTE' | 'MOSQUITERO';

  @IsInt()
  material_id: number;

  @IsInt()
  piezas: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaStepDto)
  formulaAncho: FormulaStepDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaStepDto)
  formulaAlto: FormulaStepDto[];
}

export class VidrioInputDto {
  @IsBoolean()
  usesGlass: boolean;

  @IsOptional()
  @IsInt()
  cant_vidrios?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaStepDto)
  formulaAncho?: FormulaStepDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaStepDto)
  formulaAlto?: FormulaStepDto[];
}

export class AccesorioInputDto {
  @IsInt()
  material_id: number;

  @IsInt()
  quantity: number;

  // Si es false, el accesorio se ofrece como opcional en el cotizador en vez
  // de agregarse siempre con el producto.
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  // Condición: este accesorio solo se agrega si, al cotizar, la opción
  // `option_group` del cotizador tiene seleccionado el valor `option_key`.
  // Ambos van juntos (los dos o ninguno) — sin ellos el accesorio es
  // incondicional. Referencian OptionGroup.key / OptionValue.key.
  @IsOptional()
  @IsString()
  option_group?: string;

  @IsOptional()
  @IsString()
  option_key?: string;
}

export class CreateProductWizardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsInt()
  series_id?: number;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PerfilInputDto)
  perfiles: PerfilInputDto[];

  @ValidateNested()
  @Type(() => VidrioInputDto)
  vidrio: VidrioInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccesorioInputDto)
  accesorios?: AccesorioInputDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  pvcColorIds?: number[];

  // Refuerzos: reutilizan las medidas de Hoja/Mosquitero (mismo corte, otro
  // material) — no llevan fórmula propia.
  @IsOptional()
  @IsInt()
  refuerzoHojaMaterialId?: number;

  @IsOptional()
  @IsInt()
  refuerzoMosquiteroMaterialId?: number;
}
