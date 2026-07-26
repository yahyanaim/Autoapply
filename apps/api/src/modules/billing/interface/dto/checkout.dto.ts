import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';

export class CheckoutDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsIn([SubscriptionPlan.pro, SubscriptionPlan.premium])
  plan!: 'pro' | 'premium';
}
