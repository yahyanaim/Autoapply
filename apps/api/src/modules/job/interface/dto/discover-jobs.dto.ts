import { Type, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RemoteType } from '@prisma/client';

export class DiscoverJobsDto {
  @ApiProperty({ description: 'Ready, parsed resume used to rank jobs' })
  @IsString()
  @MaxLength(64)
  resumeId!: string;

  @ApiPropertyOptional({
    description: 'Optional target role or keywords that narrow the candidate pool',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  query?: string;

  @ApiPropertyOptional({ description: 'Optional preferred location' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ enum: RemoteType })
  @IsOptional()
  @IsEnum(RemoteType)
  remoteType?: RemoteType;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 20,
    default: 20,
    description: 'Maximum number of ranked jobs returned',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
