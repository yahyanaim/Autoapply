import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveApplicationDto {
  @ApiPropertyOptional({
    description:
      'Confirms wording that the truthfulness check could not verify automatically',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmQuestionableClaims?: boolean;
}
