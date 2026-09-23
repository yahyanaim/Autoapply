import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** Empty body: the single-use proof is accepted only via its dedicated header. */
export class AdminConsoleRevokeSessionDto {}

export class AdminConsoleRevokeSessionParamsDto {
  @ApiProperty({ pattern: '^c[a-z0-9]{24}$' })
  @IsString()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'userId must be a valid user identifier',
  })
  userId!: string;

  @ApiProperty({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  })
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'sessionId must be a valid session identifier' },
  )
  sessionId!: string;
}

export class AdminConsoleRevokeSessionResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: ['revoked'] })
  status!: 'revoked';
}

/** Empty body: the single-use proof is accepted only via its dedicated header. */
export class AdminConsoleRevokeAllSessionsDto {}

export class AdminConsoleRevokeAllSessionsResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ minimum: 0 })
  revokedSessionCount!: number;
}
