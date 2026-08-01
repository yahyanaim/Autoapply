export type ClaimClassification =
  'supported' | 'safe_rewording' | 'needs_confirmation' | 'unsupported_blocked';

export type TruthfulnessClaimType =
  | 'experience'
  | 'title'
  | 'date'
  | 'skill'
  | 'education'
  | 'certification'
  | 'metric'
  | 'language'
  | 'project'
  | 'narrative';

export interface TruthfulnessFinding {
  classification: ClaimClassification;
  type: TruthfulnessClaimType;
  section: string;
  detail: string;
  original?: string;
  proposed?: string;
}

export interface TruthfulnessReport {
  status: 'passed' | 'review_required' | 'blocked';
  summary: Record<ClaimClassification, number>;
  findings: TruthfulnessFinding[];
}

export interface Fabrication {
  type: TruthfulnessClaimType;
  detail: string;
}

interface StructuredResumeEvidence {
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
    description: string;
    highlights: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
    gpa: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url: string;
  }>;
  certifications: string[];
  languages: string[];
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

const GENERIC_NARRATIVE_WORDS = new Set([
  'across',
  'background',
  'candidate',
  'experience',
  'experienced',
  'expertise',
  'focused',
  'including',
  'professional',
  'results',
  'skilled',
  'strong',
  'using',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'with',
]);

function extractDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      dates.push(match[0].trim());
    }
  }
  return [...new Set(dates)];
}

function extractTitles(text: string): string[] {
  return uniqueMatches(text, [
    /(?:^|[.;\n]\s*)(?:experience:\s*)?([A-Z][A-Za-z0-9+#/&(). -]{1,80}?)\s+(?:at|@)\s+[A-Z][A-Za-z0-9&.' -]+/gm,
    /\b(?:as|role:\s*)\s+([A-Z][A-Za-z0-9+#/&(). -]{1,80})(?=\s+(?:at|with|from)|[.;,\n]|$)/gm,
  ]);
}

/**
 * Reads skills from labelled resume sections instead of relying on a
 * software-engineering vocabulary. This keeps the fallback useful for any
 * profession while structured evidence remains the preferred path.
 */
function extractSkills(text: string): string[] {
  const skills = new Set<string>();
  const pattern =
    /(?:^|\n)\s*(?:skills?|competencies|tools|expertise)\s*:\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    for (const value of match[1].split(/\s*(?:,|;|\||•)\s*/)) {
      const cleaned = value.trim().replace(/[.;]+$/, '');
      if (cleaned && cleaned.length <= 120) skills.add(cleaned);
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
    /\b((?:[$€£]\s*)?\d+(?:[.,]\d+)?\s*(?:%|x|k|m|billion|million|thousand|users|customers|clients|projects|people|engineers|requests|transactions|sales|revenue|hours|days|weeks|months))(?=\b|\s|[.,;:!?)]|$)/gi,
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
  return Array.isArray(value)
    ? value.map(readString).filter((item) => item.length > 0)
    : [];
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
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
      endDate: readString(item.endDate) || 'Present',
      description: readString(item.description),
      highlights: readStrings(item.highlights),
    })),
    education: readRecords(resume.education).map((item) => ({
      institution: readString(item.institution),
      degree: readString(item.degree),
      startDate: readString(item.startDate),
      endDate: readString(item.endDate),
      gpa: readString(item.gpa),
    })),
    projects: readRecords(resume.projects).map((item) => ({
      name: readString(item.name),
      description: readString(item.description),
      technologies: readStrings(item.technologies),
      url: readString(item.url),
    })),
    certifications: readStrings(resume.certifications),
    languages: readStrings(resume.languages),
  };
}

