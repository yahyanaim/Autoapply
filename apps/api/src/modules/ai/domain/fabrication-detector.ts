export interface Fabrication {
  type: 'experience' | 'title' | 'date' | 'skill' | 'education' | 'certification' | 'metric';
  detail: string;
}

interface StructuredResumeEvidence {
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
  }>;
  projects: Array<{
    name: string;
    technologies: string[];
  }>;
  certifications: string[];
}

export interface FabricationEvidence {
  original: unknown;
  optimized: unknown;
}

const DATE_PATTERNS = [
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}/gi,
  /\d{1,2}\/\d{4}/g,
  /\d{4}\s*[-–]\s*(?:present|current|now)/gi,
  /\d{4}\s*[-–]\s*\d{4}/g,
  /\b(?:19|20)\d{2}\b/g,
];

const JOB_TITLE_PATTERNS = [
  /(?:senior|junior|lead|principal|staff|head|director|vp|chief)\s+\w+/gi,
  /(?:software|data|product|project|systems|cloud|devops|ml|ai)\s+(?:engineer|developer|architect|scientist|analyst|manager|lead)/gi,
];

function extractDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      dates.push(match[0].trim());
    }
  }
  return [...new Set(dates)];
}

function extractTitles(text: string): string[] {
  const titles: string[] = [];
  for (const pattern of JOB_TITLE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      titles.push(match[0].trim());
    }
  }
  return [...new Set(titles)];
}

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const skills = new Set<string>();
  const knownSkills = [
    'javascript',
    'typescript',
    'python',
    'java',
    'c++',
    'c#',
    'go',
    'rust',
    'react',
    'angular',
    'vue',
    'svelte',
    'nextjs',
    'nuxt',
    'node',
    'express',
    'django',
    'flask',
    'spring',
    'fastapi',
    'rails',
    'aws',
    'azure',
    'gcp',
    'docker',
    'kubernetes',
    'terraform',
    'sql',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'graphql',
    'rest',
    'grpc',
    'machine learning',
    'deep learning',
    'nlp',
    'computer vision',
    'git',
    'linux',
    'bash',
  ];
  for (const skill of knownSkills) {
    if (lower.includes(skill)) {
      skills.add(skill);
    }
  }
  return [...skills];
}

function uniqueMatches(text: string, patterns: RegExp[]): string[] {
  const matches = new Set<string>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = (match[1] ?? match[0]).trim().replace(/\s+/g, ' ');
      if (value) matches.add(value);
    }
  }
  return [...matches];
}

