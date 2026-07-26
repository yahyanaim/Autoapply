import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { ProfileService } from '../application/profile.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile upserted successfully' })
  async upsertProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpsertProfileDto,
  ) {
    return this.profileService.upsertProfile(userId, dto);
  }

}
