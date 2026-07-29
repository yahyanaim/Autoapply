import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CareerChatService } from '../application/career-chat.service';
import { SendCareerChatMessageDto } from './dto/send-career-chat-message.dto';

@ApiTags('career-chat')
@Controller('career-chat')
@Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
export class CareerChatController {
  constructor(private readonly careerChat: CareerChatService) {}

  @Post('messages')
  @ApiOperation({
    summary: 'Ask the independent Dahl-powered assistant about careers in Morocco',
  })
  @ApiResponse({ status: 201, description: 'Career answer generated' })
  @ApiResponse({ status: 429, description: 'Independent chat limit reached' })
  async answer(@Body() dto: SendCareerChatMessageDto) {
    return this.careerChat.answer(dto.messages);
  }
}
