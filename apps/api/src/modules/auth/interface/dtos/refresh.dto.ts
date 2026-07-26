import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
