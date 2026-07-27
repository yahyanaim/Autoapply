import {
  Controller,
  Delete,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  Headers,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../application/auth.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshDto } from './dtos/refresh.dto';
import { ExtensionHandoffExchangeDto } from './dtos/extension-handoff.dto';
import { MfaCodeDto } from './dtos/mfa-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  GitHubOAuthGuard,
  GoogleOAuthGuard,
} from './guards/oauth-configured.guard';
import { SubscriptionPlan } from '@prisma/client';
import { RequiresPlan } from '../../billing/interface/plan-entitlement.decorator';
import { PlanEntitlementGuard } from '../../billing/interface/guards/plan-entitlement.guard';

interface AuthenticationResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: unknown };
}

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
export class AuthController {
  private readonly refreshCookieName = 'applyai_refresh';

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('x-applyai-client') client: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: Request,
  ) {
    this.assertTrustedExtensionClient(client, origin);
    const result = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.fullName,
      registerDto.acceptDataProcessing,
      this.sessionMetadata(request),
    );
    return this.finishAuthentication(result, response, client, origin);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Headers('x-applyai-client') client: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: Request,
  ) {
    this.assertTrustedExtensionClient(client, origin);
    if (client === 'extension') {
      throw new BadRequestException('Use the dashboard extension handoff to sign in');
    }
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      this.sessionMetadata(request),
      loginDto.mfaCode,
    );
    return this.finishAuthentication(result, response, client, origin);
  }

  @Post('mfa/setup')
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin authenticator-app MFA enrollment' })
  async beginMfaSetup(@CurrentUser('id') userId: string) {
    return this.authService.beginMfaSetup(userId);
  }

  @Post('mfa/confirm')
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm and enable authenticator-app MFA' })
  async confirmMfaSetup(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string,
    @Body() dto: MfaCodeDto,
  ) {
    return this.authService.confirmMfaSetup(userId, sessionId, dto.code);
  }

  @Post('extension/handoff')
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard, PlanEntitlementGuard)
  @RequiresPlan(SubscriptionPlan.pro, 'Chrome extension connection')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a short-lived extension sign-in handoff' })
  async createExtensionHandoff(@CurrentUser('id') userId: string) {
    return this.authService.createExtensionHandoff(userId);
  }

  @Post('extension/exchange')
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a one-time dashboard handoff for extension tokens' })
  async exchangeExtensionHandoff(
    @Body() dto: ExtensionHandoffExchangeDto,
    @Headers('x-applyai-client') client: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
  ) {
    this.assertTrustedExtensionClient(client, origin);
    if (client !== 'extension') {
      throw new BadRequestException('Extension client header is required');
    }
    return this.authService.exchangeExtensionHandoff(
      dto.code,
      this.sessionMetadata(request),
    );
  }

  @Post('refresh')
  @Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Req() request: Request,
    @Headers('x-applyai-client') client: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedExtensionClient(client, origin);
    const token = refreshDto?.refreshToken || request.cookies?.[this.refreshCookieName];
    if (!token) throw new UnauthorizedException('Refresh token is required');

    const result = await this.authService.refreshToken(token);
    return this.finishAuthentication(result, response, client, origin);
  }

  @Post('logout')
  @Throttle({ default: { limit: 1_000, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body() refreshDto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(this.refreshCookieName, { path: '/auth' });
    const token = refreshDto?.refreshToken || request.cookies?.[this.refreshCookieName];
    if (token) await this.authService.logoutByRefreshToken(token);
    return { message: 'Logged out successfully' };
  }

  @Get('profile')
  @Throttle({ default: { limit: 1_000, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Get('sessions')
  @Throttle({ default: { limit: 1_000, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions' })
  async listSessions(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
  ) {
    return this.authService.listSessions(userId, currentSessionId);
  }

  @Delete('sessions/others')
  @Throttle({ default: { limit: 1_000, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session except the current session' })
  async revokeOtherSessions(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
  ) {
    const revoked = await this.authService.revokeOtherSessions(userId, currentSessionId);
    return { message: 'Other sessions revoked', revoked };
  }

  @Delete('sessions/:id')
  @Throttle({ default: { limit: 1_000, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an active session' })
  async revokeSession(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentSessionId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeSession(userId, sessionId);
    if (sessionId === currentSessionId) {
      response.clearCookie(this.refreshCookieName, { path: '/auth' });
    }
    return { message: 'Session revoked' };
  }

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({ status: 200, description: 'Google OAuth successful' })
  async googleAuthCallback(@Req() req: Request, @Res() response: Response) {
    this.finishAuthentication(this.getAuthenticationResult(req.user), response);
    return response.redirect(
      `${this.configService.get('DASHBOARD_URL', 'http://localhost:3000')}/auth/callback`,
    );
  }

  @Get('github')
  @UseGuards(GitHubOAuthGuard)
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  async githubAuth() {}

  @Get('github/callback')
  @UseGuards(GitHubOAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({ status: 200, description: 'GitHub OAuth successful' })
  async githubAuthCallback(@Req() req: Request, @Res() response: Response) {
    this.finishAuthentication(this.getAuthenticationResult(req.user), response);
    return response.redirect(
      `${this.configService.get('DASHBOARD_URL', 'http://localhost:3000')}/auth/callback`,
    );
  }

  private finishAuthentication<T extends AuthenticationResult>(
    result: T,
    response: Response,
    client?: string,
    origin?: string,
  ) {
    this.assertTrustedExtensionClient(client, origin);
    const isExtension = client === 'extension';

    if (!isExtension) {
      const maxAge = Number(this.configService.get('REFRESH_TOKEN_TTL_DAYS', 7)) * 86_400_000;
      response.cookie(this.refreshCookieName, result.refreshToken, {
        httpOnly: true,
        secure: this.configService.get('NODE_ENV') === 'production',
        sameSite: 'lax',
        path: '/auth',
        maxAge,
      });
    }

    const { refreshToken, ...safeResult } = result;
    return isExtension ? { ...safeResult, refreshToken } : safeResult;
  }

  private assertTrustedExtensionClient(client?: string, origin?: string): void {
    if (client !== 'extension') return;
    const extensionId = this.configService.get<string>('EXTENSION_ID');
    if (!extensionId || origin !== `chrome-extension://${extensionId}`) {
      throw new BadRequestException('Untrusted extension client');
    }
  }

  private getAuthenticationResult(value: unknown): AuthenticationResult {
    if (!value || typeof value !== 'object') {
      throw new UnauthorizedException('OAuth authentication failed');
    }
    const result = value as Partial<AuthenticationResult>;
    if (
      typeof result.accessToken !== 'string' ||
      typeof result.refreshToken !== 'string' ||
      !result.user ||
      typeof result.user.id !== 'string' ||
      typeof result.user.email !== 'string'
    ) {
      throw new UnauthorizedException('OAuth authentication failed');
    }
    return result as AuthenticationResult;
  }

  private sessionMetadata(request?: Request) {
    if (!request) return undefined;
    const userAgent = request.headers['user-agent'];
    return {
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress: request.ip,
    };
  }
}
