import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsString } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ example: 'DELETE MY ACCOUNT' })
  @IsString()
  @Equals('DELETE MY ACCOUNT', {
    message: 'Type DELETE MY ACCOUNT to confirm permanent deletion',
  })
  confirmation!: string;
}
