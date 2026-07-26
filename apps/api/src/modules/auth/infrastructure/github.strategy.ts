import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../application/auth.service';
import { OAuthProvider } from '@prisma/client';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GITHUB_CALLBACK_URL'),
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const email = await this.getVerifiedEmail(accessToken);

    return this.authService.validateOAuthUser({
      email,
      provider: OAuthProvider.github,
      providerId: profile.id.toString(),
      accessToken,
      refreshToken,
    });
  }

  private async getVerifiedEmail(accessToken: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch('https://api.github.com/user/emails', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'ApplyAI',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new UnauthorizedException('GitHub email verification failed');
    }

    if (!response.ok) {
      throw new UnauthorizedException('GitHub email verification failed');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UnauthorizedException('GitHub returned an invalid email response');
    }
    if (!Array.isArray(payload)) {
      throw new UnauthorizedException('GitHub returned an invalid email response');
    }

    const emails = payload.filter(
      (candidate): candidate is { email: string; verified: true; primary?: boolean } =>
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof candidate.email === 'string' &&
        candidate.email.trim().length > 0 &&
        candidate.verified === true,
    );
    const email = emails.find((candidate) => candidate.primary === true)?.email ?? emails[0]?.email;
    if (!email) {
      throw new UnauthorizedException('GitHub account has no verified email address');
    }
    return email;
  }
}
