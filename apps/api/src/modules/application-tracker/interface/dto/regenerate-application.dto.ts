import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RegenerationTarget {
  resume = 'resume',
  cover_letter = 'cover_letter',
  all = 'all',
}

export class RegenerateApplicationDto {
  @ApiProperty({ enum: RegenerationTarget })
  @IsEnum(RegenerationTarget)
  target!: RegenerationTarget;
}
