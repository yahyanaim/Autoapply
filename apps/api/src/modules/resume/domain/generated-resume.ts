export const GENERATED_RESUME_TEMPLATE = 'classic-ats-v1' as const;

export interface GeneratedResumeContact {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
}

export interface GeneratedResumeExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string;
  highlights: string[];
}

export interface GeneratedResumeEducation {
  degree: string;
  institution: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface GeneratedResumeProject {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
}

export interface GeneratedResumeDocument {
  template: typeof GENERATED_RESUME_TEMPLATE;
  contact: GeneratedResumeContact;
  profile: string;
  experience: GeneratedResumeExperience[];
  education: GeneratedResumeEducation[];
  skills: string[];
  projects: GeneratedResumeProject[];
  certifications: string[];
  languages: string[];
}

export interface GeneratedResumeContactSource {
  fullName?: string | null;
  email: string;
  phone?: string | null;
  location?: string | null;
  linkedInUrl?: string | null;
  portfolioUrl?: string | null;
}

interface VerifiedResume {
  skills: string[];
  experience: GeneratedResumeExperience[];
  education: GeneratedResumeEducation[];
  projects: GeneratedResumeProject[];
  languages: string[];
  certifications: string[];
}

interface IndexedExperienceUpdate {
  index: number;
  description: string;
  highlights: string[];
}

interface IndexedProjectUpdate {
  index: number;
  description: string;
}

export class GeneratedResumeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedResumeValidationError';
  }
}

export function buildGeneratedResumeDocument(
  parsedResume: unknown,
  optimization: Record<string, unknown>,
  contactSource: GeneratedResumeContactSource,
): GeneratedResumeDocument {
  const verified = readVerifiedResume(parsedResume);
  const profile = readRequiredString(optimization.profileSummary, 'profileSummary', 1_200);
  const experienceUpdates = readExperienceUpdates(
    optimization.experience,
    verified.experience.length,
  );
  const projectUpdates = readProjectUpdates(
    optimization.projects,
    verified.projects.length,
  );
  const skills = readReorderedSkills(optimization.skillsOrder, verified.skills);

  return {
    template: GENERATED_RESUME_TEMPLATE,
    contact: buildContact(contactSource),
    profile,
    experience: verified.experience.map((item, index) => ({
      ...item,
      description: experienceUpdates[index]!.description,
      highlights: experienceUpdates[index]!.highlights,
    })),
    education: verified.education,
    skills,
    projects: verified.projects.map((item, index) => ({
      ...item,
      description: projectUpdates[index]!.description,
    })),
    certifications: verified.certifications,
    languages: verified.languages,
  };
}

export function isGeneratedResumeDocument(value: unknown): value is GeneratedResumeDocument {
  if (!isRecord(value) || value.template !== GENERATED_RESUME_TEMPLATE) return false;
  if (!isRecord(value.contact)) return false;
  if (
    typeof value.contact.fullName !== 'string' ||
    typeof value.contact.email !== 'string' ||
    typeof value.profile !== 'string'
  ) {
    return false;
  }
  return (
    Array.isArray(value.experience) &&
    Array.isArray(value.education) &&
    Array.isArray(value.skills) &&
    Array.isArray(value.projects) &&
    Array.isArray(value.certifications) &&
    Array.isArray(value.languages)
  );
}

