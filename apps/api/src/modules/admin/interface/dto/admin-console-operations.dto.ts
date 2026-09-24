import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApplicationStatus,
  NotificationChannel,
  NotificationStatus,
  RemoteType,
  JobDeactivationReason,
  JobStatus,
} from '@prisma/client';

const CUID = /^c[a-z0-9]{24}$/;

class CursorQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export enum AdminJobEligibilityDto {
  eligible = 'eligible',
  stale = 'stale',
}

export class AdminConsoleJobsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9._ -]+$/)
  source?: string;

  @ApiPropertyOptional({ enum: AdminJobEligibilityDto })
  @IsOptional()
  @IsEnum(AdminJobEligibilityDto)
  eligibility?: AdminJobEligibilityDto;
}

export class AdminConsoleIdParamDto {
  @ApiProperty({ pattern: '^c[a-z0-9]{24}$' })
  @Matches(CUID, { message: 'id must be a valid identifier' })
  id!: string;
}

export class AdminConsoleJobResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) company!: string | null;
  @ApiProperty({ nullable: true }) source!: string | null;
  @ApiProperty({ nullable: true }) location!: string | null;
  @ApiProperty({ enum: RemoteType, nullable: true }) remoteType!: RemoteType | null;
  @ApiProperty({ enum: JobStatus }) status!: JobStatus;
  @ApiProperty() lastObservedAt!: string;
  @ApiProperty() eligible!: boolean;
  @ApiProperty() createdAt!: string;
}

export class AdminConsoleJobsResponseDto {
  @ApiProperty({ type: () => [AdminConsoleJobResponseDto] }) jobs!: AdminConsoleJobResponseDto[];
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class AdminConsoleJobDetailResponseDto extends AdminConsoleJobResponseDto {
  @ApiProperty({ nullable: true }) salaryMin!: number | null;
  @ApiProperty({ nullable: true }) salaryMax!: number | null;
  @ApiProperty({ type: [String] }) skills!: string[];
  @ApiProperty({ format: 'date-time', nullable: true }) deactivatedAt!: string | null;
  @ApiProperty({ enum: JobDeactivationReason, nullable: true })
  deactivationReason!: JobDeactivationReason | null;
  @ApiProperty() updatedAt!: string;
}

export class AdminConsoleDeactivateJobDto {
  @ApiProperty({ enum: JobDeactivationReason })
  @IsEnum(JobDeactivationReason)
  reason!: JobDeactivationReason;
}

export class AdminConsoleDeactivateJobResponseDto {
  @ApiProperty() jobId!: string;
  @ApiProperty({ enum: [JobStatus.deactivated] })
  status!: JobStatus;
  @ApiProperty({ format: 'date-time' }) deactivatedAt!: string;
  @ApiProperty({ enum: JobDeactivationReason })
  reason!: JobDeactivationReason;
}

export class AdminConsoleResumeFailuresQueryDto extends CursorQueryDto {}

export class AdminConsoleResumeFailureResponseDto {
  @ApiProperty() resumeId!: string;
  @ApiProperty({ enum: ['failed'] }) status!: 'failed';
  @ApiProperty({ enum: ['processing_failed'] }) failureCategory!: 'processing_failed';
  @ApiProperty({ nullable: true }) mimeType!: string | null;
  @ApiProperty() executionCount!: number;
  @ApiProperty({ nullable: true }) lastAttempt!: number | null;
  @ApiProperty({ nullable: true }) lastAttemptAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() failedAt!: string;
}

export class AdminConsoleResumeFailuresResponseDto {
  @ApiProperty({ type: () => [AdminConsoleResumeFailureResponseDto] }) failures!: AdminConsoleResumeFailureResponseDto[];
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class AdminConsoleBetaGateResponseDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() registrationCount!: number;
  @ApiProperty() capacity!: number;
  @ApiProperty() remainingSlots!: number;
  @ApiProperty({ enum: ['disabled', 'open', 'full'] }) status!: 'disabled' | 'open' | 'full';
  @ApiProperty() updatedAt!: string;
}

export class AdminConsoleNotificationsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;
}

export class AdminConsoleNotificationFailureResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiProperty({ enum: [NotificationStatus.failed] }) status!: NotificationStatus;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) sentAt!: string | null;
}

export class AdminConsoleNotificationsResponseDto {
  @ApiProperty() period!: { from: string; to: string };
  @ApiProperty() rollup!: { total: number; pending: number; sent: number; failed: number; read: number };
  @ApiProperty({ type: () => [AdminConsoleNotificationFailureResponseDto] }) failures!: AdminConsoleNotificationFailureResponseDto[];
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class AdminConsoleApplicationsQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  createdTo?: string;
}

export class AdminConsoleApplicationsResponseDto {
  @ApiProperty() period!: { from: string; to: string };
  @ApiProperty() total!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    enum: Object.values(ApplicationStatus),
  })
  byStatus!: Record<ApplicationStatus, number>;
}
