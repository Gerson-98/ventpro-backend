import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateWindowTypeOptionDto {
  @IsInt()
  window_type_id: number;

  @IsInt()
  group_id: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
