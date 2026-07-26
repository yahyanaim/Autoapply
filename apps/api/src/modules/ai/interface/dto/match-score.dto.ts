import { Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatchScoreDto {
  @ApiProperty()
  @Matches(/^c[a-z0-9]{8,63}$/)
  resumeId!: string;

  @ApiProperty()
  @Matches(/^c[a-z0-9]{8,63}$/)
  jobId!: string;
}
