import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_ADMIN_AUDIT_PAGE_SIZE } from '../../application/admin-audit.service';

const SAFE_ACTIVITY_LOG_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

export class AdminConsoleActivityLogsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: MAX_ADMIN_AUDIT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_AUDIT_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ description: 'Exact safe administrative action name' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_ACTIVITY_LOG_IDENTIFIER)
  action?: string;

  @ApiPropertyOptional({ description: 'Opaque actor user reference' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_ACTIVITY_LOG_IDENTIFIER)
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'Exact safe target type' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_ACTIVITY_LOG_IDENTIFIER)
  targetType?: string;

  @ApiPropertyOptional({ description: 'Exact safe target identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_ACTIVITY_LOG_IDENTIFIER)
  targetId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;
}

export class AdminConsoleActivityLogSnapshotDto {
  @ApiPropertyOptional()
  status?: string;

  @ApiPropertyOptional()
  role?: string;

  @ApiPropertyOptional()
  plan?: string;

  @ApiPropertyOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  suspendedAt?: string | null;
}

export class AdminConsoleActivityLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ nullable: true })
  action!: string | null;

  @ApiProperty({ nullable: true })
  targetType!: string | null;

  @ApiProperty({ nullable: true })
  targetId!: string | null;

  @ApiProperty({ nullable: true, description: 'Opaque actor reference' })
  actorRef!: string | null;

  @ApiProperty({ nullable: true })
  correlationId!: string | null;

  @ApiProperty({ type: () => AdminConsoleActivityLogSnapshotDto, nullable: true })
  before!: AdminConsoleActivityLogSnapshotDto | null;

  @ApiProperty({ type: () => AdminConsoleActivityLogSnapshotDto, nullable: true })
  after!: AdminConsoleActivityLogSnapshotDto | null;
}

export class AdminConsoleActivityLogsResponseDto {
  @ApiProperty({ type: () => [AdminConsoleActivityLogResponseDto] })
  events!: AdminConsoleActivityLogResponseDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
