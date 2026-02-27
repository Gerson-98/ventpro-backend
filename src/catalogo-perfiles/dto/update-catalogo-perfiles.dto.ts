import { PartialType } from '@nestjs/mapped-types';
import { CreateCatalogoPerfilesDto } from './create-catalogo-perfiles.dto';

export class UpdateCatalogoPerfilesDto extends PartialType(
  CreateCatalogoPerfilesDto,
) {}
