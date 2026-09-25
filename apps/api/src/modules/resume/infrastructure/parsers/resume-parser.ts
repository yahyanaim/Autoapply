import { Injectable } from '@nestjs/common';
import { AIRequestFeature, ResumeParseFailureCategory } from '@prisma/client';
import { AIService } from '../../../ai/application/ai.service';
import type { AiExecutionBoundary } from '../../../ai/application/plan-aware-ai.router';

export interface ParsedResume {
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    description: string;
    highlights: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string;
  }>;
  languages: string[];
  certifications: string[];
}

export class UnrecoverableResumeParseError extends Error {
  constructor(
    message: string,
    readonly category: ResumeParseFailureCategory,
  ) {
    super(message);
    this.name = 'UnrecoverableResumeParseError';
  }
}

export class RetryableResumeParseError extends Error {
  constructor(
    message: string,
    readonly category: ResumeParseFailureCategory,
  ) {
    super(message);
    this.name = 'RetryableResumeParseError';
  }
}

export class StaleResumeParseExecutionError extends Error {
  constructor() {
    super('Resume parse execution lease is no longer current');
    this.name = 'StaleResumeParseExecutionError';
  }
}

@Injectable()
export class ResumeParser {
  constructor(private readonly aiService: AIService) {}

  async parse(
    rawText: string,
    userId: string,
    expectedBoundary?: AiExecutionBoundary,
  ): Promise<ParsedResume> {
    const response = await this.aiService.complete(
      AIRequestFeature.resume_parse,
      userId,
      { resumeText: rawText.slice(0, 100_000) },
      expectedBoundary,
    );

    const content = response.content.trim();
    const json = content.startsWith('```')
      ? content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : content;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new UnrecoverableResumeParseError(
        'AI provider returned invalid resume JSON',
        ResumeParseFailureCategory.provider_response_invalid,
      );
    }

    if (!isParsedResume(parsed)) {
      throw new UnrecoverableResumeParseError(
        'AI provider returned an invalid resume structure',
        ResumeParseFailureCategory.provider_response_invalid,
      );
    }
    return parsed;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOptionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || typeof record[key] === 'string';
}

function isParsedResume(value: unknown): value is ParsedResume {
  if (!isRecord(value)) return false;

  const experienceValid = Array.isArray(value.experience) && value.experience.every((item) => {
    if (!isRecord(item)) return false;
    return ['title', 'company', 'startDate', 'endDate', 'description'].every(
      (key) => typeof item[key] === 'string',
    ) && isStringArray(item.highlights);
  });
  const educationValid = Array.isArray(value.education) && value.education.every((item) => {
    if (!isRecord(item)) return false;
    return ['degree', 'institution', 'startDate', 'endDate'].every(
      (key) => typeof item[key] === 'string',
    ) && hasOptionalString(item, 'gpa');
  });
  const projectsValid = Array.isArray(value.projects) && value.projects.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.name === 'string' &&
      typeof item.description === 'string' &&
      isStringArray(item.technologies) &&
      hasOptionalString(item, 'url');
  });

  return isStringArray(value.skills) &&
    experienceValid &&
    educationValid &&
    projectsValid &&
    isStringArray(value.languages) &&
    isStringArray(value.certifications);
}
