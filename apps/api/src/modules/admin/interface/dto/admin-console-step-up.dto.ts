import { IsEnum, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AdminConsoleStepUpActionDto {
  suspendUser = 'admin.user.suspend',
  reactivateUser = 'admin.user.reactivate',
  revokeSession = 'admin.session.revoke',
  revokeAllSessions = 'admin.session.revoke_all',
  deactivateJob = 'admin.job.deactivate',
}

export class AdminConsoleStepUpRequestDto {
  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must contain exactly 6 digits' })
  code!: string;

  @ApiProperty({ enum: AdminConsoleStepUpActionDto })
  @IsEnum(AdminConsoleStepUpActionDto)
  action!: AdminConsoleStepUpActionDto;

  @ApiProperty({ enum: ['user', 'session', 'job'] })
  @IsString()
  @Matches(/^(user|session|job)$/, {
    message: 'targetType must be user, session, or job',
  })
  targetType!: 'user' | 'session' | 'job';

  @ApiProperty({
    description: 'Prisma CUID for users/jobs or UUID v4 for sessions',
    oneOf: [
      { pattern: '^c[a-z0-9]{24}$' },
      { pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' },
    ],
  })
  @IsString()
  @Matches(
    /^(?:c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    { message: 'targetId must be a valid target identifier' },
  )
  targetId!: string;
}

export class AdminConsoleStepUpResponseDto {
  @ApiProperty({ description: 'Single-use step-up proof; returned once' })
  proof!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
