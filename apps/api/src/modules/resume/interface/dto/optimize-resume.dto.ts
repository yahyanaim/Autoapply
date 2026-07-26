import { Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OptimizeResumeDto {
  @ApiProperty({ description: 'Job ID to optimize against' })
  @Matches(/^c[a-z0-9]{8,63}$/)
  jobId!: string;
}
