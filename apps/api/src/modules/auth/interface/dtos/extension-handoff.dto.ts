import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ExtensionHandoffExchangeDto {
  @ApiProperty({
    description: 'Short-lived, single-use extension handoff code',
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  code!: string;
}
