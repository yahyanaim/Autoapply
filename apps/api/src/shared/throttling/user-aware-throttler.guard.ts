import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

export interface RateLimitRequest {
  user?: { id?: string };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(request: RateLimitRequest): Promise<string> {
    if (request.user?.id) return `user:${request.user.id}`;

    const authorization = request.headers?.authorization;
    const header = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(
          match[1],
        );
        if (typeof payload.sub === 'string' && payload.sub.length > 0) {
          return `user:${payload.sub}`;
        }
      } catch {
        // Invalid or expired tokens are treated as unauthenticated traffic.
      }
    }

    const address = request.ip || request.socket?.remoteAddress || 'unknown';
    return `ip:${address}`;
  }
}
