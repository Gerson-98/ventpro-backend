import { PartialType } from '@nestjs/mapped-types';
import { CreateProfileTypeDto } from './create-profile-type.dto';

export class UpdateProfileTypeDto extends PartialType(CreateProfileTypeDto) {}
