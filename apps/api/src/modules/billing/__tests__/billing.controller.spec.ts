import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingController } from '../interface/billing.controller';

describe('BillingController webhook handling', () => {
  const billingService = { handleWebhook: jest.fn() };
  const stripeAdapter = { constructWebhookEvent: jest.fn() };
  const controller = new BillingController(
    billingService as never,
    stripeAdapter as never,
  );
  const request = {
    headers: { 'stripe-signature': 'signature' },
    rawBody: Buffer.from('{}'),
  } as unknown as RawBodyRequest<Request>;

  beforeEach(() => {
    jest.clearAllMocks();
    stripeAdapter.constructWebhookEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.created',
      data: { object: {} },
    });
  });

  it('lets processing failures return 5xx so Stripe can retry', async () => {
    const databaseError = new Error('database offline');
    billingService.handleWebhook.mockRejectedValue(databaseError);

    await expect(controller.handleWebhook(request)).rejects.toBe(databaseError);
  });

  it('maps only signature verification failures to a bad request', async () => {
    stripeAdapter.constructWebhookEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(controller.handleWebhook(request)).rejects.toThrow(
      BadRequestException,
    );
    expect(billingService.handleWebhook).not.toHaveBeenCalled();
  });

  it('preserves configuration failures as service unavailable', async () => {
    stripeAdapter.constructWebhookEvent.mockImplementation(() => {
      throw new ServiceUnavailableException('Stripe is not configured');
    });

    await expect(controller.handleWebhook(request)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
