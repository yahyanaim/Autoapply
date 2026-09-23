import { Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';

/** User IDs are Prisma CUIDs; accepting only this shape prevents arbitrary route input. */
export class AdminConsoleUserIdParamDto {
  @ApiProperty({ pattern: '^c[a-z0-9]{24}$' })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'userId must be a valid user identifier',
  })
  userId!: string;
}

export class AdminConsoleUsageCategoryResponseDto {
  @ApiProperty()
  used!: number;

  @ApiProperty({ nullable: true })
  limit!: number | null;

  @ApiProperty({ nullable: true })
  remaining!: number | null;

  @ApiProperty()
  unlimited!: boolean;
}

export class AdminConsoleUsageResponseDto {
  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  applications!: AdminConsoleUsageCategoryResponseDto;

  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  aiRequests!: AdminConsoleUsageCategoryResponseDto;

  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  resumeOptimizations!: AdminConsoleUsageCategoryResponseDto;

  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  jobDiscoveries!: AdminConsoleUsageCategoryResponseDto;

  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  resumes!: AdminConsoleUsageCategoryResponseDto;

  @ApiProperty({ type: () => AdminConsoleUsageCategoryResponseDto })
  storageBytes!: AdminConsoleUsageCategoryResponseDto;
}

export class AdminConsoleUsageLimitsResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: SubscriptionPlan })
  plan!: SubscriptionPlan;

  @ApiProperty()
  period!: string;

  @ApiProperty()
  resetAt!: string;

  @ApiProperty({ type: () => AdminConsoleUsageResponseDto })
  usage!: AdminConsoleUsageResponseDto;
}