function extractEducationClaims(text: string): string[] {
  return uniqueMatches(text, [
    /\b((?:associate(?:'s)?|bachelor(?:'s)?|master(?:'s)?|doctorate)\s+(?:degree\s+)?(?:in\s+)?[A-Za-z][A-Za-z &/-]{1,60})/gi,
    /\b((?:Ph\.?D\.?|M\.?B\.?A\.?|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?)\s+(?:in\s+)?[A-Za-z][A-Za-z &/-]{1,60})/gi,
  ]);
}

function extractCertificationClaims(text: string): string[] {
  return uniqueMatches(text, [
    /\b((?:certified|certification(?:\s+in)?|certificate(?:\s+in)?)\s+[A-Za-z0-9][A-Za-z0-9 +#&./-]{2,80})/gi,
    /\b(AWS Certified [A-Za-z0-9][A-Za-z0-9 +#&./-]{2,80})/gi,
    /\b(Google Cloud Certified [A-Za-z0-9][A-Za-z0-9 +#&./-]{2,80})/gi,
  ]);
}

function extractQuantitativeClaims(text: string): string[] {
  return uniqueMatches(text, [
    /\b(\d+(?:[.,]\d+)?\s*(?:%|x|k|m|million|thousand|users|customers|clients|projects|people|engineers|requests|transactions|sales|hours|days|weeks|months))(?=\b|\s|[.,;:!?)]|$)/gi,
  ]);
}

function normalizeClaim(item: string): string {
  return item
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameClaim(first: string | null, second: string | null): boolean {
  return normalizeClaim(first ?? '') === normalizeClaim(second ?? '');
}

function findNewItems(original: string[], optimized: string[]): string[] {
  const originalSet = new Set(original.map(normalizeClaim));
  return optimized.filter((item) => !originalSet.has(normalizeClaim(item)));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter((item) => item.length > 0) : [];
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function readStructuredResume(value: unknown): StructuredResumeEvidence {
  const resume = asRecord(value) ?? {};
  return {
    skills: readStrings(resume.skills),
    experience: readRecords(resume.experience).map((item) => ({
      company: readString(item.company),
      title: readString(item.title),
      startDate: readString(item.startDate),
      endDate: readString(item.endDate) || null,
    })),
    education: readRecords(resume.education).map((item) => ({
      institution: readString(item.institution),
      degree: readString(item.degree),
      startDate: readString(item.startDate),
      endDate: readString(item.endDate),
    })),
    projects: readRecords(resume.projects).map((item) => ({
      name: readString(item.name),
      technologies: readStrings(item.technologies),
    })),
    certifications: readStrings(resume.certifications),
  };
}

function nonEmpty(values: Array<string | null>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function detectStructuredFabrications(evidence: FabricationEvidence): Fabrication[] {
  const original = readStructuredResume(evidence.original);
  const optimized = readStructuredResume(evidence.optimized);
  const fabrications: Fabrication[] = [];

  const originalSkills = [
    ...original.skills,
    ...original.projects.flatMap((project) => project.technologies),
  ];
  const optimizedSkills = [
    ...optimized.skills,
    ...optimized.projects.flatMap((project) => project.technologies),
  ];
  for (const skill of findNewItems(originalSkills, optimizedSkills)) {
    fabrications.push({
      type: 'skill',
      detail: `Added skill not in verified resume data: "${skill}"`,
    });
  }

  const originalCompanies = original.experience.map((item) => item.company);
  for (const company of findNewItems(
    originalCompanies,
    optimized.experience.map((item) => item.company),
  )) {
    fabrications.push({
      type: 'experience',
      detail: `Added employer not in verified resume data: "${company}"`,
    });
  }

  const originalTitles = original.experience.map((item) => item.title);
  for (const title of findNewItems(
    originalTitles,
    optimized.experience.map((item) => item.title),
  )) {
    fabrications.push({
      type: 'title',
      detail: `Added job title not in verified resume data: "${title}"`,
    });
  }

  for (const experience of optimized.experience) {
    const verifiedExperience = original.experience.find(
      (candidate) =>
        sameClaim(candidate.company, experience.company) &&
        sameClaim(candidate.title, experience.title),
    );
    if (!verifiedExperience) {
      if (
        originalCompanies.some((company) => sameClaim(company, experience.company)) &&
        originalTitles.some((title) => sameClaim(title, experience.title))
      ) {
        fabrications.push({
          type: 'experience',
          detail:
            `Combined employer and title not found together in verified resume data: ` +
            `"${experience.title}" at "${experience.company}"`,
        });
      }
      continue;
    }
    for (const date of findNewItems(
      nonEmpty([verifiedExperience.startDate, verifiedExperience.endDate]),
      nonEmpty([experience.startDate, experience.endDate]),
    )) {
      fabrications.push({
        type: 'date',
        detail: `Changed date for "${experience.title}" at "${experience.company}": ` + `"${date}"`,
      });
    }
  }

  const originalEducation = original.education.flatMap((item) => [item.institution, item.degree]);
  const optimizedEducation = optimized.education.flatMap((item) => [item.institution, item.degree]);
  for (const claim of findNewItems(originalEducation, optimizedEducation)) {
    fabrications.push({
      type: 'education',
      detail: `Added education claim not in verified resume data: "${claim}"`,
    });
  }

  for (const education of optimized.education) {
    const verifiedEducation = original.education.find(
      (candidate) =>
        sameClaim(candidate.institution, education.institution) &&
        sameClaim(candidate.degree, education.degree),
    );
    if (!verifiedEducation) continue;
    for (const date of findNewItems(
      nonEmpty([verifiedEducation.startDate, verifiedEducation.endDate]),
      nonEmpty([education.startDate, education.endDate]),
    )) {
      fabrications.push({
        type: 'date',
        detail:
          `Changed education date for "${education.degree}" at ` +
          `"${education.institution}": "${date}"`,
      });
    }
  }

  for (const certification of findNewItems(original.certifications, optimized.certifications)) {
    fabrications.push({
      type: 'certification',
      detail: `Added certification not in verified resume data: "${certification}"`,
    });
  }

  return fabrications;
}

export function detectFabrications(
  originalResume: { content: string },
  optimizedResume: { content: string },
  evidence?: FabricationEvidence,
): Fabrication[] {
  const fabrications = evidence ? detectStructuredFabrications(evidence) : [];

  if (!evidence) {
    const origDates = extractDates(originalResume.content);
    const optDates = extractDates(optimizedResume.content);
    const newDates = findNewItems(origDates, optDates);
    for (const date of newDates) {
      fabrications.push({
        type: 'date',
        detail: `Added date not in original resume: "${date}"`,
      });
    }

    const origTitles = extractTitles(originalResume.content);
    const optTitles = extractTitles(optimizedResume.content);
    const newTitles = findNewItems(origTitles, optTitles);
    for (const title of newTitles) {
      fabrications.push({
        type: 'title',
        detail: `Added job title not in original resume: "${title}"`,
      });
    }

    const origSkills = extractSkills(originalResume.content);
    const optSkills = extractSkills(optimizedResume.content);
    const newSkills = findNewItems(origSkills, optSkills);
    for (const skill of newSkills) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const originalCasing = optimizedResume.content.match(new RegExp(escaped, 'i'))?.[0] ?? skill;
      fabrications.push({
        type: 'skill',
        detail: `Added skill not in original resume: "${originalCasing}"`,
      });
    }

    const originalEducation = extractEducationClaims(originalResume.content);
    const optimizedEducation = extractEducationClaims(optimizedResume.content);
    for (const claim of findNewItems(originalEducation, optimizedEducation)) {
      fabrications.push({
        type: 'education',
        detail: `Added education claim not in original resume: "${claim}"`,
      });
    }

    const originalCertifications = extractCertificationClaims(originalResume.content);
    const optimizedCertifications = extractCertificationClaims(optimizedResume.content);
    for (const claim of findNewItems(originalCertifications, optimizedCertifications)) {
      fabrications.push({
        type: 'certification',
        detail: `Added certification not in original resume: "${claim}"`,
      });
    }
  }

  const originalMetrics = extractQuantitativeClaims(originalResume.content);
  const optimizedMetrics = extractQuantitativeClaims(optimizedResume.content);
  for (const claim of findNewItems(originalMetrics, optimizedMetrics)) {
    fabrications.push({
      type: 'metric',
      detail: `Added quantitative claim not in original resume: "${claim}"`,
    });
  }

  if (!evidence) {
    const origExpPattern = /(?:worked|experience|employed)\s+(?:at|with)\s+([A-Z][\w\s&]+)/gi;
    const origExps: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = origExpPattern.exec(originalResume.content)) !== null) {
      origExps.push(m[1].trim());
    }

    const optExpPattern = /(?:worked|experience|employed)\s+(?:at|with)\s+([A-Z][\w\s&]+)/gi;
    const optExps: string[] = [];
    while ((m = optExpPattern.exec(optimizedResume.content)) !== null) {
      optExps.push(m[1].trim());
    }

    const newExps = findNewItems(origExps, optExps);
    for (const exp of newExps) {
      fabrications.push({
        type: 'experience',
        detail: `Added work experience not in original resume: "${exp}"`,
      });
    }
  }

  return fabrications;
}
