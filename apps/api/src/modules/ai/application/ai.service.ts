import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AIProviderFactory } from '../infrastructure/providers/provider.factory';
import { PromptService } from './prompt.service';
import { calculateMatchScore } from '../domain/match-score';
import { detectFabrications } from '../domain/fabrication-detector';
import { scoreGenericness } from '../domain/genericness-detector';
import { AIRequestFeature, Prisma, ResumeParseStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { SystemClock } from '../../../shared/adapters/system-clock.adapter';
import {
  buildGeneratedResumeDocument,
  generatedResumeToText,
  GeneratedResumeDocument,
  GeneratedResumeValidationError,
  verifiedResumeToText,
} from '../../resume/domain/generated-resume';
import {
  JobAnalysis,
  JobAnalysisValidationError,
  readJobAnalysis,
} from '../domain/job-analysis';

@Injectable()
export class AIService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: AIProviderFactory,
    private readonly promptService: PromptService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async complete(
    feature: AIRequestFeature,
    userId: string,
    params: Record<string, unknown>,
  ): Promise<{ content: string; model: string }> {
    const promptId = this.getPromptId(feature);
    const template = this.promptService.loadTemplate(promptId);

    const systemPrompt = this.extractSystemPrompt(template);
    const userPrompt = this.extractUserPrompt(template);
    this.assertRequestBudget(systemPrompt, userPrompt, params);

    const consentingUser = await this.prisma.user.findFirst({
      where: { id: userId, dataProcessingConsentAt: { not: null } },
      select: { id: true },
    });
    if (!consentingUser) {
      throw new ForbiddenException(
        'Data-processing consent is required before using AI features',
      );
    }

    const usageResetAt = await this.reserveUsage(userId);

    try {
      const startTime = this.clock.nowMs();
      const completion = await this.providerFactory.completeWithFallback(
        { id: promptId, version: promptId.split('.').pop() ?? 'unknown', systemPrompt, userPrompt },
        params,
      );
      const response = completion.response;
      const latencyMs = this.clock.nowMs() - startTime;

      const inputHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(params))
        .digest('hex');

      const totalTokens = response.tokensUsed.input + response.tokensUsed.output;
      const cost = this.calculateCost(response.tokensUsed.input, response.tokensUsed.output);

      await this.prisma.aIRequest.create({
        data: {
          userId,
          feature,
          provider: completion.providerName,
          model: response.model,
          promptVersion: promptId.split('.').pop() ?? 'unknown',
          tokensUsed: totalTokens,
          cost,
          latencyMs,
          inputHash,
        },
      });

      return { content: response.content, model: response.model };
    } catch (error) {
      await this.prisma.usageLimit.updateMany({
        where: { userId, resetAt: usageResetAt, aiRequestsUsed: { gt: 0 } },
        data: { aiRequestsUsed: { decrement: 1 } },
      });
      throw error;
    }
  }

  private async reserveUsage(userId: string): Promise<Date> {
    return this.prisma.$transaction(async (transaction) => {
      const now = this.clock.now();
      await transaction.usageLimit.updateMany({
        where: { userId, resetAt: { lt: now } },
        data: {
          aiRequestsUsed: 0,
          applicationsUsed: 0,
          jobDiscoveriesUsed: 0,
          resetAt: this.getNextResetDate(),
        },
      });
      const usage = await transaction.usageLimit.findUnique({ where: { userId } });
      if (!usage) throw new NotFoundException('Usage limit not found for user');
      const reserved = await transaction.usageLimit.updateMany({
        where: { userId, aiRequestsUsed: { lt: usage.aiRequestsMax } },
        data: { aiRequestsUsed: { increment: 1 } },
      });
      if (reserved.count !== 1) {
        throw new ForbiddenException('AI request limit reached');
      }
      return usage.resetAt;
    });
  }

  async matchScore(userId: string, resumeId: string, jobId: string) {
    const resume = await this.getOwnedResume(userId, resumeId);

    const job = await this.prisma.job.findFirst({
      where: this.accessibleJobWhere(userId, jobId),
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const resumeContent = JSON.stringify(resume.parsedJson ?? {});
    const jobDescription = job.description ?? '';

    const result = calculateMatchScore(
      { content: resumeContent },
      jobDescription,
    );

    return {
      score: result.score,
      missingKeywords: result.missingKeywords,
      weakSections: result.weakSections,
      explanation: result.explanation,
    };
  }

  async matchScoreText(userId: string, resumeId: string, jobDescription: string) {
    const resume = await this.getOwnedResume(userId, resumeId);
    const result = calculateMatchScore(
      { content: JSON.stringify(resume.parsedJson ?? {}) },
      jobDescription,
    );

    return {
      score: result.score,
      missingKeywords: result.missingKeywords,
      weakSections: result.weakSections,
      explanation: result.explanation,
    };
  }

  async analyzeJob(userId: string, jobId: string): Promise<JobAnalysis> {
    const job = await this.prisma.job.findFirst({
      where: this.accessibleJobWhere(userId, jobId),
      include: { company: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (!job.description?.trim()) {
      throw new BadRequestException('The job does not contain a description to analyze');
    }

    const { content } = await this.complete(
      AIRequestFeature.job_analyze,
      userId,
      {
        jobTitle: job.title,
        companyName: job.company?.name ?? 'Company not listed',
        jobDescription: job.description,
      },
    );
    try {
      return readJobAnalysis(this.parseObjectResponse(content));
    } catch (error) {
      if (error instanceof JobAnalysisValidationError) {
        throw new BadGatewayException(
          `AI provider returned an invalid job analysis: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async optimizeResume(
    userId: string,
    resumeId: string,
    jobId: string,
    jobAnalysis?: JobAnalysis,
  ) {
    const resume = await this.getOwnedResume(userId, resumeId);

    const job = await this.prisma.job.findFirst({
      where: this.accessibleJobWhere(userId, jobId),
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const resumeContent = JSON.stringify(resume.parsedJson ?? {});
    const jobDescription = job.description ?? '';

    const { content: aiContent } = await this.complete(
      AIRequestFeature.resume_optimize,
      userId,
      {
        resume: resumeContent,
        jobDescription,
        jobAnalysis: JSON.stringify(jobAnalysis ?? {}),
      },
    );

    const optimizedPayload = this.parseObjectResponse(aiContent);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        profile: {
          select: {
            fullName: true,
            phone: true,
            location: true,
            linkedInUrl: true,
            portfolioUrl: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    let generatedDocument: GeneratedResumeDocument;
    try {
      generatedDocument = buildGeneratedResumeDocument(
        resume.parsedJson,
        optimizedPayload,
        {
          fullName: user.profile?.fullName,
          email: user.email,
          phone: user.profile?.phone,
          location: user.profile?.location,
          linkedInUrl: user.profile?.linkedInUrl,
          portfolioUrl: user.profile?.portfolioUrl,
        },
      );
    } catch (error) {
      if (error instanceof GeneratedResumeValidationError) {
        throw new BadGatewayException(
          `AI provider returned an invalid resume optimization: ${error.message}`,
        );
      }
      throw error;
    }
    const optimizedText = generatedResumeToText(generatedDocument, false);
    const verifiedResumeText = verifiedResumeToText(resume.parsedJson);

    const fabrications = detectFabrications(
      { content: `${resumeContent}\n${verifiedResumeText}` },
      { content: optimizedText },
    );
    if (fabrications.length > 0) {
      throw new BadGatewayException('AI output failed fabrication safety validation');
    }

    const matchResult = calculateMatchScore(
      { content: optimizedText },
      jobDescription,
    );

    const version = await this.prisma.resumeVersion.create({
      data: {
        resumeId,
        jobId,
        optimizedText,
        documentJson: generatedDocument as unknown as Prisma.InputJsonValue,
        matchScore: matchResult.score,
        missingKeywords: matchResult.missingKeywords,
        weakSections: matchResult.weakSections,
      },
    });

    return {
      versionId: version.id,
      optimizedText,
      matchScore: matchResult.score,
      missingKeywords: matchResult.missingKeywords,
      weakSections: matchResult.weakSections,
      fabrications,
      document: generatedDocument,
    };
  }

  async generateCoverLetter(
    userId: string,
    jobId: string,
    resumeId: string,
    tone?: string,
    resumeVersionId?: string,
    jobAnalysis?: JobAnalysis,
  ) {
    const resume = await this.getOwnedResume(userId, resumeId);

    const job = await this.prisma.job.findFirst({
      where: this.accessibleJobWhere(userId, jobId),
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    let resumeContent = JSON.stringify(resume.parsedJson ?? {});
    if (resumeVersionId) {
      const version = await this.prisma.resumeVersion.findFirst({
        where: {
          id: resumeVersionId,
          resumeId,
          jobId,
          resume: { userId },
        },
        select: { documentJson: true },
      });
      if (!version?.documentJson) {
        throw new NotFoundException(
          'Optimized resume version for this job was not found',
        );
      }
      const generated = version.documentJson as Record<string, unknown>;
      const { contact: _privateContact, ...resumeWithoutContact } = generated;
      resumeContent = JSON.stringify(resumeWithoutContact);
    }
    const jobDescription = job.description ?? '';

    const { content: aiContent } = await this.complete(
      AIRequestFeature.cover_letter,
      userId,
      {
        resume: resumeContent,
        jobDescription,
        jobAnalysis: JSON.stringify(jobAnalysis ?? {}),
        tone: tone ?? 'professional',
      },
    );

    const coverLetterPayload = this.parseObjectResponse(aiContent);
    const coverLetterContent = coverLetterPayload.coverLetter;
    if (typeof coverLetterContent !== 'string' || coverLetterContent.trim() === '') {
      throw new BadGatewayException('AI provider returned an invalid cover letter');
    }
    const genericness = scoreGenericness(coverLetterContent);
    if (genericness.score >= 50) {
      throw new BadGatewayException(
        'AI provider returned a generic cover letter; regenerate for more specificity',
      );
    }

    const coverLetter = await this.prisma.coverLetter.create({
      data: {
        userId,
        jobId,
        resumeVersionId,
        content: coverLetterContent,
        tone,
      },
    });

    return { ...coverLetter, genericnessScore: genericness.score };
  }

  async getCostSummary(userId: string, startDate: Date, endDate: Date) {
    const requests = await this.prisma.aIRequest.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalCost = requests.reduce((sum, req) => sum + (req.cost ?? 0), 0);
    const totalTokens = requests.reduce(
      (sum, req) => sum + (req.tokensUsed ?? 0),
      0,
    );

    const byFeature: Record<string, { count: number; cost: number; tokens: number }> = {};
    for (const req of requests) {
      const feature = req.feature;
      if (!byFeature[feature]) {
        byFeature[feature] = { count: 0, cost: 0, tokens: 0 };
      }
      byFeature[feature].count++;
      byFeature[feature].cost += req.cost ?? 0;
      byFeature[feature].tokens += req.tokensUsed ?? 0;
    }

    return {
      totalRequests: requests.length,
      totalCost,
      totalTokens,
      byFeature,
      startDate,
      endDate,
    };
  }

  private getPromptId(feature: AIRequestFeature): string {
    const mapping: Record<AIRequestFeature, string> = {
      [AIRequestFeature.resume_optimize]: 'resume-optimize.v2',
      [AIRequestFeature.job_analyze]: 'job-analyze.v1',
      [AIRequestFeature.match_score]: 'match-score.v2',
      [AIRequestFeature.cover_letter]: 'cover-letter.v2',
      [AIRequestFeature.interview_coach]: 'interview-coach.v1',
      [AIRequestFeature.career_advisor]: 'career-advisor.v1',
      [AIRequestFeature.recruiter_chat]: 'recruiter-chat.v1',
      [AIRequestFeature.resume_parse]: 'resume-parse.v1',
    };
    return mapping[feature] ?? `${feature}.v1`;
  }

  private parseObjectResponse(content: string): Record<string, unknown> {
    const trimmed = content.trim();
    const json = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : trimmed;
    try {
      const parsed: unknown = JSON.parse(json);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // The normalized provider response is validated below.
    }
    throw new BadGatewayException('AI provider returned invalid JSON');
  }

  private extractSystemPrompt(template: string): string {
    const inputStart = this.findInputStart(template);
    return (inputStart >= 0 ? template.slice(0, inputStart) : template).trim();
  }

  private extractUserPrompt(template: string): string {
    const inputStart = this.findInputStart(template);
    return inputStart >= 0 ? template.slice(inputStart).trim() : template;
  }

  private findInputStart(template: string): number {
    const markers = [
      '\n## Candidate Resume',
      '\n## Original Resume',
      '\n## Resume',
      '\nResume text:',
    ];
    const indexes = markers.map((marker) => template.indexOf(marker)).filter((index) => index >= 0);
    return indexes.length ? Math.min(...indexes) : -1;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputPerMillion = this.providerFactory.getInputCostPerMillion();
    const outputPerMillion = this.providerFactory.getOutputCostPerMillion();
    return (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000;
  }

  private assertRequestBudget(
    systemPrompt: string,
    userPrompt: string,
    params: Record<string, unknown>,
  ): void {
    const renderedUserPrompt = userPrompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
      params[key] !== undefined ? String(params[key]) : `{{${key}}}`,
    );
    const inputBytes = Buffer.byteLength(systemPrompt) + Buffer.byteLength(renderedUserPrompt);
    if (inputBytes > this.providerFactory.getMaxInputBytes()) {
      throw new PayloadTooLargeException('AI request input exceeds the configured limit');
    }

    // Byte count is a deliberately conservative upper bound for tokenizer output.
    const projectedCost = this.calculateCost(
      inputBytes,
      this.providerFactory.getMaxOutputTokens(),
    );
    if (projectedCost > this.providerFactory.getMaxRequestCost()) {
      throw new BadRequestException('AI request exceeds the configured cost ceiling');
    }
  }

  private getNextResetDate(): Date {
    const now = this.clock.now();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  private accessibleJobWhere(
    userId: string,
    jobId: string,
  ): Prisma.JobWhereInput {
    return {
      id: jobId,
      OR: [{ capturedByUserId: null }, { capturedByUserId: userId }],
    };
  }

  private async getOwnedResume(userId: string, resumeId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    if (
      resume.parseStatus !== ResumeParseStatus.ready ||
      resume.parsedJson === null
    ) {
      throw new BadRequestException('Resume parsing is not complete');
    }
    return resume;
  }
}
