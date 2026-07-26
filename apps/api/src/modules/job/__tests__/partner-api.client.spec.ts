import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PartnerApiClient } from '../infrastructure/sources/partner-api.client';

describe('PartnerApiClient', () => {
  const config = {
    get: jest.fn((key: string, fallback: unknown) =>
      key === 'PARTNER_API_CIRCUIT_BREAKER_FAILURE_THRESHOLD'
        ? 2
        : fallback,
    ),
  };
  const context = {
    getRequestId: jest.fn().mockReturnValue('request-test'),
    getUserId: jest.fn().mockReturnValue('admin-test'),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects non-HTTPS and non-allow-listed destinations before fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const client = new PartnerApiClient(config as never, context as never);

    await expect(
      client.fetch('http://169.254.169.254/latest/meta-data'),
    ).rejects.toThrow(BadRequestException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opens a host circuit after repeated failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('partner outage'));
    const client = new PartnerApiClient(config as never, context as never);

    await expect(
      client.fetch('https://api.lever.co/v0/postings/acme'),
    ).rejects.toThrow('partner outage');
    await expect(
      client.fetch('https://api.lever.co/v0/postings/acme'),
    ).rejects.toThrow('partner outage');
    await expect(
      client.fetch('https://api.lever.co/v0/postings/acme'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
