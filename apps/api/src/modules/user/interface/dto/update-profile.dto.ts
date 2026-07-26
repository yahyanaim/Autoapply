import { IsOptional, IsString, IsInt, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RemoteType } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visaStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  desiredSalaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  desiredSalaryMax?: number;

  @ApiPropertyOptional({ enum: RemoteType })
  @IsOptional()
  @IsEnum(RemoteType)
  remotePreference?: RemoteType;
}
