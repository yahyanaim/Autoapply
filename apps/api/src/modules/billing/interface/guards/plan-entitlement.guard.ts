import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import {
  PLAN_ENTITLEMENT_KEY,
  PlanEntitlementRequirement,
} from '../plan-entitlement.decorator';

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.free]: 0,
  [SubscriptionPlan.pro]: 1,
  [SubscriptionPlan.premium]: 2,
};

const ENTITLED_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trialing,
  SubscriptionStatus.past_due,
]);

@Injectable()
export class PlanEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PlanEntitlementRequirement>(
      PLAN_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id?: string };
    }>();
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication is required');

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });
    const effectivePlan =
      subscription && ENTITLED_STATUSES.has(subscription.status)
        ? subscription.plan
        : SubscriptionPlan.free;

    if (PLAN_RANK[effectivePlan] < PLAN_RANK[requirement.minimumPlan]) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_UPGRADE_REQUIRED',
        feature: requirement.feature,
        currentPlan: effectivePlan,
        requiredPlan: requirement.minimumPlan,
        message: `${requirement.feature} requires the ${requirement.minimumPlan} plan`,
      });
    }
    return true;
  }
}
