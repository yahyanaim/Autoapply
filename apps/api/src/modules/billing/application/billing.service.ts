import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { Prisma, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeAdapter: StripeAdapter,
  ) {}

  async createCheckoutSession(userId: string, plan: SubscriptionPlan) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const existingPaid = await this.prisma.subscription.findFirst({
      where: {
        userId,
        plan: { in: [SubscriptionPlan.pro, SubscriptionPlan.premium] },
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing, SubscriptionStatus.past_due] },
      },
    });
    if (existingPaid) {
      throw new BadRequestException('Manage your existing subscription in the billing portal');
    }

    const session = await this.stripeAdapter.createCheckoutSession(
      userId,
      user.email,
      plan,
    );
    return { sessionId: session.id, url: session.url };
  }

  async createPortalSession(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, stripeSubscriptionId: { not: null } },
    });
    if (!subscription) throw new NotFoundException('No active subscription found');

    const session = await this.stripeAdapter.createPortalSession(
      subscription.stripeSubscriptionId!,
    );
    return { url: session.url };
  }

  async handleWebhook(event: Stripe.Event) {
    const processed = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
      select: { id: true },
    });
    if (processed) return { received: true, duplicate: true };

    const currentSubscription = await this.loadCurrentStripeSubscription(event);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.stripeWebhookEvent.create({
          data: { eventId: event.id, type: event.type },
        });
        await this.processWebhook(transaction, event, currentSubscription);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.stripeWebhookEvent.findUnique({
          where: { eventId: event.id },
          select: { id: true },
        });
        if (duplicate) return { received: true, duplicate: true };
      }
      throw error;
    }
    return { received: true };
  }

  private async processWebhook(
    transaction: Prisma.TransactionClient,
    event: Stripe.Event,
    currentSubscription?: Stripe.Subscription,
  ) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) throw new BadRequestException('Missing userId in session metadata');

        const plan = session.metadata?.plan as SubscriptionPlan | undefined;
        if (plan !== SubscriptionPlan.pro && plan !== SubscriptionPlan.premium) {
          throw new BadRequestException('Invalid plan in session metadata');
        }
        const stripeSubscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
        if (!stripeSubscriptionId) {
          throw new BadRequestException('Checkout session has no subscription');
        }
        if (!currentSubscription || currentSubscription.id !== stripeSubscriptionId) {
          throw new BadRequestException('Checkout subscription could not be verified');
        }
        const { status, effectivePlan } = this.subscriptionEntitlement(
          currentSubscription,
          plan,
        );
        const updated = await transaction.subscription.updateMany({
          where: { userId },
          data: {
            plan: effectivePlan,
            status,
            stripeSubscriptionId,
            cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
            currentPeriodStart: new Date(currentSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(currentSubscription.current_period_end * 1000),
          },
        });
        if (updated.count !== 1) throw new BadRequestException('User subscription record not found');
        await this.updatePlanLimits(transaction, userId, effectivePlan);
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
        if (!stripeSubscriptionId) break;
        const subscription = await transaction.subscription.findFirst({
          where: { stripeSubscriptionId },
        });
        if (subscription) {
          const stripePaymentId = typeof invoice.payment_intent === 'string'
            ? invoice.payment_intent
            : invoice.id;
          await transaction.payment.upsert({
            where: { stripePaymentId },
            create: {
              subscriptionId: subscription.id,
              amount:
                event.type === 'invoice.payment_succeeded'
                  ? invoice.amount_paid
                  : invoice.amount_due,
              currency: invoice.currency,
              status:
                event.type === 'invoice.payment_succeeded'
                  ? 'succeeded'
                  : 'failed',
              stripePaymentId,
              invoiceUrl: invoice.hosted_invoice_url,
            },
            update: {
              amount:
                event.type === 'invoice.payment_succeeded'
                  ? invoice.amount_paid
                  : invoice.amount_due,
              currency: invoice.currency,
              status:
                event.type === 'invoice.payment_succeeded'
                  ? 'succeeded'
                  : 'failed',
              invoiceUrl: invoice.hosted_invoice_url,
            },
          });
          if (currentSubscription) {
            const { status, effectivePlan } = this.subscriptionEntitlement(
              currentSubscription,
              subscription.plan,
            );
            await transaction.subscription.updateMany({
              where: { id: subscription.id },
              data: {
                status,
                plan: effectivePlan,
                cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
                currentPeriodStart: new Date(currentSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(currentSubscription.current_period_end * 1000),
              },
            });
            await this.updatePlanLimits(transaction, subscription.userId, effectivePlan);
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const eventSubscription = event.data.object as Stripe.Subscription;
        const sub = currentSubscription ?? eventSubscription;
        const existing = await transaction.subscription.findFirst({
          where: { stripeSubscriptionId: eventSubscription.id },
        });
        const { status, effectivePlan } = this.subscriptionEntitlement(
          sub,
          existing?.plan,
        );
        await transaction.subscription.updateMany({
          where: { stripeSubscriptionId: eventSubscription.id },
          data: {
            status,
            plan: effectivePlan,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        if (existing) {
          await this.updatePlanLimits(transaction, existing.userId, effectivePlan);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const existing = await transaction.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        await transaction.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: SubscriptionStatus.canceled, plan: SubscriptionPlan.free },
        });
        if (existing) {
          await this.updatePlanLimits(transaction, existing.userId, SubscriptionPlan.free);
        }
        break;
      }
    }
  }

  private async loadCurrentStripeSubscription(
    event: Stripe.Event,
  ): Promise<Stripe.Subscription | undefined> {
    let subscriptionId: string | undefined;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    } else if (
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment_failed'
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
    } else if (event.type === 'customer.subscription.updated') {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (event.type === 'customer.subscription.deleted') {
      return event.data.object as Stripe.Subscription;
    }
    return subscriptionId
      ? this.stripeAdapter.retrieveSubscription(subscriptionId)
      : undefined;
  }

  private subscriptionEntitlement(
    subscription: Stripe.Subscription,
    fallbackPlan?: SubscriptionPlan,
  ): { status: SubscriptionStatus; effectivePlan: SubscriptionPlan } {
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: SubscriptionStatus.active,
      trialing: SubscriptionStatus.trialing,
      past_due: SubscriptionStatus.past_due,
      incomplete: SubscriptionStatus.incomplete,
      incomplete_expired: SubscriptionStatus.incomplete_expired,
      canceled: SubscriptionStatus.canceled,
      unpaid: SubscriptionStatus.unpaid,
      paused: SubscriptionStatus.paused,
    };
    const status = statusMap[subscription.status];
    const metadataPlan = subscription.metadata.plan as SubscriptionPlan | undefined;
    const configuredPlan =
      metadataPlan === SubscriptionPlan.pro ||
      metadataPlan === SubscriptionPlan.premium
        ? metadataPlan
        : fallbackPlan ?? SubscriptionPlan.free;
    const entitled =
      status === SubscriptionStatus.active ||
      status === SubscriptionStatus.trialing ||
      status === SubscriptionStatus.past_due;
    return {
      status,
      effectivePlan: entitled ? configuredPlan : SubscriptionPlan.free,
    };
  }

  private async updatePlanLimits(
    transaction: Prisma.TransactionClient,
    userId: string,
    plan: SubscriptionPlan,
  ) {
    const limits = {
      [SubscriptionPlan.free]: {
        applicationsMax: 10,
        aiRequestsMax: 50,
        resumesMax: 1,
        storageBytesMax: 5 * 1024 * 1024,
      },
      [SubscriptionPlan.pro]: {
        applicationsMax: 2_147_483_647,
        aiRequestsMax: 500,
        resumesMax: 5,
        storageBytesMax: 25 * 1024 * 1024,
      },
      [SubscriptionPlan.premium]: {
        applicationsMax: 2_147_483_647,
        aiRequestsMax: 2_147_483_647,
        resumesMax: 2_147_483_647,
        storageBytesMax: 2_147_483_647,
      },
    }[plan];
    await transaction.usageLimit.updateMany({ where: { userId }, data: limits });
  }

  async getSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!subscription) throw new NotFoundException('No subscription found');
    return subscription;
  }
}
