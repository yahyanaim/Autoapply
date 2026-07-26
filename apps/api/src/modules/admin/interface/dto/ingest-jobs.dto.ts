import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import type { JobSource } from '../../../job/application/job-ingestion.service';

export class IngestJobsDto {
  @ApiProperty({ enum: ['greenhouse', 'lever', 'ashby'] })
  @IsIn(['greenhouse', 'lever', 'ashby'])
  source!: JobSource;

  @ApiProperty({ description: 'Public board token, company slug, or organization slug' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  identifier!: string;
}
