import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowTypDto } from './create-window-typ.dto';

export class UpdateWindowTypDto extends PartialType(CreateWindowTypDto) {}
