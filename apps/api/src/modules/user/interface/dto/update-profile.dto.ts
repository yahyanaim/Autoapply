import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  MaxLength,
  Min,
  Max,
  IsUrl,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RemoteType } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ValidateIf((_object, value) => value !== '')
  @Matches(/^[+()\d\s.-]{5,30}$/, {
    message: 'phone must be a valid international phone number',
  })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((_object, value) => value !== '')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  linkedInUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((_object, value) => value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  portfolioUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  visaStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  desiredSalaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  desiredSalaryMax?: number;

  @ApiPropertyOptional({ enum: RemoteType })
  @IsOptional()
  @IsEnum(RemoteType)
  remotePreference?: RemoteType;
}
