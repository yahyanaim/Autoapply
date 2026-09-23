import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

/**
 * The reason is deliberately a small, allow-listed operational note. It is
 * passed only to the Auth-owned suspension command and is never echoed by the
 * Admin Console response or audit snapshot.
 */
export class AdminConsoleSuspendUserDto {
  @ApiProperty({
    description: 'Allow-listed operational suspension reason',
    example: 'Policy violation',
    minLength: 1,
    maxLength: 500,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 .,:;!?()'/-]{0,499}$/, {
    message: 'reason contains unsupported characters',
  })
  reason!: string;
}

export class AdminConsoleSuspendUserResponseDto {
  @ApiProperty({ description: 'Suspended user identifier' })
  userId!: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.suspended })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  suspendedAt!: string;
}
