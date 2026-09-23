import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SessionClientType,
  SubscriptionPlan,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { MAX_ADMIN_USERS_PAGE_SIZE } from '../../application/admin-users.service';

export class AdminConsoleUsersQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: MAX_ADMIN_USERS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_USERS_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ maximum: 200 })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\s+/g, ' ')
      : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
}

export class AdminConsoleUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: SubscriptionPlan, nullable: true })
  plan!: SubscriptionPlan | null;

  @ApiProperty()
  isEmailVerified!: boolean;

  @ApiProperty({ nullable: true })
  suspendedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AdminConsoleUsersResponseDto {
  @ApiProperty({ type: () => [AdminConsoleUserResponseDto] })
  users!: AdminConsoleUserResponseDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class AdminConsoleUserSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: MAX_ADMIN_USERS_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ADMIN_USERS_PAGE_SIZE)
  limit?: number;
}

export class AdminConsoleUserSessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SessionClientType })
  clientType!: SessionClientType;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastUsedAt!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;
}

export class AdminConsoleUserSessionsResponseDto {
  @ApiProperty({ type: () => [AdminConsoleUserSessionResponseDto] })
  sessions!: AdminConsoleUserSessionResponseDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
