import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessoryRuleDto } from './create-accessory-rule.dto';

export class UpdateAccessoryRuleDto extends PartialType(
  CreateAccessoryRuleDto,
) {}
