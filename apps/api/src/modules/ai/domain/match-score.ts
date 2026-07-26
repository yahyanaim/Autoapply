const WEIGHTS = {
  skills: 0.4,
  experience: 0.3,
  education: 0.15,
  keywords: 0.15,
} as const;

const SKILL_KEYWORDS = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust',
  'react', 'angular', 'vue', 'svelte', 'nextjs', 'nuxt', 'node', 'express',
  'django', 'flask', 'spring', 'fastapi', 'rails', 'laravel',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ci/cd',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'graphql', 'rest', 'grpc', 'websocket',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'llm', 'rag',
  'agile', 'scrum', 'jira', 'git', 'linux', 'bash',
];

const EDUCATION_PATTERNS = [
  /bachelor/i, /master/i, /phd/i, /doctorate/i,
  /b\.?s\.?/i, /m\.?s\.?/i, /m\.?b\.?a\.?/i,
  /university/i, /college/i, /institute/i,
  /computer science/i, /engineering/i, /mathematics/i,
];

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of SKILL_KEYWORDS) {
    if (lower.includes(kw)) {
      found.push(kw);
    }
  }
  return found;
}

function extractSkillMatches(resumeLower: string, jdKeywords: string[]): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of jdKeywords) {
    if (resumeLower.includes(kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }
  return { matched, missing };
}

function scoreSkills(resumeLower: string, jdKeywords: string[]): number {
  if (jdKeywords.length === 0) return 100;
  const { matched } = extractSkillMatches(resumeLower, jdKeywords);
  return Math.round((matched.length / jdKeywords.length) * 100);
}

function scoreExperience(resumeText: string, jobDescription: string): number {
  const resumeLower = resumeText.toLowerCase();
  const jdLower = jobDescription.toLowerCase();
  const scores: number[] = [];

  const requiredYears = jdLower.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i);
  if (requiredYears) {
    const resumeYears = resumeLower.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i);
    const required = Number(requiredYears[1]);
    const actual = resumeYears ? Number(resumeYears[1]) : 0;
    scores.push(required > 0 ? Math.min(100, Math.round((actual / required) * 100)) : 100);
  }

  const jdVerbs = new Set<string>();
  const verbPattern = /(?:led|managed|built|developed|designed|implemented|architected|deployed|optimized|scaled)/gi;
  let m: RegExpExecArray | null;
  while ((m = verbPattern.exec(jdLower)) !== null) {
    jdVerbs.add(m[0].toLowerCase());
  }
  for (const verb of jdVerbs) {
    scores.push(resumeLower.includes(verb) ? 100 : 0);
  }

  return scores.length === 0
    ? 100
    : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function scoreEducation(resumeText: string, jobDescription: string): number {
  const resumeLower = resumeText.toLowerCase();
  const jdLower = jobDescription.toLowerCase();

  let jdReqCount = 0;
  let resumeMatchCount = 0;

  for (const pattern of EDUCATION_PATTERNS) {
    if (pattern.test(jdLower)) {
      jdReqCount++;
      if (pattern.test(resumeLower)) {
        resumeMatchCount++;
      }
    }
  }

  return jdReqCount === 0 ? 100 : Math.round((resumeMatchCount / jdReqCount) * 100);
}

function scoreKeywords(resumeText: string, jobDescription: string): number {
  const jdWords = [...new Set(jobDescription.toLowerCase().match(/[a-z][a-z0-9+#./-]{4,}/g) ?? [])];
  if (jdWords.length === 0) return 100;
  const resumeLower = resumeText.toLowerCase();
  let found = 0;
  for (const word of jdWords) {
    if (resumeLower.includes(word)) {
      found++;
    }
  }
  return Math.round((found / jdWords.length) * 100);
}

export function calculateMatchScore(
  resume: { content: string },
  jobDescription: string,
): {
  score: number;
  missingKeywords: string[];
  weakSections: string[];
  explanation: string[];
} {
  const resumeLower = resume.content.toLowerCase();
  const jdKeywords = extractKeywords(jobDescription);

  const { matched, missing } = extractSkillMatches(resumeLower, jdKeywords);

  const skillsScore = scoreSkills(resumeLower, jdKeywords);
  const experienceScore = scoreExperience(resume.content, jobDescription);
  const educationScore = scoreEducation(resume.content, jobDescription);
  const keywordsScore = scoreKeywords(resume.content, jobDescription);

  const overallScore = Math.round(
    skillsScore * WEIGHTS.skills +
    experienceScore * WEIGHTS.experience +
    educationScore * WEIGHTS.education +
    keywordsScore * WEIGHTS.keywords,
  );

  const weakSections: string[] = [];
  if (skillsScore < 60) weakSections.push('skills');
  if (experienceScore < 60) weakSections.push('experience');
  if (educationScore < 60) weakSections.push('education');
  if (keywordsScore < 40) weakSections.push('keywords');

  const explanation: string[] = [];
  explanation.push(`Skills match: ${skillsScore}%`);
  explanation.push(`Experience relevance: ${experienceScore}%`);
  explanation.push(`Education alignment: ${educationScore}%`);
  explanation.push(`Keyword coverage: ${keywordsScore}%`);
  if (matched.length > 0) {
    explanation.push(`Matched skills: ${matched.join(', ')}`);
  }
  if (missing.length > 0) {
    explanation.push(`Missing from resume: ${missing.join(', ')}`);
  }

  return {
    score: Math.min(100, Math.max(0, overallScore)),
    missingKeywords: missing,
    weakSections,
    explanation,
  };
}
