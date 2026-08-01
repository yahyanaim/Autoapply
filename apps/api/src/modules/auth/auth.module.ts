import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { PasswordService } from './infrastructure/password.service';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { GoogleStrategy } from './infrastructure/google.strategy';
import { GitHubStrategy } from './infrastructure/github.strategy';
import { AuthController } from './interface/auth.controller';
import { RolesGuard } from './interface/guards/roles.guard';
import { MfaService } from './infrastructure/mfa.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import {
  GitHubOAuthGuard,
  GoogleOAuthGuard,
} from './interface/guards/oauth-configured.guard';
import { BillingModule } from '../billing/billing.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    BillingModule,
    NotificationModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    PasswordService,
    MfaService,
    JwtStrategy,
    GoogleOAuthGuard,
    GitHubOAuthGuard,
    {
      provide: GoogleStrategy,
      useFactory: (config: ConfigService, authService: AuthService) =>
        config.get('GOOGLE_CLIENT_ID') &&
        config.get('GOOGLE_CLIENT_SECRET') &&
        config.get('GOOGLE_CALLBACK_URL')
          ? new GoogleStrategy(config, authService)
          : null,
      inject: [ConfigService, AuthService],
    },
    {
      provide: GitHubStrategy,
      useFactory: (config: ConfigService, authService: AuthService) =>
        config.get('GITHUB_CLIENT_ID') &&
        config.get('GITHUB_CLIENT_SECRET') &&
        config.get('GITHUB_CALLBACK_URL')
          ? new GitHubStrategy(config, authService)
          : null,
      inject: [ConfigService, AuthService],
    },
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
