import { IsIn, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CoverLetterDto {
  @ApiProperty()
  @Matches(/^c[a-z0-9]{8,63}$/)
  jobId!: string;

  @ApiProperty()
  @Matches(/^c[a-z0-9]{8,63}$/)
  resumeId!: string;

  @ApiPropertyOptional({
    example: 'professional',
    enum: ['professional', 'confident', 'formal', 'enthusiastic', 'conversational'],
  })
  @IsOptional()
  @IsIn(['professional', 'confident', 'formal', 'enthusiastic', 'conversational'])
  tone?: string;
}