export function generatedResumeToText(
  document: GeneratedResumeDocument,
  includeContact = true,
): string {
  const lines: string[] = includeContact
    ? [
        document.contact.fullName,
        [
          document.contact.email,
          document.contact.phone,
          document.contact.location,
          document.contact.linkedInUrl,
          document.contact.portfolioUrl,
        ]
          .filter(Boolean)
          .join(' | '),
        '',
        'PROFILE',
        document.profile,
      ]
    : ['PROFILE', document.profile];

  if (document.experience.length) {
    lines.push('', 'PROFESSIONAL EXPERIENCE');
    for (const item of document.experience) {
      lines.push(
        `${item.title} - ${item.company} | ${item.startDate} - ${item.endDate}`,
        item.description,
        ...item.highlights.map((highlight) => `- ${highlight}`),
      );
    }
  }

  if (document.education.length) {
    lines.push('', 'EDUCATION');
    for (const item of document.education) {
      lines.push(
        `${item.degree} | ${item.institution} | ${item.startDate} - ${item.endDate}`,
        item.gpa ? `GPA: ${item.gpa}` : '',
      );
    }
  }

  if (document.skills.length) {
    lines.push('', 'TECHNICAL SKILLS', document.skills.join(' | '));
  }

  if (document.projects.length) {
    lines.push('', 'PROJECTS');
    for (const item of document.projects) {
      lines.push(
        item.name,
        item.description,
        item.technologies.join(' | '),
        item.url ?? '',
      );
    }
  }

  if (document.certifications.length) {
    lines.push('', 'CERTIFICATIONS', ...document.certifications.map((item) => `- ${item}`));
  }
  if (document.languages.length) {
    lines.push('', 'LANGUAGES', document.languages.join(' | '));
  }

  return lines.filter((line, index) => line || lines[index - 1] !== '').join('\n').trim();
}

export function verifiedResumeToText(parsedResume: unknown): string {
  const verified = readVerifiedResume(parsedResume);
  const lines: string[] = [];

  for (const item of verified.experience) {
    lines.push(
      `${item.title} - ${item.company} | ${item.startDate} - ${item.endDate}`,
      item.description,
      ...item.highlights,
    );
  }
  for (const item of verified.education) {
    lines.push(
      `${item.degree} | ${item.institution} | ${item.startDate} - ${item.endDate}`,
      item.gpa ?? '',
    );
  }
  for (const item of verified.projects) {
    lines.push(item.name, item.description, ...item.technologies, item.url ?? '');
  }
  lines.push(...verified.skills, ...verified.certifications, ...verified.languages);
  return lines.filter(Boolean).join('\n');
}

function buildContact(source: GeneratedResumeContactSource): GeneratedResumeContact {
  const fallbackName = source.email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

  return compactObject({
    fullName: cleanText(source.fullName || fallbackName || 'Candidate', 120),
    email: cleanText(source.email, 254),
    phone: optionalText(source.phone, 50),
    location: optionalText(source.location, 120),
    linkedInUrl: optionalText(source.linkedInUrl, 300),
    portfolioUrl: optionalText(source.portfolioUrl, 300),
  });
}

function readVerifiedResume(value: unknown): VerifiedResume {
  if (!isRecord(value)) {
    throw new GeneratedResumeValidationError('The parsed resume is unavailable');
  }

  return {
    skills: readStringArray(value.skills, 'resume skills', 80, 120),
    experience: readRecordArray(value.experience, 'resume experience', 20).map(
      (item, index) => ({
        title: readRequiredString(item.title, `experience[${index}].title`, 180),
        company: readRequiredString(item.company, `experience[${index}].company`, 180),
        startDate: readRequiredString(item.startDate, `experience[${index}].startDate`, 80),
        endDate: optionalText(item.endDate, 80) || 'Present',
        description: optionalText(item.description, 2_000) || '',
        highlights: readStringArray(
          item.highlights,
          `experience[${index}].highlights`,
          12,
          500,
        ),
      }),
    ),
    education: readRecordArray(value.education, 'resume education', 10).map(
      (item, index) =>
        compactObject({
          degree: readRequiredString(item.degree, `education[${index}].degree`, 220),
          institution: readRequiredString(
            item.institution,
            `education[${index}].institution`,
            220,
          ),
          startDate: readRequiredString(
            item.startDate,
            `education[${index}].startDate`,
            80,
          ),
          endDate: readRequiredString(item.endDate, `education[${index}].endDate`, 80),
          gpa: optionalText(item.gpa, 30),
        }),
    ),
    projects: readRecordArray(value.projects, 'resume projects', 12).map(
      (item, index) =>
        compactObject({
          name: readRequiredString(item.name, `projects[${index}].name`, 180),
          description: optionalText(item.description, 1_500) || '',
          technologies: readStringArray(
            item.technologies,
            `projects[${index}].technologies`,
            30,
            120,
          ),
          url: optionalText(item.url, 300),
        }),
    ),
    languages: readStringArray(value.languages, 'resume languages', 20, 120),
    certifications: readStringArray(
      value.certifications,
      'resume certifications',
      20,
      220,
    ),
  };
}

