import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from '../interface/auth.controller';

describe('AuthController client trust boundary', () => {
  const authentication = {
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    user: { id: 'user_1', email: 'person@example.com', role: 'user' },
  };
  const authService = {
    login: jest.fn(),
    logoutByRefreshToken: jest.fn(),
    exchangeExtensionHandoff: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'EXTENSION_ID') return 'trusted-extension-id';
      if (key === 'NODE_ENV') return 'test';
      return fallback;
    }),
  };
  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
  const controller = new AuthController(authService as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    authService.login.mockResolvedValue(authentication);
    authService.exchangeExtensionHandoff.mockResolvedValue(authentication);
  });

  it('never exposes a refresh token to a normal browser client', async () => {
    const result = await controller.login(
      { email: 'person@example.com', password: 'password' },
      undefined,
      'https://app.example.com',
      response,
    );

    expect(result).toEqual({
      accessToken: 'access_token',
      user: authentication.user,
    });
    expect(response.cookie).toHaveBeenCalledWith(
      'applyai_refresh',
      'refresh_token',
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
  });

  it('rejects password login from the extension', async () => {
    await expect(controller.login(
      { email: 'person@example.com', password: 'Password123!@' },
      'extension',
      'chrome-extension://trusted-extension-id',
      response,
    )).rejects.toThrow('Use the dashboard extension handoff');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('returns rotating tokens only when a trusted extension exchanges a handoff', async () => {
    const result = await controller.exchangeExtensionHandoff(
      { code: 'a'.repeat(43) },
      'extension',
      'chrome-extension://trusted-extension-id',
      { headers: {}, ip: '127.0.0.1' } as never,
    );

    expect(result).toEqual(authentication);
    expect(authService.exchangeExtensionHandoff).toHaveBeenCalledWith(
      'a'.repeat(43),
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
  });

  it('rejects a spoofed extension client before creating a session', async () => {
    await expect(
      controller.login(
        { email: 'person@example.com', password: 'password' },
        'extension',
        'https://app.example.com',
        response,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('logs out safely when the browser sends only its refresh cookie', async () => {
    await expect(
      controller.logout(
        undefined as never,
        { cookies: { applyai_refresh: 'cookie_token' } } as never,
        response,
      ),
    ).resolves.toEqual({ message: 'Logged out successfully' });
    expect(authService.logoutByRefreshToken).toHaveBeenCalledWith('cookie_token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'applyai_refresh',
      { path: '/auth' },
    );
  });
});
