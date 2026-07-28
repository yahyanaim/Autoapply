import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../../../shared/observability/request-context.service';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';

@Injectable()
export class PartnerApiClient {
  private readonly logger = new Logger(PartnerApiClient.name);
  private readonly allowedHosts = new Set([
    'boards-api.greenhouse.io',
    'api.lever.co',
    'api.ashbyhq.com',
  ]);
  private readonly circuits = new Map<
    string,
    { failures: number; openUntil: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async fetch(urlValue: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !this.allowedHosts.has(url.hostname)) {
      throw new BadRequestException('Partner API URL is not allow-listed');
    }

    const state = this.circuits.get(url.hostname) ?? {
      failures: 0,
      openUntil: 0,
    };
    this.circuits.set(url.hostname, state);
    if (state.openUntil > this.clock.nowMs()) {
      throw new ServiceUnavailableException(
        `Partner API circuit is open for ${url.hostname}`,
      );
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal:
          init.signal ??
          AbortSignal.timeout(
            Number(this.configService.get('PARTNER_API_TIMEOUT_MS', 15_000)),
          ),
      });
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      state.failures = 0;
      state.openUntil = 0;
      return response;
    } catch (error) {
      state.failures += 1;
      if (
        state.failures >=
        Number(
          this.configService.get(
            'PARTNER_API_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
            3,
          ),
        )
      ) {
        state.openUntil =
          this.clock.nowMs() +
          Number(
            this.configService.get(
              'PARTNER_API_CIRCUIT_BREAKER_RESET_MS',
              30_000,
            ),
          );
      }
      this.logger.warn(
        JSON.stringify({
          event: 'partner_api_failed',
          requestId: this.requestContext.getRequestId(),
          userId: this.requestContext.getUserId(),
          host: url.hostname,
          failures: state.failures,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }
}
