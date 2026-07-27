import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '../application/billing.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StripeAdapter } from '../infrastructure/stripe/stripe.adapter';
import { NotFoundException } from '@nestjs/common';

describe('BillingService', () => {
  let service: BillingService;
  let prismaMock: any;
  let stripeMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      subscription: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      payment: { create: jest.fn(), upsert: jest.fn() },
      usageLimit: { updateMany: jest.fn() },
      stripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (transaction: any) => unknown) =>
        callback(prismaMock),
      ),
    };
    stripeMock = {
      createCheckoutSession: jest.fn(),
      createPortalSession: jest.fn(),
      retrieveSubscription: jest.fn(),
      resolveSubscriptionPlan: jest.fn((subscription: any) => {
        const plan = subscription.metadata?.plan;
        return plan === 'pro' || plan === 'premium' ? plan : 'free';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StripeAdapter, useValue: stripeMock },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
      });
      stripeMock.createCheckoutSession.mockResolvedValue({
        id: 'cs_1',
        url: 'https://checkout.stripe.com/test',
      });
      const result = await service.createCheckoutSession('u1', 'pro');
      expect(result).toHaveProperty('sessionId', 'cs_1');
      expect(result).toHaveProperty('url');
    });

    it('should throw NotFoundException if user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(
        service.createCheckoutSession('u1', 'pro'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPortalSession', () => {
    it('should create portal session', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 's1',
        stripeSubscriptionId: 'sub_123',
      });
      stripeMock.createPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.com/test',
      });
      const result = await service.createPortalSession('u1');
      expect(result).toHaveProperty('url');
    });

    it('should throw NotFoundException if no subscription', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);
      await expect(service.createPortalSession('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSubscription', () => {
    it('should return subscription', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 's1',
        plan: 'pro',
        payments: [],
      });
      const result = await service.getSubscription('u1');
      expect(result).toHaveProperty('plan', 'pro');
    });

    it('should throw NotFoundException if no subscription', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);
      await expect(service.getSubscription('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleWebhook', () => {
    const period = {
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
      cancel_at_period_end: false,
    };

    it('does not grant paid limits for an incomplete checkout subscription', async () => {
      prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
      stripeMock.retrieveSubscription.mockResolvedValue({
        id: 'sub_1',
        status: 'incomplete',
        metadata: { plan: 'pro' },
        ...period,
      });

      await service.handleWebhook({
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: {
          object: {
            subscription: 'sub_1',
            metadata: { userId: 'u1', plan: 'pro' },
          },
        },
      } as never);

      expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: expect.objectContaining({ plan: 'free', status: 'incomplete' }),
      });
      expect(prismaMock.usageLimit.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          aiRequestsMax: 50,
          jobDiscoveriesMax: 3,
          resumesMax: 1,
        }),
      });
    });

    it('uses current Stripe state when an older active update arrives after cancellation', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'local_sub',
        userId: 'u1',
        plan: 'pro',
      });
      stripeMock.retrieveSubscription.mockResolvedValue({
        id: 'sub_1',
        status: 'canceled',
        metadata: { plan: 'pro' },
        ...period,
      });

      await service.handleWebhook({
        id: 'evt_old_update',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            status: 'active',
            metadata: { plan: 'pro' },
            ...period,
          },
        },
      } as never);

      expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_1' },
        data: expect.objectContaining({ plan: 'free', status: 'canceled' }),
      });
    });

    it('uses the actual Stripe price-derived plan after a portal change', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'local_sub',
        userId: 'u1',
        plan: 'pro',
      });
      stripeMock.resolveSubscriptionPlan.mockReturnValue('premium');
      stripeMock.retrieveSubscription.mockResolvedValue({
        id: 'sub_1',
        status: 'active',
        metadata: { plan: 'pro' },
        ...period,
      });

      await service.handleWebhook({
        id: 'evt_portal_upgrade',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            status: 'active',
            metadata: { plan: 'pro' },
            ...period,
          },
        },
      } as never);

      expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_1' },
        data: expect.objectContaining({ plan: 'premium', status: 'active' }),
      });
      expect(prismaMock.usageLimit.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          jobDiscoveriesMax: 2_147_483_647,
        }),
      });
    });

    it('returns duplicate events before making another Stripe API call', async () => {
      prismaMock.stripeWebhookEvent.findUnique.mockResolvedValue({ id: 'ledger_1' });

      await expect(
        service.handleWebhook({ id: 'evt_seen', type: 'customer.created' } as never),
      ).resolves.toEqual({ received: true, duplicate: true });
      expect(stripeMock.retrieveSubscription).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
