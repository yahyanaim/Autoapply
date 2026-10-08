import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_ID = /^[A-Za-z0-9_-]{8,128}$/;

export class AdminConsoleVerifiedWebhooksQueryDto {
  @ApiProperty({ description: 'Inclusive UTC day, up to 90 days' })
  @Matches(UTC_DAY) from!: string;

  @ApiProperty({ description: 'Inclusive UTC day, up to 90 days' })
  @Matches(UTC_DAY) to!: string;

  @ApiPropertyOptional({ description: 'Opaque local delivery cursor' })
  @IsOptional() @Matches(LOCAL_ID) cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;

  @ApiPropertyOptional({ enum: ['unresolved', 'retryable', 'resolved'] })
  @IsOptional() @IsIn(['unresolved', 'retryable', 'resolved'])
  state?: 'unresolved' | 'retryable' | 'resolved';
}

class RangeDto {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) toExclusive!: string;
}

class DeliveryDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty({ enum: ['unresolved', 'retryable', 'resolved'] }) status!: string;
  @ApiProperty({ enum: ['processing_outcome_unknown', 'provider_unavailable', 'processing_error'] }) reason!: string;
  @ApiProperty({ format: 'date-time' }) observedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) finishedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) resolvedAt!: string | null;
}

export class AdminConsoleVerifiedWebhooksResponseDto {
  @ApiProperty({ enum: ['covered', 'partial', 'unavailable'] }) coverage!: string;
  @ApiProperty({ format: 'date-time' }) coverageStartAt!: string;
  @ApiProperty({ type: RangeDto }) requestedRange!: RangeDto;
  @ApiProperty({ type: RangeDto, nullable: true }) coveredRange!: RangeDto | null;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiProperty({ type: () => [DeliveryDto] }) items!: DeliveryDto[];
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
