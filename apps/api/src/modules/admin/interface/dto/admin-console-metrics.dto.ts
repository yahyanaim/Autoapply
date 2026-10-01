import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const UTC_DAY_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export class AdminConsoleMetricsQueryDto {
  @ApiProperty({
    example: '2026-09-01',
    pattern: UTC_DAY_PATTERN,
    description: 'Inclusive UTC calendar day',
  })
  @Matches(new RegExp(UTC_DAY_PATTERN))
  from!: string;

  @ApiProperty({
    example: '2026-09-30',
    pattern: UTC_DAY_PATTERN,
    description: 'Inclusive UTC calendar day; maximum range is 90 days',
  })
  @Matches(new RegExp(UTC_DAY_PATTERN))
  to!: string;
}

class AdminConsoleMetricsPeriodDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ enum: ['UTC'] }) timeZone!: 'UTC';
  @ApiProperty({ example: 90 }) maximumDays!: number;
}

class AdminConsoleActivePaidByPlanDto {
  @ApiProperty() pro!: number;
  @ApiProperty() premium!: number;
}

class AdminConsoleBillingMovementTotalsDto {
  @ApiProperty() newPaidSubscriptions!: number;
  @ApiProperty() expansionMrrMinor!: number;
  @ApiProperty() contractionMrrMinor!: number;
  @ApiProperty() churnCount!: number;
  @ApiProperty() churnedMrrMinor!: number;
  @ApiProperty() reactivationCount!: number;
}

class AdminConsoleBillingMetricsDayDto extends AdminConsoleBillingMovementTotalsDto {
  @ApiProperty({ example: '2026-09-26' }) day!: string;
  @ApiProperty({ enum: ['complete', 'partial'] })
  coverage!: 'complete' | 'partial';
  @ApiProperty() activePaidSubscriptions!: number;
  @ApiProperty({ type: AdminConsoleActivePaidByPlanDto })
  activePaidSubscriptionsByPlan!: AdminConsoleActivePaidByPlanDto;
  @ApiProperty({ description: 'End-of-day monthly recurring revenue in USD cents' })
  monthlyRecurringRevenueMinor!: number;
}

class AdminConsoleBillingCoveredRangeDto {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) toExclusive!: string;
}

class AdminConsoleBillingHistoryDto {
  @ApiProperty({
    format: 'date-time',
    description: 'No subscription transition history exists before this time',
  })
  historyAvailableFrom!: string;
  @ApiProperty() requestedRangeStartsBeforeHistory!: boolean;
  @ApiProperty({
    type: AdminConsoleBillingCoveredRangeDto,
    nullable: true,
  })
  actualCoveredRange!: AdminConsoleBillingCoveredRangeDto | null;
  @ApiProperty({
    type: AdminConsoleBillingMovementTotalsDto,
    nullable: true,
  })
  totals!: AdminConsoleBillingMovementTotalsDto | null;
  @ApiProperty({ type: () => [AdminConsoleBillingMetricsDayDto] })
  daily!: AdminConsoleBillingMetricsDayDto[];
}

class AdminConsoleBillingMetricsDto {
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiProperty({ enum: ['usd'] }) currency!: 'usd';
  @ApiProperty() activePaidSubscriptions!: number;
  @ApiProperty({ type: AdminConsoleActivePaidByPlanDto })
  activePaidSubscriptionsByPlan!: AdminConsoleActivePaidByPlanDto;
  @ApiProperty({ description: 'Current monthly recurring revenue in USD cents' })
  monthlyRecurringRevenueMinor!: number;
  @ApiProperty({ type: AdminConsoleBillingHistoryDto })
  history!: AdminConsoleBillingHistoryDto;
}

class AdminConsoleAiMetricsDayDto {
  @ApiProperty({ example: '2026-09-01' }) day!: string;
  @ApiProperty() requestCount!: number;
  @ApiProperty() costedRequestCount!: number;
  @ApiProperty({ description: 'Recorded estimated operational cost in USD' })
  estimatedCostUsd!: number;
}

class AdminConsoleAiMetricsDto {
  @ApiProperty({ enum: ['estimated'] }) costType!: 'estimated';
  @ApiProperty({ enum: ['usd'] }) currency!: 'usd';
  @ApiProperty() requestCount!: number;
  @ApiProperty() costedRequestCount!: number;
  @ApiProperty({ description: 'Recorded estimated operational cost in USD' })
  estimatedCostUsd!: number;
  @ApiProperty({ type: () => [AdminConsoleAiMetricsDayDto] })
  daily!: AdminConsoleAiMetricsDayDto[];
}

export class AdminConsoleMetricsResponseDto {
  @ApiProperty({ type: AdminConsoleMetricsPeriodDto })
  period!: AdminConsoleMetricsPeriodDto;
  @ApiProperty({ type: AdminConsoleBillingMetricsDto })
  billing!: AdminConsoleBillingMetricsDto;
  @ApiProperty({ type: AdminConsoleAiMetricsDto })
  ai!: AdminConsoleAiMetricsDto;
}
