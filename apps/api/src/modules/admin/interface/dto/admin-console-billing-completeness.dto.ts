import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_LOCAL_ID = /^[A-Za-z0-9_-]{8,128}$/;

export class AdminConsoleBillingCompletenessQueryDto {
  @ApiProperty({ example: '2026-10-07', description: 'Inclusive UTC day; at most 7 days' })
  @Matches(UTC_DAY) from!: string;

  @ApiProperty({ example: '2026-10-07', description: 'Inclusive UTC day; at most 7 days' })
  @Matches(UTC_DAY) to!: string;

  @ApiPropertyOptional({ description: 'Opaque local scan ID, to page an existing persisted scan' })
  @IsOptional() @Matches(SAFE_LOCAL_ID) scanId?: string;

  @ApiPropertyOptional({ description: 'Opaque local findings cursor' })
  @IsOptional() @Matches(SAFE_LOCAL_ID) cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

class ScanRangeDto {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) toExclusive!: string;
}

class ScanFindingDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty({ format: 'date-time' }) eventAt!: string;
  @ApiProperty() finding!: string;
}

export class AdminConsoleBillingCompletenessResponseDto {
  @ApiProperty() scanId!: string;
  @ApiProperty({ enum: ['completed', 'incomplete', 'failed', 'unavailable'] })
  status!: 'completed' | 'incomplete' | 'failed' | 'unavailable';
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty({ type: ScanRangeDto }) requestedRange!: ScanRangeDto;
  @ApiProperty({ type: ScanRangeDto, nullable: true }) attemptedRange!: ScanRangeDto | null;
  @ApiProperty({ type: ScanRangeDto, nullable: true,
    description: 'Range with complete provider enumeration; local comparisons use separate per-page database snapshots' }) verifiedCoveredRange!: ScanRangeDto | null;
  @ApiProperty({ format: 'date-time', description: 'Stripe event-created cutoff, not a scan-wide database snapshot' }) asOf!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) completedAt!: string | null;
  @ApiProperty() scannedEventCount!: number;
  @ApiProperty({ type: () => [ScanFindingDto] }) findings!: ScanFindingDto[];
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
