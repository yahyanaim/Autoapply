import { UnauthorizedException } from '@nestjs/common';
import { GitHubStrategy } from '../infrastructure/github.strategy';
import { GoogleStrategy } from '../infrastructure/google.strategy';

const config = {
  getOrThrow: (key: string) => `${key.toLowerCase()}-test-value`,
};

describe('OAuth strategies', () => {
  const authService = { validateOAuthUser: jest.fn() };

  beforeEach(() => {
    jest.restoreAllMocks();
    authService.validateOAuthUser.mockReset().mockResolvedValue({ accessToken: 'token' });
  });

  it('accepts only a Google-verified email address', async () => {
    const strategy = new GoogleStrategy(config as never, authService as never);

    await strategy.validate('access', 'refresh', {
      id: 'google-user',
      emails: [
        { value: 'unverified@example.com', verified: false },
        { value: 'verified@example.com', verified: true },
      ],
    } as never);

    expect(authService.validateOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'verified@example.com' }),
    );
  });

  it('rejects a Google profile without a verified email', async () => {
    const strategy = new GoogleStrategy(config as never, authService as never);

    await expect(
      strategy.validate('access', 'refresh', {
        id: 'google-user',
        emails: [{ value: 'unverified@example.com', verified: false }],
      } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.validateOAuthUser).not.toHaveBeenCalled();
  });

  it('loads the primary verified GitHub email from the authenticated API', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { email: 'secondary@example.com', verified: true, primary: false },
          { email: 'primary@example.com', verified: true, primary: true },
        ]),
        { status: 200 },
      ),
    );
    const strategy = new GitHubStrategy(config as never, authService as never);

    await strategy.validate('github-access', 'refresh', { id: 'github-user' } as never);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer github-access' }),
      }),
    );
    expect(authService.validateOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'primary@example.com' }),
    );
  });

  it('rejects a GitHub account without a verified email', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([{ email: 'unverified@example.com', verified: false, primary: true }]),
        { status: 200 },
      ),
    );
    const strategy = new GitHubStrategy(config as never, authService as never);

    await expect(
      strategy.validate('github-access', 'refresh', { id: 'github-user' } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.validateOAuthUser).not.toHaveBeenCalled();
  });
});
