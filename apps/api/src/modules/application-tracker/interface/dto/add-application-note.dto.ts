import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddApplicationNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 2_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  note!: string;
}
