import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { UserService } from '../application/user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrivacyConsentDto } from './dto/privacy-consent.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import type { Response } from 'express';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    if (userId !== id) {
      throw new ForbiddenException('You can only view your own account');
    }
    return this.userService.getProfile(id);
  }

  @Put(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    if (userId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.userService.updateProfile(userId, dto);
  }

  @Post('me/consent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record explicit data-processing consent' })
  async recordConsent(
    @CurrentUser('id') userId: string,
    @Body() _dto: PrivacyConsentDto,
  ) {
    return this.userService.recordDataProcessingConsent(userId);
  }

  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export all personal account data' })
  async exportData(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="applyai-data-export.json"',
    );
    return this.userService.exportData(userId);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete the current account and stored files' })
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() _dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.deleteAccount(userId);
    response.clearCookie('applyai_refresh', { path: '/auth' });
    return { message: 'Account and personal data deleted' };
  }
}
