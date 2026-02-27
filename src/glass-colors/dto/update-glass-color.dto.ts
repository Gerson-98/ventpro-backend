import { PartialType } from '@nestjs/mapped-types';
import { CreateGlassColorDto } from './create-glass-color.dto';

export class UpdateGlassColorDto extends PartialType(CreateGlassColorDto) {}
