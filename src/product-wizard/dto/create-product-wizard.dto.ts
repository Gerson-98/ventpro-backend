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
  Min,
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

  // Piezas independientes por dimensión: la mayoría de los perfiles cortan
  // parejo (ej. 2 y 2), pero hay casos reales (Tapajamba típica) que solo se
  // cortan en un sentido — ahí la otra dimensión va en 0.
  @IsInt()
  @Min(0)
  piezasAncho: number;

  @IsInt()
  @Min(0)
  piezasAlto: number;

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

  // Cantidad fija por ventana. Se ignora si se configura una fórmula
  // (formula_type) — en ese caso la cantidad se calcula sola.
  @IsOptional()
  @IsInt()
  quantity?: number;

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

  // Cantidad calculada por fórmula en vez de fija: cantidad = ceil(barras o
  // m² del perfil indicado en formula_slot × formula_factor). Ej: "1 rollo
  // de felpa por cada 4 barras de Hoja" → PER_BARRA, slot 'hoja', factor 4.
  // Los tres van juntos — si se define uno, se deben definir los tres.
  @IsOptional()
  @IsIn(['PER_BARRA', 'PER_M2'])
  formula_type?: 'PER_BARRA' | 'PER_M2';

  @IsOptional()
  @IsIn(['marco', 'hoja', 'mosquitero', 'batiente', 'tapajamba'])
  formula_slot?: string;

  @IsOptional()
  @IsNumber()
  formula_factor?: number;
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
