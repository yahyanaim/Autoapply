import {
  Controller,
  Delete,
  Headers,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { ApplicationTrackerService } from '../application/application-tracker.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { AddApplicationNoteDto } from './dto/add-application-note.dto';
import { PrepareApplicationDto } from './dto/prepare-application.dto';
import { RegenerateApplicationDto } from './dto/regenerate-application.dto';
import { UpdateApplicationMaterialsDto } from './dto/update-materials.dto';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { PlanEntitlementGuard } from '../../billing/interface/guards/plan-entitlement.guard';
import { RequiresPlan } from '../../billing/interface/plan-entitlement.decorator';
import { SubscriptionPlan } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { requireIdempotencyKey } from '../../../shared/idempotency/idempotency-key';

@ApiTags('applications')
@Controller('applications')
export class ApplicationTrackerController {
  constructor(
    private readonly trackerService: ApplicationTrackerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('prepare')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @UseGuards(JwtAuthGuard, PlanEntitlementGuard)
  @RequiresPlan(SubscriptionPlan.pro, 'Unified application preparation')
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Analyze a job and prepare one reviewable application package',
  })
  async prepare(
    @CurrentUser('id') userId: string,
    @Body() dto: PrepareApplicationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.trackerService.prepare(
      userId,
      dto.jobId,
      dto.resumeId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get('approved-package')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an approved package for a job URL' })
  async approvedPackage(
    @CurrentUser('id') userId: string,
    @Query('sourceUrl') sourceUrl: string,
  ) {
    return this.trackerService.getApprovedPackageBySourceUrl(userId, sourceUrl);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new application' })
  @ApiResponse({ status: 201, description: 'Application created' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApplicationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.trackerService.create(
      userId,
      dto.jobId,
      dto.resumeVersionId,
      dto.coverLetterId,
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user applications' })
  @ApiResponse({ status: 200, description: 'Applications retrieved' })
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListApplicationsDto,
  ) {
    return this.trackerService.list(userId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get application-tracking quota usage' })
  @ApiResponse({ status: 200, description: 'Application quota retrieved' })
  async getUsage(@CurrentUser('id') userId: string) {
    return this.trackerService.getUsage(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get an application' })
  @ApiResponse({ status: 200, description: 'Application retrieved' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.trackerService.get(userId, id);
  }

  @Post(':id/regenerate')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @UseGuards(JwtAuthGuard, PlanEntitlementGuard)
  @RequiresPlan(SubscriptionPlan.pro, 'Application-material regeneration')
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate part or all of an application package' })
  async regenerate(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RegenerateApplicationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute({
      userId,
      key: requireIdempotencyKey(idempotencyKey),
      operation: 'applications.regenerate',
      payload: { applicationId: id, target: dto.target },
      handler: () => this.trackerService.regenerate(userId, id, dto.target),
    });
  }

  @Patch(':id/materials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit the reviewable CV and cover letter' })
  async updateMaterials(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationMaterialsDto,
  ) {
    return this.trackerService.updateMaterials(userId, id, dto);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an application package for extension use' })
  async approve(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveApplicationDto = new ApproveApplicationDto(),
  ) {
    return this.trackerService.approve(
      userId,
      id,
      dto.confirmQuestionableClaims ?? false,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update application status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.trackerService.updateStatus(userId, id, dto.status);
  }

  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get application timeline' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getTimeline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.trackerService.getTimeline(userId, id);
  }

  @Post(':id/notes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a note to an application timeline' })
  @ApiResponse({ status: 200, description: 'Note added' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async addNote(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddApplicationNoteDto,
  ) {
    return this.trackerService.addNote(userId, id, dto.note.trim());
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tracked application' })
  @ApiResponse({ status: 200, description: 'Application deleted' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.trackerService.delete(userId, id);
  }
}
