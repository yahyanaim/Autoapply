import {
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; sid: string; iat: number; exp: number }) {
    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid access token');
    }

    const now = this.clock.now();
    const idleTimeoutMinutes = Number(
      this.configService.get('SESSION_IDLE_TIMEOUT_MINUTES', 15),
    );
    const active = await this.prisma.session.updateMany({
      where: {
        id: payload.sid,
        userId: payload.sub,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        lastUsedAt: {
          gt: new Date(now.getTime() - idleTimeoutMinutes * 60_000),
        },
      },
      data: { lastUsedAt: now },
    });
    if (active.count !== 1) {
      throw new UnauthorizedException('Session is no longer active');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is no longer active');
    }

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
      mfaVerified: Boolean(session.mfaVerifiedAt),
    };
  }
}