function readExperienceUpdates(value: unknown, expectedCount: number): IndexedExperienceUpdate[] {
  const records = readRecordArray(value, 'experience optimization', expectedCount);
  if (records.length !== expectedCount) {
    throw new GeneratedResumeValidationError(
      'AI response did not include every verified experience entry',
    );
  }
  const updates = records.map((item, position) => ({
    index: readIndex(item.index, 'experience', expectedCount),
    description: readRequiredString(
      item.description,
      `experience[${position}].description`,
      2_000,
    ),
    highlights: readStringArray(
      item.highlights,
      `experience[${position}].highlights`,
      12,
      500,
    ),
  }));
  return orderCompleteUpdates(updates, expectedCount, 'experience');
}

function readProjectUpdates(value: unknown, expectedCount: number): IndexedProjectUpdate[] {
  const records = readRecordArray(value, 'project optimization', expectedCount);
  if (records.length !== expectedCount) {
    throw new GeneratedResumeValidationError(
      'AI response did not include every verified project entry',
    );
  }
  const updates = records.map((item, position) => ({
    index: readIndex(item.index, 'project', expectedCount),
    description: readRequiredString(
      item.description,
      `projects[${position}].description`,
      1_500,
    ),
  }));
  return orderCompleteUpdates(updates, expectedCount, 'project');
}

function readReorderedSkills(value: unknown, verifiedSkills: string[]): string[] {
  const requested = readStringArray(value, 'skillsOrder', 80, 120);
  const verifiedByKey = new Map(
    verifiedSkills.map((skill) => [normalizeKey(skill), skill] as const),
  );
  const requestedKeys = requested.map(normalizeKey);
  if (
    requestedKeys.length !== verifiedByKey.size ||
    new Set(requestedKeys).size !== requestedKeys.length ||
    requestedKeys.some((key) => !verifiedByKey.has(key))
  ) {
    throw new GeneratedResumeValidationError(
      'AI response changed the verified skills instead of only reordering them',
    );
  }
  return requestedKeys.map((key) => verifiedByKey.get(key)!);
}

function orderCompleteUpdates<T extends { index: number }>(
  updates: T[],
  expectedCount: number,
  label: string,
): T[] {
  const byIndex = new Map(updates.map((update) => [update.index, update]));
  if (byIndex.size !== expectedCount) {
    throw new GeneratedResumeValidationError(`AI response duplicated a ${label} entry`);
  }
  return Array.from({ length: expectedCount }, (_, index) => {
    const item = byIndex.get(index);
    if (!item) {
      throw new GeneratedResumeValidationError(`AI response omitted ${label} entry ${index}`);
    }
    return item;
  });
}

function readIndex(value: unknown, label: string, count: number): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) >= count) {
    throw new GeneratedResumeValidationError(`AI response returned an invalid ${label} index`);
  }
  return Number(value);
}

function readRecordArray(value: unknown, label: string, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max || !value.every(isRecord)) {
    throw new GeneratedResumeValidationError(`Invalid ${label}`);
  }
  return value;
}

function readStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === 'string')) {
    throw new GeneratedResumeValidationError(`Invalid ${label}`);
  }
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean);
}

function readRequiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new GeneratedResumeValidationError(`Invalid ${label}`);
  }
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new GeneratedResumeValidationError(`Invalid ${label}`);
  return cleaned;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return cleanText(value, maxLength) || undefined;
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeKey(value: string): string {
  return cleanText(value, 120).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ''),
  ) as T;
}
