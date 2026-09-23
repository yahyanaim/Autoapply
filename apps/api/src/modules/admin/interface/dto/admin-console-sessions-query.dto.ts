import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionClientType } from '@prisma/client';
import { MAX_ADMIN_USERS_PAGE_SIZE } from '../../application/admin-users.service';

export enum AdminSessionStatusDto {
  active = 'active',
  expired = 'expired',
}

export class AdminConsoleSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: MAX_ADMIN_USERS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_USERS_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ enum: SessionClientType })
  @IsOptional()
  @IsEnum(SessionClientType)
  clientType?: SessionClientType;

  @ApiPropertyOptional({ enum: AdminSessionStatusDto })
  @IsOptional()
  @IsEnum(AdminSessionStatusDto)
  status?: AdminSessionStatusDto;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  lastUsedFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  lastUsedTo?: string;
}

export class AdminConsoleSessionResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: SessionClientType })
  clientType!: SessionClientType;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastUsedAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;
}

export class AdminConsoleSessionsResponseDto {
  @ApiProperty({ type: () => [AdminConsoleSessionResponseDto] })
  sessions!: AdminConsoleSessionResponseDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
