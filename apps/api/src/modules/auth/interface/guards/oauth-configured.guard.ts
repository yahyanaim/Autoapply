import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, IAuthModuleOptions } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';

type OAuthProviderName = 'google' | 'github';
type OAuthRequest = Request & { applyAiOAuthState?: string };

function stateCookieOptions(provider: OAuthProviderName, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: `/auth/${provider}/callback`,
    maxAge: 10 * 60 * 1_000,
  };
}

function prepareOAuthState(
  context: ExecutionContext,
  config: ConfigService,
  provider: OAuthProviderName,
): void {
  const request = context.switchToHttp().getRequest<OAuthRequest>();
  const response = context.switchToHttp().getResponse<Response>();
  const secure = config.get('NODE_ENV') === 'production';
  const callback =
    request.path.endsWith('/callback') ||
    typeof request.query.code === 'string' ||
    typeof request.query.error === 'string';

  if (!callback) {
    const state = randomBytes(32).toString('base64url');
    request.applyAiOAuthState = state;
    response.cookie(
      `applyai_oauth_${provider}`,
      state,
      stateCookieOptions(provider, secure),
    );
    return;
  }

  const state = request.query.state;
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new UnauthorizedException('Invalid OAuth state');
  }

  const cookieName = `applyai_oauth_${provider}`;
  const valid = request.cookies?.[cookieName] === state;
  response.clearCookie(cookieName, stateCookieOptions(provider, secure));
  if (!valid) throw new UnauthorizedException('Invalid OAuth state');
}

function authenticateOptions(context: ExecutionContext): IAuthModuleOptions | undefined {
  const state = context.switchToHttp().getRequest<OAuthRequest>().applyAiOAuthState;
  return state ? { state } : undefined;
}

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (
      !this.configService.get('GOOGLE_CLIENT_ID') ||
      !this.configService.get('GOOGLE_CLIENT_SECRET') ||
      !this.configService.get('GOOGLE_CALLBACK_URL')
    ) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
    prepareOAuthState(context, this.configService, 'google');
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions | undefined {
    return authenticateOptions(context);
  }
}

@Injectable()
export class GitHubOAuthGuard extends AuthGuard('github') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (
      !this.configService.get('GITHUB_CLIENT_ID') ||
      !this.configService.get('GITHUB_CLIENT_SECRET') ||
      !this.configService.get('GITHUB_CALLBACK_URL')
    ) {
      throw new ServiceUnavailableException('GitHub OAuth is not configured');
    }
    prepareOAuthState(context, this.configService, 'github');
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions | undefined {
    return authenticateOptions(context);
  }
}
