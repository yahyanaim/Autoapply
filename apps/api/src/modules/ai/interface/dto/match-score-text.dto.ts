import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatchScoreTextDto {
  @ApiProperty()
  @Matches(/^c[a-z0-9]{8,63}$/)
  resumeId!: string;

  @ApiProperty({ minLength: 20, maxLength: 50_000 })
  @IsString()
  @MinLength(20)
  @MaxLength(50_000)
  jobDescription!: string;
}
