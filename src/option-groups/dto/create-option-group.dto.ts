import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateOptionGroupDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
