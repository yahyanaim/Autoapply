import { ApiProperty } from '@nestjs/swagger';
import { QuotaGrantCategory, QuotaGrantReason } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, Matches, Max, Min } from 'class-validator';

export class AdminConsoleQuotaGrantDto {
  @ApiProperty({ enum: QuotaGrantCategory })
  @IsEnum(QuotaGrantCategory)
  category!: QuotaGrantCategory;

  @ApiProperty({ minimum: 1, maximum: 2_000_000_000 })
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;

  @ApiProperty({ format: 'date-time', example: '2026-10-31T23:59:59.000Z' })
  @IsISO8601({ strict: true })
  @Matches(/Z$/, { message: 'expiresAt must be an explicit UTC timestamp' })
  expiresAt!: string;

  @ApiProperty({ enum: QuotaGrantReason })
  @IsEnum(QuotaGrantReason)
  reason!: QuotaGrantReason;
}

export class AdminConsoleQuotaGrantResponseDto {
  @ApiProperty() grantId!: string;
  @ApiProperty() targetUserId!: string;
  @ApiProperty({ enum: QuotaGrantCategory }) category!: QuotaGrantCategory;
  @ApiProperty() amount!: number;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ enum: ['active', 'expired'] }) status!: 'active' | 'expired';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true }) effectiveLimit!: number | null;
  @ApiProperty({ nullable: true }) remaining!: number | null;
}
