import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionPlan } from '@prisma/client';
import { PLAN_PRICING } from '../../domain/plan-pricing';

@Injectable()
export class StripeAdapter {
  private stripe?: Stripe;

  constructor(private readonly configService: ConfigService) {}

  async createCheckoutSession(
    userId: string,
    email: string,
    plan: SubscriptionPlan,
  ) {
    const priceMap: Record<'pro' | 'premium', string> = {
      pro: this.configService.get('STRIPE_PRO_PRICE_ID', ''),
      premium: this.configService.get('STRIPE_PREMIUM_PRICE_ID', ''),
    };
    if (plan !== SubscriptionPlan.pro && plan !== SubscriptionPlan.premium) {
      throw new ServiceUnavailableException('Selected subscription plan is not purchasable');
    }
    const price = priceMap[plan];
    if (!price) throw new ServiceUnavailableException('Stripe price is not configured');
    await this.assertConfiguredPrice(plan, price);

    return this.getClient().checkout.sessions.create({
      customer_email: email,
      mode: 'subscription',
      line_items: [
        { price, quantity: 1 },
      ],
      metadata: { userId, plan },
      subscription_data: { metadata: { userId, plan } },
      success_url: this.configService.get(
        'STRIPE_SUCCESS_URL',
        'http://localhost:3000/billing?checkout=success',
      ),
      cancel_url: this.configService.get(
        'STRIPE_CANCEL_URL',
        'http://localhost:3000/billing?checkout=cancelled',
      ),
    });
  }

  private async assertConfiguredPrice(
    plan: 'pro' | 'premium',
    priceId: string,
  ) {
    const price = await this.getClient().prices.retrieve(priceId);
    const expected = PLAN_PRICING[plan];
    if (
      !price.active ||
      price.unit_amount !== expected.unitAmount ||
      price.currency.toLowerCase() !== expected.currency ||
      price.recurring?.interval !== expected.interval ||
      price.recurring.interval_count !== expected.intervalCount
    ) {
      throw new ServiceUnavailableException(
        `Stripe ${plan} price must be an active USD ${(
          expected.unitAmount / 100
        ).toFixed(0)}/month recurring price`,
      );
    }
  }

  async createPortalSession(stripeSubscriptionId: string) {
    const subscription = await this.retrieveSubscription(stripeSubscriptionId);
    return this.getClient().billingPortal.sessions.create({
      customer: subscription.customer as string,
      return_url: this.configService.get('DASHBOARD_URL', 'http://localhost:3000') + '/billing',
    });
  }

  async retrieveSubscription(stripeSubscriptionId: string) {
    return this.getClient().subscriptions.retrieve(stripeSubscriptionId);
  }

  async retrieveDispute(stripeDisputeId: string): Promise<Stripe.Dispute> {
    return this.getClient().disputes.retrieve(stripeDisputeId);
  }

  async retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
    return this.getClient().paymentIntents.retrieve(id);
  }

  async retrieveCharge(id: string): Promise<Stripe.Charge> {
    return this.getClient().charges.retrieve(id);
  }

  async retrieveRefund(id: string): Promise<Stripe.Refund> {
    return this.getClient().refunds.retrieve(id);
  }

  async retrieveBalanceTransaction(id: string): Promise<Stripe.BalanceTransaction> {
    return this.getClient().balanceTransactions.retrieve(id);
  }

  async retrieveEvent(id: string): Promise<Stripe.Event> {
    return this.getClient().events.retrieve(id);
  }

  /** Provider payloads never leave this adapter's comparison boundary. */
  async listFinancialEvents(input: {
    fromSeconds: number;
    throughSeconds: number;
    types: string[];
    startingAfter?: string;
    limit: number;
  }): Promise<{
    events: Array<{ id: string; type: string; created: number; currency: string | null }>;
    hasMore: boolean;
  }> {
    const page = await this.getClient().events.list({
      created: { gte: input.fromSeconds, lte: input.throughSeconds },
      types: input.types,
      limit: input.limit,
      ...(input.startingAfter ? { starting_after: input.startingAfter } : {}),
    });
    return {
      events: page.data.map((event) => {
        const object = event.data.object as unknown as Record<string, unknown>;
        return {
          id: event.id,
          type: event.type,
          created: event.created,
          currency: typeof object.currency === 'string' ? object.currency : null,
        };
      }),
      hasMore: page.has_more,
    };
  }

  resolveSubscriptionPlan(
    subscription: Stripe.Subscription,
  ): SubscriptionPlan {
    const priceIds = new Set(
      subscription.items.data.map((item) => item.price.id),
    );
    const proPriceId = this.configService.get<string>(
      'STRIPE_PRO_PRICE_ID',
      '',
    );
    const premiumPriceId = this.configService.get<string>(
      'STRIPE_PREMIUM_PRICE_ID',
      '',
    );
    if (premiumPriceId && priceIds.has(premiumPriceId)) {
      return SubscriptionPlan.premium;
    }
    if (proPriceId && priceIds.has(proPriceId)) {
      return SubscriptionPlan.pro;
    }
    return SubscriptionPlan.free;
  }

  async cancelSubscription(stripeSubscriptionId: string) {
    return this.getClient().subscriptions.cancel(stripeSubscriptionId);
  }

  constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
      '',
    );
    if (!webhookSecret) throw new ServiceUnavailableException('Stripe webhook is not configured');
    return this.getClient().webhooks.constructEvent(body, signature, webhookSecret);
  }

  private getClient(): Stripe {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!key) throw new ServiceUnavailableException('Stripe is not configured');
    this.stripe ??= new Stripe(key, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    });
    return this.stripe;
  }
}
