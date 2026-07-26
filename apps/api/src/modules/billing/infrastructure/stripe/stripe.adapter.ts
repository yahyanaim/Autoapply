import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionPlan } from '@prisma/client';

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
