import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';

describe('StripeAdapter pricing integrity', () => {
  const values: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_PRO_PRICE_ID: 'price_pro',
    STRIPE_PREMIUM_PRICE_ID: 'price_premium',
    STRIPE_SUCCESS_URL: 'https://app.example.com/billing?checkout=success',
    STRIPE_CANCEL_URL: 'https://app.example.com/billing?checkout=cancelled',
  };
  let adapter: StripeAdapter;
  let stripe: any;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as unknown as ConfigService;
    adapter = new StripeAdapter(config);
    stripe = {
      prices: { retrieve: jest.fn() },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'cs_1',
            url: 'https://checkout.stripe.com/example',
          }),
        },
      },
    };
    (adapter as unknown as { stripe: unknown }).stripe = stripe;
  });

  it('opens Pro checkout only for an active USD $19 monthly price', async () => {
    stripe.prices.retrieve.mockResolvedValue({
      active: true,
      unit_amount: 1_900,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    await expect(
      adapter.createCheckoutSession('user-1', 'user@example.com', 'pro'),
    ).resolves.toEqual(expect.objectContaining({ id: 'cs_1' }));
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_pro', quantity: 1 }],
      }),
    );
  });

  it('rejects a Stripe price that disagrees with public pricing', async () => {
    stripe.prices.retrieve.mockResolvedValue({
      active: true,
      unit_amount: 2_900,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    await expect(
      adapter.createCheckoutSession('user-1', 'user@example.com', 'pro'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('validates the Premium price as USD $49 monthly', async () => {
    stripe.prices.retrieve.mockResolvedValue({
      active: true,
      unit_amount: 4_900,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    await adapter.createCheckoutSession('user-1', 'user@example.com', 'premium');
    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_premium', quantity: 1 }],
      }),
    );
  });

  it('derives entitlements from the actual subscription price', () => {
    expect(
      adapter.resolveSubscriptionPlan({
        items: {
          data: [{ price: { id: 'price_premium' } }],
        },
      } as never),
    ).toBe('premium');
    expect(
      adapter.resolveSubscriptionPlan({
        items: {
          data: [{ price: { id: 'price_pro' } }],
        },
      } as never),
    ).toBe('pro');
    expect(
      adapter.resolveSubscriptionPlan({
        items: {
          data: [{ price: { id: 'price_unknown' } }],
        },
      } as never),
    ).toBe('free');
  });
});
