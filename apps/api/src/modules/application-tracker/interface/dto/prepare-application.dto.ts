import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareApplicationDto {
  @ApiProperty()
  @IsString()
  jobId!: string;

  @ApiProperty()
  @IsString()
  resumeId!: string;
}
