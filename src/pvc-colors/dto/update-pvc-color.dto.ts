import { PartialType } from '@nestjs/mapped-types';
import { CreatePvcColorDto } from './create-pvc-color.dto';

export class UpdatePvcColorDto extends PartialType(CreatePvcColorDto) {}
