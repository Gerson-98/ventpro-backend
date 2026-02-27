import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowTypeOptionDto } from './create-window-type-option.dto';

export class UpdateWindowTypeOptionDto extends PartialType(
  CreateWindowTypeOptionDto,
) {}