function nonEmpty(values: Array<string | null>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function proposedPreview(value: string): string {
  return value.length <= 220 ? value : `${value.slice(0, 217)}…`;
}

function supportedFinding(
  type: TruthfulnessClaimType,
  section: string,
  detail: string,
): TruthfulnessFinding {
  return { classification: 'supported', type, section, detail };
}

function blockedFinding(
  type: TruthfulnessClaimType,
  section: string,
  detail: string,
  proposed?: string,
): TruthfulnessFinding {
  return {
    classification: 'unsupported_blocked',
    type,
    section,
    detail,
    ...(proposed ? { proposed: proposedPreview(proposed) } : {}),
  };
}

function confirmationFinding(
  type: TruthfulnessClaimType,
  section: string,
  detail: string,
  original?: string,
  proposed?: string,
): TruthfulnessFinding {
  return {
    classification: 'needs_confirmation',
    type,
    section,
    detail,
    ...(original ? { original: proposedPreview(original) } : {}),
    ...(proposed ? { proposed: proposedPreview(proposed) } : {}),
  };
}

function canonicalToken(value: string): string {
  const irregular: Record<string, string> = {
    built: 'build',
    created: 'create',
    designed: 'design',
    developed: 'develop',
    led: 'lead',
    managed: 'manage',
  };
  if (irregular[value]) return irregular[value];
  if (value.length > 6 && value.endsWith('ing')) return value.slice(0, -3);
  if (value.length > 5 && value.endsWith('ed')) return value.slice(0, -2);
  if (value.length > 5 && value.endsWith('s')) return value.slice(0, -1);
  return value;
}

function narrativeTokens(value: string): string[] {
  return normalizeClaim(value)
    .split(' ')
    .map(canonicalToken)
    .filter(
      (token) =>
        token.length > 2 &&
        !STOP_WORDS.has(token) &&
        !GENERIC_NARRATIVE_WORDS.has(token),
    );
}

function classifyNarrative(
  section: string,
  original: string,
  proposed: string,
  verifiedContext: string,
): TruthfulnessFinding {
  if (sameClaim(original, proposed)) {
    return supportedFinding(
      'narrative',
      section,
      `${section} preserves the verified wording.`,
    );
  }
  if (!proposed.trim()) {
    return confirmationFinding(
      'narrative',
      section,
      `${section} removes verified narrative content; confirm that this omission is intentional.`,
      original,
      proposed,
    );
  }

  const contextTokens = new Set(
    narrativeTokens(`${original}\n${verifiedContext}`),
  );
  const proposedTokens = [...new Set(narrativeTokens(proposed))];
  const unknownTokens = proposedTokens.filter(
    (token) => !contextTokens.has(token),
  );
  if (unknownTokens.length === 0) {
    return {
      classification: 'safe_rewording',
      type: 'narrative',
      section,
      detail: `${section} rephrases verified material without changing protected facts.`,
      original: proposedPreview(original),
      proposed: proposedPreview(proposed),
    };
  }

  const terms = unknownTokens.slice(0, 6).join(', ');
  return confirmationFinding(
    'narrative',
    section,
    terms
      ? `${section} contains new wording that cannot be verified automatically. Confirm these terms: ${terms}.`
      : `${section} changed substantially and needs your confirmation.`,
    original,
    proposed,
  );
}

function structuredResumeText(resume: StructuredResumeEvidence): string {
  return [
    ...resume.skills,
    ...resume.languages,
    ...resume.certifications,
    ...resume.experience.flatMap((item) => [
      item.company,
      item.title,
      item.startDate,
      item.endDate ?? '',
      item.description,
      ...item.highlights,
    ]),
    ...resume.education.flatMap((item) => [
      item.institution,
      item.degree,
      item.startDate,
      item.endDate,
      item.gpa,
    ]),
    ...resume.projects.flatMap((item) => [
      item.name,
      item.description,
      item.url,
      ...item.technologies,
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}

function compareStringCollection(
  type: 'skill' | 'certification' | 'language',
  section: string,
  original: string[],
  optimized: string[],
  findings: TruthfulnessFinding[],
): void {
  for (const claim of findNewItems(original, optimized)) {
    findings.push(
      blockedFinding(
        type,
        section,
        `Added ${type} not in verified resume data: "${claim}"`,
        claim,
      ),
    );
  }
  for (const claim of findNewItems(optimized, original)) {
    findings.push(
      confirmationFinding(
        type,
        section,
        `Verified ${type} was omitted: "${claim}". Confirm that this omission is intentional.`,
        claim,
      ),
    );
  }
  if (
    (original.length > 0 || optimized.length > 0) &&
    !findNewItems(original, optimized).length &&
    !findNewItems(optimized, original).length
  ) {
    findings.push(
      supportedFinding(
        type,
        section,
        `${optimized.length} verified ${type}${optimized.length === 1 ? '' : 's'} preserved.`,
      ),
    );
  }
}

function blockReassignedMetrics(
  section: string,
  original: string,
  proposed: string,
  allVerifiedMetrics: string[],
  findings: TruthfulnessFinding[],
): void {
  for (const metric of findNewItems(
    extractQuantitativeClaims(original),
    extractQuantitativeClaims(proposed),
  )) {
    const existsElsewhere = allVerifiedMetrics.some((verifiedMetric) =>
      sameClaim(verifiedMetric, metric),
    );
    if (!existsElsewhere) continue;
    findings.push(
      blockedFinding(
        'metric',
        section,
        `Quantitative claim "${metric}" belongs to different verified evidence and cannot be reassigned to this section.`,
        metric,
      ),
    );
  }
}

function profileReferencesExperience(
  profile: string,
  experience: StructuredResumeEvidence['experience'][number],
): boolean {
  const normalizedProfile = ` ${normalizeClaim(profile)} `;
  return [experience.company, experience.title].some((claim) => {
    const normalized = normalizeClaim(claim);
    return (
      normalized.length > 0 && normalizedProfile.includes(` ${normalized} `)
    );
  });
}

function blockRecombinedProfileRoles(
  profile: string,
  experience: StructuredResumeEvidence['experience'],
  findings: TruthfulnessFinding[],
): void {
  const normalizedProfile = ` ${normalizeClaim(profile)} `;
  for (const titleSource of experience) {
    const title = normalizeClaim(titleSource.title);
    if (!title) continue;
    for (const companySource of experience) {
      const company = normalizeClaim(companySource.company);
      if (!company || sameClaim(titleSource.company, companySource.company)) {
        continue;
      }
      const recombined = ['at', 'with', 'for'].some((connector) =>
        normalizedProfile.includes(` ${title} ${connector} ${company} `),
      );
      if (!recombined) continue;
      findings.push(
        blockedFinding(
          'experience',
          'Profile summary',
          `Profile combines the verified title "${titleSource.title}" with a different employer "${companySource.company}".`,
          `${titleSource.title} at ${companySource.company}`,
        ),
      );
    }
  }
}

function detectStructuredFindings(
  evidence: FabricationEvidence,
  allVerifiedMetrics: string[],
): TruthfulnessFinding[] {
  const original = readStructuredResume(evidence.original);
  const optimized = readStructuredResume(evidence.optimized);
  const findings: TruthfulnessFinding[] = [];
  const verifiedContext = structuredResumeText(original);

  compareStringCollection(
    'skill',
    'Skills',
    original.skills,
    optimized.skills,
    findings,
  );
  compareStringCollection(
    'language',
    'Languages',
    original.languages,
    optimized.languages,
    findings,
  );
  compareStringCollection(
    'certification',
    'Certifications',
    original.certifications,
    optimized.certifications,
    findings,
  );

  const originalCompanies = original.experience.map((item) => item.company);
  const originalTitles = original.experience.map((item) => item.title);
  for (const [index, experience] of optimized.experience.entries()) {
    const section = `Experience ${index + 1}: ${experience.title || 'Untitled role'}`;
    const verifiedExperience = original.experience.find(
      (candidate) =>
        sameClaim(candidate.company, experience.company) &&
        sameClaim(candidate.title, experience.title),
    );
    if (!verifiedExperience) {
      const companyExists = originalCompanies.some((company) =>
        sameClaim(company, experience.company),
      );
      const titleExists = originalTitles.some((title) =>
        sameClaim(title, experience.title),
      );
      if (!companyExists) {
        findings.push(
          blockedFinding(
            'experience',
            section,
            `Added employer not in verified resume data: "${experience.company}"`,
            experience.company,
          ),
        );
      }
      if (!titleExists) {
        findings.push(
          blockedFinding(
            'title',
            section,
            `Added job title not in verified resume data: "${experience.title}"`,
            experience.title,
          ),
        );
      }
      if (companyExists && titleExists) {
        findings.push(
          blockedFinding(
            'experience',
            section,
            `Combined employer and title not found together in verified resume data: ` +
              `"${experience.title}" at "${experience.company}"`,
          ),
        );
      }
      continue;
    }

    const changedDates = findNewItems(
      nonEmpty([verifiedExperience.startDate, verifiedExperience.endDate]),
      nonEmpty([experience.startDate, experience.endDate]),
    );
    for (const date of changedDates) {
      findings.push(
        blockedFinding(
          'date',
          section,
          `Changed date for "${experience.title}" at "${experience.company}": "${date}"`,
          date,
        ),
      );
    }
    if (!changedDates.length) {
      findings.push(
        supportedFinding(
          'experience',
          section,
          `Verified role, employer, and dates preserved for "${experience.title}" at "${experience.company}".`,
        ),
      );
    }
    const verifiedExperienceContext = [
      verifiedExperience.company,
      verifiedExperience.title,
      verifiedExperience.startDate,
      verifiedExperience.endDate ?? '',
      verifiedExperience.description,
      ...verifiedExperience.highlights,
    ].join('\n');
    blockReassignedMetrics(
      section,
      `${verifiedExperience.description}\n${verifiedExperience.highlights.join('\n')}`,
      `${experience.description}\n${experience.highlights.join('\n')}`,
      allVerifiedMetrics,
      findings,
    );
    findings.push(
      classifyNarrative(
        `${section} description`,
        verifiedExperience.description,
        experience.description,
        verifiedExperienceContext,
      ),
    );
    findings.push(
      classifyNarrative(
        `${section} highlights`,
        verifiedExperience.highlights.join('\n'),
        experience.highlights.join('\n'),
        verifiedExperienceContext,
      ),
    );
  }
  for (const experience of original.experience) {
    const stillPresent = optimized.experience.some(
      (candidate) =>
        sameClaim(candidate.company, experience.company) &&
        sameClaim(candidate.title, experience.title),
    );
    if (!stillPresent) {
      findings.push(
        confirmationFinding(
          'experience',
          'Experience',
          `Verified role was omitted: "${experience.title}" at "${experience.company}".`,
          `${experience.title} at ${experience.company}`,
        ),
      );
    }
  }

  for (const [index, education] of optimized.education.entries()) {
    const section = `Education ${index + 1}: ${education.degree || 'Qualification'}`;
    const verifiedEducation = original.education.find(
      (candidate) =>
        sameClaim(candidate.institution, education.institution) &&
        sameClaim(candidate.degree, education.degree),
    );
    if (!verifiedEducation) {
      findings.push(
        blockedFinding(
          'education',
          section,
          `Added education record not in verified resume data: "${education.degree}" at "${education.institution}"`,
        ),
      );
      continue;
    }
    for (const date of findNewItems(
      nonEmpty([verifiedEducation.startDate, verifiedEducation.endDate]),
      nonEmpty([education.startDate, education.endDate]),
    )) {
      findings.push(
        blockedFinding(
          'date',
          section,
          `Changed education date for "${education.degree}" at "${education.institution}": "${date}"`,
          date,
        ),
      );
    }
    if (!sameClaim(verifiedEducation.gpa, education.gpa)) {
      findings.push(
        blockedFinding(
          'education',
          section,
          `Changed GPA for "${education.degree}" from "${verifiedEducation.gpa || 'not provided'}" to "${education.gpa || 'not provided'}".`,
          education.gpa,
        ),
      );
    } else {
      findings.push(
        supportedFinding(
          'education',
          section,
          `Verified qualification and institution preserved for "${education.degree}".`,
        ),
      );
    }
  }
  for (const education of original.education) {
    const stillPresent = optimized.education.some(
      (candidate) =>
        sameClaim(candidate.institution, education.institution) &&
        sameClaim(candidate.degree, education.degree),
    );
    if (!stillPresent) {
      findings.push(
        confirmationFinding(
          'education',
          'Education',
          `Verified education record was omitted: "${education.degree}" at "${education.institution}".`,
        ),
      );
    }
  }

  for (const [index, project] of optimized.projects.entries()) {
    const section = `Project ${index + 1}: ${project.name || 'Untitled project'}`;
    const verifiedProject = original.projects.find((candidate) =>
      sameClaim(candidate.name, project.name),
    );
    if (!verifiedProject) {
      findings.push(
        blockedFinding(
          'project',
          section,
          `Added project not in verified resume data: "${project.name}"`,
          project.name,
        ),
      );
      continue;
    }
    for (const technology of findNewItems(
      verifiedProject.technologies,
      project.technologies,
    )) {
      findings.push(
        blockedFinding(
          'project',
          section,
          `Added project technology not in verified resume data: "${technology}"`,
          technology,
        ),
      );
    }
    for (const technology of findNewItems(
      project.technologies,
      verifiedProject.technologies,
    )) {
      findings.push(
        confirmationFinding(
          'project',
          section,
          `Verified project technology was omitted: "${technology}". Confirm that this omission is intentional.`,
          technology,
        ),
      );
    }
    if (!sameClaim(verifiedProject.url, project.url)) {
      findings.push(
        blockedFinding(
          'project',
          section,
          `Changed verified project URL from "${verifiedProject.url || 'not provided'}" to "${project.url || 'not provided'}".`,
          project.url,
        ),
      );
    } else {
      findings.push(
        supportedFinding(
          'project',
          section,
          `Verified project name, technologies, and URL preserved for "${project.name}".`,
        ),
      );
    }
    const verifiedProjectContext = [
      verifiedProject.name,
      verifiedProject.description,
      verifiedProject.url,
      ...verifiedProject.technologies,
    ].join('\n');
    blockReassignedMetrics(
      section,
      verifiedProject.description,
      project.description,
      allVerifiedMetrics,
      findings,
    );
    findings.push(
      classifyNarrative(
        `${section} description`,
        verifiedProject.description,
        project.description,
        verifiedProjectContext,
      ),
    );
  }
  for (const project of original.projects) {
    if (
      !optimized.projects.some((candidate) =>
        sameClaim(candidate.name, project.name),
      )
    ) {
      findings.push(
        confirmationFinding(
          'project',
          'Projects',
          `Verified project was omitted: "${project.name}".`,
          project.name,
        ),
      );
    }
  }

  const optimizedRecord = asRecord(evidence.optimized) ?? {};
  const profile = readString(optimizedRecord.profile);
  if (profile) {
    blockRecombinedProfileRoles(profile, original.experience, findings);
    const referencedExperience = original.experience.filter((item) =>
      profileReferencesExperience(profile, item),
    );
    const profileContext =
      referencedExperience.length > 0
        ? structuredResumeText({
            ...original,
            experience: referencedExperience,
          })
        : verifiedContext;
    if (referencedExperience.length > 0) {
      blockReassignedMetrics(
        'Profile summary',
        referencedExperience
          .flatMap((item) => [item.description, ...item.highlights])
          .join('\n'),
        profile,
        allVerifiedMetrics,
        findings,
      );
    }
    findings.push(
      classifyNarrative('Profile summary', '', profile, profileContext),
    );
  }

  return findings;
}

function detectFallbackBlockedFindings(
  originalResume: { content: string },
  optimizedResume: { content: string },
): TruthfulnessFinding[] {
  const findings: TruthfulnessFinding[] = [];
  const comparisons: Array<{
    type: TruthfulnessClaimType;
    section: string;
    original: string[];
    optimized: string[];
    detail: (claim: string) => string;
  }> = [
    {
      type: 'date',
      section: 'Dates',
      original: extractDates(originalResume.content),
      optimized: extractDates(optimizedResume.content),
      detail: (claim) => `Added date not in original resume: "${claim}"`,
    },
    {
      type: 'title',
      section: 'Job titles',
      original: extractTitles(originalResume.content),
      optimized: extractTitles(optimizedResume.content),
      detail: (claim) => `Added job title not in original resume: "${claim}"`,
    },
    {
      type: 'skill',
      section: 'Skills',
      original: extractSkills(originalResume.content),
      optimized: extractSkills(optimizedResume.content),
      detail: (claim) => `Added skill not in original resume: "${claim}"`,
    },
    {
      type: 'education',
      section: 'Education',
      original: extractEducationClaims(originalResume.content),
      optimized: extractEducationClaims(optimizedResume.content),
      detail: (claim) =>
        `Added education claim not in original resume: "${claim}"`,
    },
    {
      type: 'certification',
      section: 'Certifications',
      original: extractCertificationClaims(originalResume.content),
      optimized: extractCertificationClaims(optimizedResume.content),
      detail: (claim) =>
        `Added certification not in original resume: "${claim}"`,
    },
  ];

  for (const comparison of comparisons) {
    for (const claim of findNewItems(
      comparison.original,
      comparison.optimized,
    )) {
      findings.push(
        blockedFinding(
          comparison.type,
          comparison.section,
          comparison.detail(claim),
          claim,
        ),
      );
    }
  }

  const originalEmployers = uniqueMatches(originalResume.content, [
    /(?:worked|experience|employed)\s+(?:at|with)\s+([A-Z][\w\s&.'-]+)/gi,
  ]);
  const optimizedEmployers = uniqueMatches(optimizedResume.content, [
    /(?:worked|experience|employed)\s+(?:at|with)\s+([A-Z][\w\s&.'-]+)/gi,
  ]);
  for (const employer of findNewItems(originalEmployers, optimizedEmployers)) {
    findings.push(
      blockedFinding(
        'experience',
        'Experience',
        `Added work experience not in original resume: "${employer}"`,
        employer,
      ),
    );
  }
  return findings;
}

function deduplicateFindings(
  findings: TruthfulnessFinding[],
): TruthfulnessFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [
      finding.classification,
      finding.type,
      finding.section,
      finding.detail,
      finding.proposed ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeResumeTruthfulness(
  originalResume: { content: string },
  optimizedResume: { content: string },
  evidence?: FabricationEvidence,
): TruthfulnessReport {
  const allVerifiedMetrics = extractQuantitativeClaims(originalResume.content);
  const findings = evidence
    ? detectStructuredFindings(evidence, allVerifiedMetrics)
    : detectFallbackBlockedFindings(originalResume, optimizedResume);

  for (const metric of findNewItems(
    allVerifiedMetrics,
    extractQuantitativeClaims(optimizedResume.content),
  )) {
    findings.push(
      blockedFinding(
        'metric',
        'Quantitative achievements',
        `Added quantitative claim not in the verified resume: "${metric}"`,
        metric,
      ),
    );
  }

  const uniqueFindings = deduplicateFindings(findings);
  const summary: Record<ClaimClassification, number> = {
    supported: 0,
    safe_rewording: 0,
    needs_confirmation: 0,
    unsupported_blocked: 0,
  };
  for (const finding of uniqueFindings) summary[finding.classification] += 1;

  return {
    status:
      summary.unsupported_blocked > 0
        ? 'blocked'
        : summary.needs_confirmation > 0
          ? 'review_required'
          : 'passed',
    summary,
    findings: uniqueFindings,
  };
}

export function blockedTruthfulnessFindings(
  report: TruthfulnessReport,
): TruthfulnessFinding[] {
  return report.findings.filter(
    (finding) => finding.classification === 'unsupported_blocked',
  );
}

export function formatTruthfulnessFailure(
  report: TruthfulnessReport,
  prefix = 'CV truthfulness validation blocked this change.',
): string {
  const blocked = blockedTruthfulnessFindings(report);
  if (!blocked.length) return prefix;
  const visible = blocked.slice(0, 4).map((finding) => finding.detail);
  const remaining = blocked.length - visible.length;
  return `${prefix} ${visible.join(' ')}${remaining > 0 ? ` ${remaining} more unsupported claim${remaining === 1 ? '' : 's'} detected.` : ''}`;
}

/**
 * Backwards-compatible facade for callers that only need blocked claims.
 */
export function detectFabrications(
  originalResume: { content: string },
  optimizedResume: { content: string },
  evidence?: FabricationEvidence,
): Fabrication[] {
  return blockedTruthfulnessFindings(
    analyzeResumeTruthfulness(originalResume, optimizedResume, evidence),
  ).map(({ type, detail }) => ({ type, detail }));
}
