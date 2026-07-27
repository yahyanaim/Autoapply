import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class ExperienceEditDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @MaxLength(2_000)
  description!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  highlights!: string[];
}

class ProjectEditDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @MaxLength(1_500)
  description!: string;
}

export class UpdateApplicationMaterialsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_200)
  profile?: string;

  @ApiPropertyOptional({ type: [ExperienceEditDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExperienceEditDto)
  experience?: ExperienceEditDto[];

  @ApiPropertyOptional({ type: [ProjectEditDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProjectEditDto)
  projects?: ProjectEditDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  coverLetter?: string;
}
