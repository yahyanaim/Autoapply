import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

/**
 * Reactivation accepts no body fields. The bound, single-use step-up proof is
 * carried only in X-Admin-Step-Up-Proof, never in the JSON request body.
 */
export class AdminConsoleReactivateUserDto {}

export class AdminConsoleReactivateUserResponseDto {
  @ApiProperty({ description: 'Reactivated user identifier' })
  userId!: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.active })
  status!: UserStatus;
}
