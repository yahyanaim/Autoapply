import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CAREER_CHAT_MESSAGE_CHARACTERS } from '../../domain/career-chat-limits';

export class CareerChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ minLength: 1, maxLength: CAREER_CHAT_MESSAGE_CHARACTERS })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(CAREER_CHAT_MESSAGE_CHARACTERS)
  content!: string;
}

export class SendCareerChatMessageDto {
  @ApiProperty({ type: [CareerChatMessageDto], minItems: 1, maxItems: 12 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CareerChatMessageDto)
  messages!: CareerChatMessageDto[];
}
