import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty()
  @IsString()
  jobId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resumeVersionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverLetterId?: string;
}
