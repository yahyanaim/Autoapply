export interface JobAnalysis {
  summary: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel: string;
  education: string[];
  languages: string[];
  keywords: string[];
}

export class JobAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobAnalysisValidationError';
  }
}

export function readJobAnalysis(value: unknown): JobAnalysis {
  if (!isRecord(value)) {
    throw new JobAnalysisValidationError('Job analysis must be an object');
  }
  return {
    summary: requiredText(value.summary, 'summary', 1_200),
    responsibilities: stringList(value.responsibilities, 'responsibilities', 30, 400),
    requiredSkills: stringList(value.requiredSkills, 'requiredSkills', 50, 120),
    preferredSkills: stringList(value.preferredSkills, 'preferredSkills', 50, 120),
    experienceLevel: optionalText(value.experienceLevel, 160),
    education: stringList(value.education, 'education', 15, 240),
    languages: stringList(value.languages, 'languages', 15, 120),
    keywords: stringList(value.keywords, 'keywords', 60, 120),
  };
}

function stringList(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === 'string')) {
    throw new JobAnalysisValidationError(`Invalid ${label}`);
  }
  return Array.from(
    new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean)),
  );
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new JobAnalysisValidationError(`Invalid ${label}`);
  }
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new JobAnalysisValidationError(`Invalid ${label}`);
  return cleaned;
}

function optionalText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? cleanText(value, maxLength) : '';
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
