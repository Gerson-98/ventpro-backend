import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowTypeDto } from './create-window-type.dto';

export class UpdateWindowTypeDto extends PartialType(CreateWindowTypeDto) {}
