import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/interface/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/interface/decorators/current-user.decorator';
import { ResumeService } from '../application/resume.service';
import { OptimizeResumeDto } from './dto/optimize-resume.dto';
import { AIService } from '../../ai/application/ai.service';
import { Throttle } from '@nestjs/throttler';
import { SubscriptionPlan } from '@prisma/client';
import { RequiresPlan } from '../../billing/interface/plan-entitlement.decorator';
import { PlanEntitlementGuard } from '../../billing/interface/guards/plan-entitlement.guard';
import { GeneratedResumePdfService } from '../infrastructure/pdf/generated-resume-pdf.service';

const resumeUploadLimits = {
  fileSize: 5 * 1024 * 1024,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 100,
  fieldNestingDepth: 5,
};

@ApiTags('resumes')
@Controller('resumes')
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly aiService: AIService,
    private readonly generatedResumePdf: GeneratedResumePdfService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: resumeUploadLimits }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a resume' })
  @ApiResponse({ status: 201, description: 'Resume uploaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.resumeService.upload(userId, file);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all resumes' })
  @ApiResponse({ status: 200, description: 'Resumes retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@CurrentUser('id') userId: string) {
    return this.resumeService.listResumes(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a resume by ID' })
  @ApiResponse({ status: 200, description: 'Resume retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Resume not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.resumeService.getResume(userId, id);
  }

  @Get(':id/versions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List generated versions of a resume' })
  @ApiResponse({ status: 200, description: 'Resume versions retrieved successfully' })
  async listVersions(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.resumeService.listVersions(userId, id);
  }

  @Get(':id/versions/:versionId/pdf')
  @Throttle({ default: { limit: 30, ttl: 60 * 1_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download a generated CV as an ATS-friendly PDF' })
  @ApiResponse({ status: 200, description: 'Generated CV PDF' })
  @ApiResponse({ status: 404, description: 'Generated CV not found' })
  async downloadGeneratedPdf(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ): Promise<StreamableFile> {
    const generated = await this.resumeService.getGeneratedResumeVersion(
      userId,
      id,
      versionId,
    );
    const pdf = await this.generatedResumePdf.render(generated.document);
    const filename = `${safeFilename(generated.document.contact.fullName)}-cv.pdf`;
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: pdf.length,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a resume' })
  @ApiResponse({ status: 200, description: 'Resume deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Resume not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.resumeService.deleteResume(userId, id);
  }

  @Post(':id/optimize')
  @UseGuards(JwtAuthGuard, PlanEntitlementGuard)
  @RequiresPlan(SubscriptionPlan.pro, 'Resume optimization')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Optimize a resume for a job' })
  @ApiResponse({ status: 200, description: 'Resume optimized successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Resume not found' })
  async optimize(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: OptimizeResumeDto,
  ) {
    return this.aiService.optimizeResume(userId, id, dto.jobId);
  }
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return cleaned || 'applyai-optimized';
}
