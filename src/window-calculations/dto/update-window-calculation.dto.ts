import { PartialType } from '@nestjs/mapped-types';
import { CreateWindowCalculationDto } from './create-window-calculation.dto';

export class UpdateWindowCalculationDto extends PartialType(CreateWindowCalculationDto) {}
