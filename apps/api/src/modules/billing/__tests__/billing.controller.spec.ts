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
  const verifiedWebhooks = { beginVerified: jest.fn(), fail: jest.fn() };
  const controller = new BillingController(
    billingService as never,
    stripeAdapter as never,
    verifiedWebhooks as never,
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
    verifiedWebhooks.beginVerified.mockResolvedValue(null);
    verifiedWebhooks.fail.mockResolvedValue(undefined);
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
    expect(verifiedWebhooks.beginVerified).not.toHaveBeenCalled();
  });

  it('captures only verified relevant deliveries and classifies a processing failure safely', async () => {
    const event = { id: 'evt_fake', type: 'invoice.payment_succeeded', data: { object: {} } };
    stripeAdapter.constructWebhookEvent.mockReturnValue(event);
    verifiedWebhooks.beginVerified.mockResolvedValue({ id: 'local_delivery1' });
    const failure = new Error('synthetic private provider detail');
    billingService.handleWebhook.mockRejectedValue(failure);
    await expect(controller.handleWebhook(request)).rejects.toBe(failure);
    expect(verifiedWebhooks.beginVerified).toHaveBeenCalledWith(event);
    expect(verifiedWebhooks.fail).toHaveBeenCalledWith('local_delivery1', 'evt_fake', failure);
  });

  it('preserves the original processing error when failure capture rejects', async () => {
    const event = { id: 'evt_fake', type: 'invoice.payment_succeeded', data: { object: {} } };
    stripeAdapter.constructWebhookEvent.mockReturnValue(event);
    verifiedWebhooks.beginVerified.mockResolvedValue({ id: 'local_delivery1' });
    const processingError = new Error('synthetic processing failure');
    billingService.handleWebhook.mockRejectedValue(processingError);
    verifiedWebhooks.fail.mockRejectedValue(new Error('synthetic capture-store failure'));

    await expect(controller.handleWebhook(request)).rejects.toBe(processingError);
    expect(verifiedWebhooks.fail).toHaveBeenCalledWith('local_delivery1', 'evt_fake', processingError);
    expect(billingService.handleWebhook).toHaveBeenCalledWith(event, 'local_delivery1');
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
