const CATEGORY_WEIGHTS = {
  skills: 40,
  experience: 25,
  responsibilities: 15,
  education: 10,
  languages: 7,
  certifications: 3,
} as const;

type Category = keyof typeof CATEGORY_WEIGHTS;

export interface MatchScoreBreakdown {
  skills: number | null;
  experience: number | null;
  responsibilities: number | null;
  education: number | null;
  languages: number | null;
  certifications: number | null;
}

export interface MatchScoreResult {
  score: number;
  confidence: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  weakSections: string[];
  breakdown: MatchScoreBreakdown;
  explanation: string[];
}

interface TermDefinition {
  name: string;
  aliases: string[];
}

interface WeightedTerm {
  name: string;
  weight: number;
  required: boolean;
}

interface CategoryResult {
  score: number | null;
  matched: string[];
  missing: string[];
  hardMissing: string[];
  detail: string;
}

interface ResumeEvidence {
  normalizedText: string;
  tokens: Set<string>;
  titles: string[];
  experienceYears: number | null;
}

const SKILLS: TermDefinition[] = [
  term('JavaScript', 'javascript', 'js'),
  term('TypeScript', 'typescript', 'ts'),
  term('Python', 'python'),
  term('Java', 'java'),
  term('C++', 'c++', 'cpp'),
  term('C#', 'c#', 'c sharp'),
  term('Go', 'golang'),
  term('Rust', 'rust'),
  term('PHP', 'php'),
  term('Ruby', 'ruby'),
  term('Kotlin', 'kotlin'),
  term('Swift', 'swift'),
  term('R', 'r language', 'langage r'),
  term('Scala', 'scala'),
  term('MATLAB', 'matlab'),
  term('React', 'react', 'reactjs', 'react.js'),
  term('Angular', 'angular'),
  term('Vue.js', 'vue', 'vuejs', 'vue.js'),
  term('Svelte', 'svelte'),
  term('Next.js', 'nextjs', 'next.js'),
  term('Nuxt', 'nuxt', 'nuxtjs'),
  term('HTML', 'html', 'html5'),
  term('CSS', 'css', 'css3'),
  term('Tailwind CSS', 'tailwind', 'tailwindcss', 'tailwind css'),
  term('Node.js', 'node', 'nodejs', 'node.js'),
  term('Express', 'express', 'expressjs'),
  term('NestJS', 'nestjs', 'nest.js'),
  term('Django', 'django'),
  term('Flask', 'flask'),
  term('FastAPI', 'fastapi', 'fast api'),
  term('Spring Boot', 'spring boot', 'springboot'),
  term('.NET', '.net', 'dotnet', 'asp.net', 'asp net'),
  term('Laravel', 'laravel'),
  term('Ruby on Rails', 'ruby on rails', 'rails'),
  term('SQL', 'sql'),
  term('PostgreSQL', 'postgresql', 'postgres'),
  term('MySQL', 'mysql'),
  term('SQL Server', 'sql server', 'mssql'),
  term('Oracle Database', 'oracle database', 'oracle db', 'oracle'),
  term('MongoDB', 'mongodb', 'mongo db'),
  term('Redis', 'redis'),
  term('Elasticsearch', 'elasticsearch', 'elastic search'),
  term('Snowflake', 'snowflake'),
  term('BigQuery', 'bigquery', 'google bigquery'),
  term('Excel', 'excel', 'microsoft excel', 'ms excel'),
  term('Power BI', 'power bi', 'powerbi'),
  term('Tableau', 'tableau'),
  term('Looker', 'looker'),
  term('Pandas', 'pandas'),
  term('Apache Spark', 'apache spark', 'spark'),
  term('Kafka', 'apache kafka', 'kafka'),
  term('Airflow', 'apache airflow', 'airflow'),
  term('AWS', 'aws', 'amazon web services'),
  term('Azure', 'azure', 'microsoft azure'),
  term('GCP', 'gcp', 'google cloud', 'google cloud platform'),
  term('Docker', 'docker'),
  term('Kubernetes', 'kubernetes', 'k8s'),
  term('Terraform', 'terraform'),
  term('Ansible', 'ansible'),
  term('Jenkins', 'jenkins'),
  term('GitHub Actions', 'github actions'),
  term('GitLab CI', 'gitlab ci', 'gitlab pipelines'),
  term('CI/CD', 'ci/cd', 'continuous integration', 'continuous delivery'),
  term('Linux', 'linux'),
  term('Bash', 'bash', 'shell scripting'),
  term('Git', 'git'),
  term('REST APIs', 'rest api', 'rest apis', 'restful api', 'restful services'),
  term('GraphQL', 'graphql'),
  term('gRPC', 'grpc'),
  term('Microservices', 'microservices', 'micro services'),
  term('Machine Learning', 'machine learning', 'apprentissage automatique'),
  term('Deep Learning', 'deep learning', 'apprentissage profond'),
  term('NLP', 'nlp', 'natural language processing', 'traitement du langage naturel'),
  term('Computer Vision', 'computer vision', 'vision par ordinateur'),
  term('LLMs', 'llm', 'llms', 'large language models'),
  term('RAG', 'rag', 'retrieval augmented generation'),
  term('TensorFlow', 'tensorflow'),
  term('PyTorch', 'pytorch'),
  term('scikit-learn', 'scikit learn', 'sklearn'),
  term('Agile', 'agile'),
  term('Scrum', 'scrum'),
  term('Jira', 'jira'),
  term('Project Management', 'project management', 'gestion de projet'),
  term('Product Management', 'product management', 'gestion de produit'),
  term('Financial Analysis', 'financial analysis', 'analyse financiere'),
  term('Accounting', 'accounting', 'comptabilite'),
  term('Digital Marketing', 'digital marketing', 'marketing digital'),
  term('SEO', 'seo', 'search engine optimization', 'referencement naturel'),
  term('Salesforce', 'salesforce'),
  term('CRM', 'crm', 'customer relationship management'),
  term('SAP', 'sap'),
  term('Odoo', 'odoo'),
  term('Sage', 'sage'),
  term('Supply Chain', 'supply chain', 'chaine logistique'),
  term('Procurement', 'procurement', 'purchasing', 'achats', 'approvisionnement'),
  term('Customer Service', 'customer service', 'customer support', 'service client'),
  term('Recruitment', 'recruitment', 'recrutement', 'talent acquisition'),
  term('AutoCAD', 'autocad'),
  term('SolidWorks', 'solidworks'),
  term('CATIA', 'catia'),
  term('BIM', 'bim', 'building information modeling'),
  term('Quality Management', 'quality management', 'gestion de la qualite'),
  term('HSE', 'hse', 'health safety environment', 'hygiene securite environnement'),
];

const LANGUAGES: TermDefinition[] = [
  term('English', 'english', 'anglais'),
  term('French', 'french', 'francais', 'français'),
  term('Arabic', 'arabic', 'arabe'),
  term('Spanish', 'spanish', 'espagnol'),
  term('German', 'german', 'allemand'),
  term('Italian', 'italian', 'italien'),
  term('Portuguese', 'portuguese', 'portugais'),
  term('Dutch', 'dutch', 'neerlandais', 'néerlandais'),
];

const CERTIFICATIONS: TermDefinition[] = [
  term('PMP', 'pmp', 'project management professional'),
  term('Scrum Master', 'scrum master', 'csm', 'psm'),
  term('AWS certification', 'aws certified', 'aws certification'),
  term('Azure certification', 'azure certified', 'azure certification'),
  term('Google Cloud certification', 'google cloud certified', 'gcp certification'),
  term('CCNA', 'ccna'),
  term('CISSP', 'cissp'),
  term('ITIL', 'itil'),
  term('CPA', 'cpa', 'certified public accountant'),
  term('CFA', 'cfa', 'chartered financial analyst'),
];

const RESPONSIBILITY_CONCEPTS: TermDefinition[] = [
  term(
    'data analysis',
    'analyze data',
    'analyse data',
    'data analysis',
    'analyse de donnees',
    'analyser les donnees',
    'analyser',
    'analyze',
    'analyzed',
    'analysed',
    'analysed data',
    'analyzed data',
  ),
  term(
    'reporting and dashboards',
    'reporting',
    'dashboard',
    'dashboards',
    'tableau de bord',
    'tableaux de bord',
  ),
  term(
    'automation',
    'automate',
    'automated',
    'automation',
    'automatiser',
    'automatisation',
  ),
  term(
    'building and development',
    'build',
    'built',
    'develop',
    'developed',
    'build software',
    'built software',
    'develop software',
    'developed software',
    'developper',
    'developpement',
  ),
  term(
    'design',
    'design',
    'designed',
    'concevoir',
    'conception',
  ),
  term(
    'implementation',
    'implement',
    'implemented',
    'implementation',
    'mettre en oeuvre',
    'mise en oeuvre',
  ),
  term(
    'optimization',
    'optimize',
    'optimized',
    'improve performance',
    'optimiser',
    'optimisation',
    'ameliorer',
  ),
  term(
    'deployment',
    'deploy',
    'deployed',
    'deployment',
    'deployer',
    'deploiement',
  ),
  term(
    'testing and quality',
    'test',
    'testing',
    'quality assurance',
    'assurance qualite',
    'tests',
  ),
  term(
    'project delivery',
    'deliver projects',
    'project delivery',
    'livrer des projets',
    'pilotage de projet',
  ),
  term(
    'team leadership',
    'lead team',
    'led team',
    'team leadership',
    'manage team',
    'managed team',
    'gerer une equipe',
    'management equipe',
  ),
  term(
    'collaboration',
    'collaborate',
    'collaborated',
    'cross functional',
    'collaborer',
    'collaboration',
  ),
  term(
    'stakeholder communication',
    'communicate',
    'present findings',
    'stakeholder',
    'parties prenantes',
    'presenter les resultats',
  ),
  term(
    'customer support',
    'customer support',
    'customer service',
    'support clients',
    'service client',
  ),
  term(
    'sales',
    'sales targets',
    'business development',
    'developpement commercial',
    'objectifs de vente',
  ),
  term(
    'recruitment',
    'recruit candidates',
    'talent acquisition',
    'recruter',
    'recrutement',
  ),
  term(
    'planning',
    'planning',
    'plan projects',
    'roadmap',
    'planification',
  ),
  term(
    'audit and compliance',
    'audit',
    'compliance',
    'conformite',
    'controle interne',
  ),
];

const REQUIRED_MARKERS = [
  'required',
  'must',
  'mandatory',
  'minimum',
  'essential',
  'requirements',
  'requis',
  'requise',
  'obligatoire',
  'exige',
  'exigence',
  'imperatif',
  'indispensable',
  'maitrise',
  'minimum',
];

const PREFERRED_MARKERS = [
  'preferred',
  'nice to have',
  'bonus',
  'plus',
  'desirable',
  'souhaite',
  'souhaitee',
  'apprecie',
  'atout',
  'idealement',
];

const EQUIVALENT_EDUCATION_MARKERS = [
  'or equivalent experience',
  'or equivalent',
  'ou experience equivalente',
  'ou equivalent',
];

const STOPWORDS = new Set(
  normalizeText(
    [
      'a an and are as at be by for from has have in into is it its of on or our',
      'the their this to using we will with you your role team work working',
      'candidate candidates company looking seeking required requirements',
      'preferred experience experiences skill skills ability knowledge strong',
      'un une le la les des de du et en pour par avec sur est sont notre nous',
      'vous votre vos ce cette ces au aux dans qui que quoi etre avoir poste',
      'profil mission missions recherche recherchons candidat candidate',
      'competence competences exigence exigences requis requise obligatoire',
      'souhaite souhaitee plus an ans annee annees minimum maitrise',
    ].join(' '),
  )
    .trim()
    .split(' '),
);

const ROLE_STOPWORDS = new Set([
  'senior',
  'junior',
  'lead',
  'principal',
  'manager',
  'specialist',
  'expert',
  'intern',
  'stage',
  'stagiaire',
  'responsable',
  'hiring',
]);

export function calculateMatchScore(
  resume: { content: string },
  jobDescription: string,
  evidenceLabel = 'supplied CV',
): MatchScoreResult {
  const resumeEvidence = readResumeEvidence(resume.content);
  const normalizedJob = normalizeText(jobDescription);
  if (!normalizedJob.trim()) {
    return emptyResult('The job offer does not contain enough text to score.');
  }
  const skillResult = scoreTerms(
    SKILLS,
    resumeEvidence.normalizedText,
    normalizedJob,
    'skills',
  );
  const experienceResult = scoreExperience(
    resumeEvidence,
    normalizedJob,
    jobDescription,
  );
  const responsibilityResult = scoreResponsibilities(
    resumeEvidence,
    normalizedJob,
    skillResult,
  );
  const educationResult = scoreEducation(
    resumeEvidence.normalizedText,
    normalizedJob,
  );
  const languageResult = scoreTerms(
    LANGUAGES,
    resumeEvidence.normalizedText,
    normalizedJob,
    'languages',
  );
  const certificationResult = scoreTerms(
    CERTIFICATIONS,
    resumeEvidence.normalizedText,
    normalizedJob,
    'certifications',
  );

  const components: Record<Category, CategoryResult> = {
    skills: skillResult,
    experience: experienceResult,
    responsibilities: responsibilityResult,
    education: educationResult,
    languages: languageResult,
    certifications: certificationResult,
  };
  const applicable = (Object.entries(components) as Array<
    [Category, CategoryResult]
  >).filter(([, component]) => component.score !== null);

  if (!applicable.length) {
    return emptyResult('The job offer does not expose scorable requirements.');
  }

  const totalWeight = applicable.reduce(
    (sum, [category]) => sum + CATEGORY_WEIGHTS[category],
    0,
  );
  let score = Math.round(
    applicable.reduce(
      (sum, [category, component]) =>
        sum + component.score! * CATEGORY_WEIGHTS[category],
      0,
    ) / totalWeight,
  );

  score = applyHardRequirementCaps(score, {
    skills: skillResult,
    experience: experienceResult,
    education: educationResult,
    languages: languageResult,
  });

  const weakSections = applicable
    .filter(
      ([category, component]) =>
        component.score! < (category === 'responsibilities' ? 40 : 60),
    )
    .map(([category]) =>
      category === 'responsibilities' ? 'keywords' : category,
    );
  const matchedKeywords = unique(
    applicable.flatMap(([, component]) => component.matched),
  ).slice(0, 20);
  const missingKeywords = unique(
    applicable
      .filter(([category]) => category !== 'responsibilities')
      .flatMap(([, component]) => component.missing),
  ).slice(0, 20);
  const confidence = calculateConfidence(
    normalizedJob,
    resumeEvidence.normalizedText,
    applicable,
  );

  return {
    score: clamp(score),
    confidence,
    matchedKeywords,
    missingKeywords,
    weakSections,
    breakdown: {
      skills: skillResult.score,
      experience: experienceResult.score,
      responsibilities: responsibilityResult.score,
      education: educationResult.score,
      languages: languageResult.score,
      certifications: certificationResult.score,
    },
    explanation: [
      `Overall match: ${clamp(score)}% using evidence from the ${evidenceLabel} only.`,
      ...applicable.map(([, component]) => component.detail),
      `Scoring confidence: ${confidence}% based on the amount of CV and job evidence available.`,
    ],
  };
}

function scoreTerms(
  definitions: TermDefinition[],
  normalizedResume: string,
  normalizedJob: string,
  label: 'skills' | 'languages' | 'certifications',
): CategoryResult {
  const requirements = definitions
    .map((definition) => {
      const occurrence = findOccurrence(normalizedJob, definition.aliases);
      if (!occurrence) return null;
      const weight = requirementWeight(normalizedJob, occurrence.index);
      return {
        name: definition.name,
        weight,
        required: weight >= 1.25,
        matched: containsAny(normalizedResume, definition.aliases),
      };
    })
    .filter(
      (
        requirement,
      ): requirement is WeightedTerm & { matched: boolean } =>
        requirement !== null,
    );

  if (!requirements.length) {
    return notApplicable(`No explicit ${label} requirements found.`);
  }

  const totalWeight = sum(requirements.map(({ weight }) => weight));
  const matchedWeight = sum(
    requirements
      .filter(({ matched }) => matched)
      .map(({ weight }) => weight),
  );
  const matched = requirements
    .filter(({ matched }) => matched)
    .map(({ name }) => name);
  const missing = requirements
    .filter(({ matched }) => !matched)
    .sort((left, right) => right.weight - left.weight)
    .map(({ name }) => name);
  const score = Math.round((matchedWeight / totalWeight) * 100);
  const title = capitalize(label);

  return {
    score,
    matched,
    missing,
    hardMissing: requirements
      .filter(({ matched, required }) => !matched && required)
      .map(({ name }) => name),
    detail: `${title}: ${score}% — matched ${matched.length} of ${requirements.length}${
      matched.length ? ` (${matched.slice(0, 8).join(', ')})` : ''
    }${missing.length ? `; missing ${missing.slice(0, 8).join(', ')}` : ''}.`,
  };
}

function scoreExperience(
  resume: ResumeEvidence,
  normalizedJob: string,
  originalJob: string,
): CategoryResult {
  const requiredYears = extractRequiredYears(normalizedJob);
  const jobTitle = extractJobTitle(originalJob);
  const titleTokens = roleTokens(jobTitle);
  const roleScore = titleTokens.length
    ? calculateRoleScore(titleTokens, resume)
    : null;
  const yearsScore =
    requiredYears !== null
      ? Math.round(
          Math.min(1, (resume.experienceYears ?? 0) / requiredYears) * 100,
        )
      : null;

  if (yearsScore === null && roleScore === null) {
    return notApplicable('No explicit experience requirement found.');
  }

  const score =
    yearsScore !== null && roleScore !== null
      ? Math.round(yearsScore * 0.7 + roleScore * 0.3)
      : (yearsScore ?? roleScore)!;
  const matched: string[] = [];
  const missing: string[] = [];
  if (requiredYears !== null) {
    if ((resume.experienceYears ?? 0) >= requiredYears) {
      matched.push(`${requiredYears}+ years experience`);
    } else {
      missing.push(`${requiredYears}+ years experience`);
    }
  }
  if (roleScore !== null && jobTitle) {
    if (roleScore >= 60) matched.push(`role: ${jobTitle}`);
    else missing.push(`role alignment: ${jobTitle}`);
  }

  const parts: string[] = [];
  if (requiredYears !== null) {
    parts.push(
      `job asks for ${requiredYears}+ years; CV verifies ${
        resume.experienceYears === null
          ? 'no reliable duration'
          : `${formatYears(resume.experienceYears)} years`
      }`,
    );
  }
  if (roleScore !== null && jobTitle) {
    parts.push(`role-title alignment ${roleScore}% for “${jobTitle}”`);
  }

  return {
    score,
    matched,
    missing,
    hardMissing: missing,
    detail: `Experience: ${score}% — ${parts.join('; ')}.`,
  };
}

function scoreResponsibilities(
  resume: ResumeEvidence,
  normalizedJob: string,
  skillResult: CategoryResult,
): CategoryResult {
  const conceptRequirements = RESPONSIBILITY_CONCEPTS.filter((definition) =>
    containsAny(normalizedJob, definition.aliases),
  );
  const matchedConcepts = conceptRequirements
    .filter((definition) =>
      containsAny(resume.normalizedText, definition.aliases),
    )
    .map(({ name }) => name);
  const missingConcepts = conceptRequirements
    .filter(
      (definition) =>
        !containsAny(resume.normalizedText, definition.aliases),
    )
    .map(({ name }) => name);
  const excluded = new Set(
    [...skillResult.matched, ...skillResult.missing]
      .flatMap((value) => normalizeText(value).trim().split(' '))
      .concat(
        conceptRequirements.flatMap(({ aliases }) =>
          aliases.flatMap((alias) => normalizeText(alias).trim().split(' ')),
        ),
      )
      .map(stem),
  );
  const jobTerms = importantTerms(normalizedJob, excluded);
  if (jobTerms.length < 3 && conceptRequirements.length === 0) {
    return notApplicable('Not enough responsibility terms found.');
  }

  const matchedTerms = jobTerms.filter((termValue) =>
    resume.tokens.has(stem(termValue)),
  );
  const missingTerms = jobTerms.filter(
    (termValue) => !resume.tokens.has(stem(termValue)),
  );
  const conceptScore = conceptRequirements.length
    ? (matchedConcepts.length / conceptRequirements.length) * 100
    : null;
  const termScore = jobTerms.length
    ? (matchedTerms.length / jobTerms.length) * 100
    : null;
  const score = Math.round(
    conceptScore !== null && termScore !== null
      ? conceptScore * 0.65 + termScore * 0.35
      : (conceptScore ?? termScore ?? 0),
  );
  const matched = [...matchedConcepts, ...matchedTerms];
  const missing = [...missingConcepts, ...missingTerms];
  return {
    score,
    matched,
    missing: missing.slice(0, 8),
    hardMissing: [],
    detail: `Responsibilities and terminology: ${score}% — matched ${
      matchedConcepts.length
    } of ${conceptRequirements.length} responsibility patterns and ${
      matchedTerms.length
    } of ${jobTerms.length} important terms${
      matched.length ? ` (${matched.slice(0, 8).join(', ')})` : ''
    }.`,
  };
}

function scoreEducation(
  normalizedResume: string,
  normalizedJob: string,
): CategoryResult {
  const requiredLevel = educationLevel(normalizedJob);
  if (requiredLevel === 0) {
    return notApplicable('No explicit education requirement found.');
  }

  const candidateLevel = educationLevel(normalizedResume);
  const equivalentAllowed = EQUIVALENT_EDUCATION_MARKERS.some((marker) =>
    normalizedJob.includes(` ${normalizeText(marker).trim()} `),
  );
  const gap = requiredLevel - candidateLevel;
  let score = gap <= 0 ? 100 : gap === 1 ? 55 : gap === 2 ? 20 : 0;
  if (equivalentAllowed) score = Math.max(score, 70);
  const requiredName = educationName(requiredLevel);
  const candidateName =
    candidateLevel > 0 ? educationName(candidateLevel) : 'no verified degree';

  return {
    score,
    matched: score >= 70 ? [requiredName] : [],
    missing: score < 70 ? [requiredName] : [],
    hardMissing: score < 70 ? [requiredName] : [],
    detail: `Education: ${score}% — job requests ${requiredName}; CV shows ${candidateName}${
      equivalentAllowed ? '; equivalent experience is accepted' : ''
    }.`,
  };
}

function applyHardRequirementCaps(
  score: number,
  results: Pick<
    Record<Category, CategoryResult>,
    'skills' | 'experience' | 'education' | 'languages'
  >,
): number {
  let capped = score;
  if (
    results.skills.score !== null &&
    results.skills.hardMissing.length >= 3 &&
    results.skills.score < 25
  ) {
    capped = Math.min(capped, 45);
  } else if (results.skills.score !== null && results.skills.score < 50) {
    capped = Math.min(capped, 65);
  }
  if (
    results.experience.score !== null &&
    results.experience.hardMissing.some((item) => item.includes('years')) &&
    results.experience.score < 40
  ) {
    capped = Math.min(capped, 60);
  }
  if (results.education.score !== null && results.education.score < 20) {
    capped = Math.min(capped, 70);
  }
  if (
    results.languages.score !== null &&
    results.languages.hardMissing.length > 0 &&
    results.languages.score === 0
  ) {
    capped = Math.min(capped, 75);
  }
  return capped;
}

function readResumeEvidence(content: string): ResumeEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const flattened = parsed ? flattenStrings(parsed).join('\n') : content;
  const normalizedText = normalizeText(flattened);
  const structured = isRecord(parsed) ? parsed : null;
  const titles = Array.isArray(structured?.experience)
    ? structured.experience
        .filter(isRecord)
        .map((item) => (typeof item.title === 'string' ? item.title : ''))
        .filter(Boolean)
    : [];
  const dateYears = Array.isArray(structured?.experience)
    ? calculateStructuredExperienceYears(
        structured.experience.filter(isRecord),
      )
    : null;
  const explicitYears = extractDeclaredExperienceYears(normalizedText);

  return {
    normalizedText,
    tokens: new Set(
      normalizedText
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(stem),
    ),
    titles,
    experienceYears: maxNullable(dateYears, explicitYears),
  };
}

function calculateStructuredExperienceYears(
  experience: Array<Record<string, unknown>>,
): number | null {
  const months = new Set<number>();
  for (const item of experience) {
    const start =
      typeof item.startDate === 'string' ? parseMonth(item.startDate) : null;
    const end =
      typeof item.endDate === 'string' ? parseMonth(item.endDate, true) : null;
    if (start === null || end === null || end < start) continue;
    for (
      let month = start;
      month <= end && month - start <= 1_200;
      month += 1
    ) {
      months.add(month);
    }
  }
  return months.size ? Math.round((months.size / 12) * 10) / 10 : null;
}

function parseMonth(value: string, allowPresent = false): number | null {
  const normalized = normalizeText(value).trim();
  if (
    allowPresent &&
    /^(present|current|now|aujourd hui|actuel|en cours)$/.test(normalized)
  ) {
    const now = new Date();
    return now.getUTCFullYear() * 12 + now.getUTCMonth();
  }
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  const numeric = normalized.match(/\b(?:0?[1-9]|1[0-2])\b/);
  const monthNames = [
    ['jan', 'january', 'janvier'],
    ['feb', 'february', 'fevrier'],
    ['mar', 'march', 'mars'],
    ['apr', 'april', 'avril'],
    ['may', 'mai'],
    ['jun', 'june', 'juin'],
    ['jul', 'july', 'juillet'],
    ['aug', 'august', 'aout'],
    ['sep', 'sept', 'september', 'septembre'],
    ['oct', 'october', 'octobre'],
    ['nov', 'november', 'novembre'],
    ['dec', 'december', 'decembre'],
  ];
  const namedIndex = monthNames.findIndex((aliases) =>
    aliases.some((alias) => normalized.includes(alias)),
  );
  const month =
    namedIndex >= 0
      ? namedIndex
      : numeric
        ? Math.max(0, Number(numeric[0]) - 1)
        : allowPresent
          ? 11
          : 0;
  return year * 12 + month;
}

function extractRequiredYears(normalizedJob: string): number | null {
  const patterns = [
    /(?:minimum|min|at least|au moins)?\s*(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*(?:years?|ans?|annees?)\s*(?:(?:of|d|de)\s+)?(?:relevant |pertinente? )?(?:experience|experience professionnelle)/g,
    /(?:experience|experience professionnelle)\s*(?:of|de|d au moins|minimum)?\s*(\d{1,2})\s*\+?\s*(?:years?|ans?|annees?)/g,
  ];
  return maxPatternNumber(normalizedJob, patterns);
}

function extractDeclaredExperienceYears(normalizedResume: string): number | null {
  const patterns = [
    /(\d{1,2})\s*\+?\s*(?:years?|ans?|annees?)\s*(?:(?:of|d|de)\s+)?(?:professional |professionnelle? )?experience/g,
    /experience\s*(?:of|de)?\s*(\d{1,2})\s*\+?\s*(?:years?|ans?|annees?)/g,
  ];
  return maxPatternNumber(normalizedResume, patterns);
}

function maxPatternNumber(text: string, patterns: RegExp[]): number | null {
  const values: number[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value <= 60) values.push(value);
    }
  }
  return values.length ? Math.max(...values) : null;
}

function extractJobTitle(jobDescription: string): string {
  const firstLine = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (
    firstLine &&
    firstLine.length <= 120 &&
    firstLine.split(/\s+/).length <= 12 &&
    !/[.!?]$/.test(firstLine)
  ) {
    return firstLine;
  }

  const normalized = jobDescription.replace(/\s+/g, ' ');
  const match = normalized.match(
    /(?:looking for|seeking|hiring|recherchons|recherche)\s+(?:an?\s+|un(?:e)?\s+)?([^.,;]{3,100})/i,
  );
  return (match?.[1] ?? '')
    .split(/\b(?:with|who|to|avec|ayant|pour)\b/i)[0]!
    .trim();
}

function calculateRoleScore(
  jobTitleTokens: string[],
  resume: ResumeEvidence,
): number {
  if (!jobTitleTokens.length) return 0;
  const candidateTitles = resume.titles.length
    ? resume.titles
    : [resume.normalizedText];
  return Math.max(
    ...candidateTitles.map((title) => {
      const candidate = new Set(roleTokens(title));
      const matches = jobTitleTokens.filter((token) => candidate.has(token));
      return Math.round((matches.length / jobTitleTokens.length) * 100);
    }),
  );
}

function roleTokens(value: string): string[] {
  return normalizeText(value)
    .trim()
    .split(' ')
    .map(stem)
    .filter(
      (token) =>
        token.length >= 3 &&
        !STOPWORDS.has(token) &&
        !ROLE_STOPWORDS.has(token),
    );
}

function importantTerms(
  normalizedJob: string,
  excluded: Set<string>,
): string[] {
  const counts = new Map<string, { count: number; first: number; display: string }>();
  normalizedJob
    .trim()
    .split(' ')
    .forEach((display, index) => {
      const tokenValue = stem(display);
      if (
        tokenValue.length < 4 ||
        STOPWORDS.has(tokenValue) ||
        excluded.has(tokenValue) ||
        /^\d+$/.test(tokenValue)
      ) {
        return;
      }
      const current = counts.get(tokenValue);
      if (current) current.count += 1;
      else counts.set(tokenValue, { count: 1, first: index, display });
    });
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.first - right.first)
    .slice(0, 20)
    .map(({ display }) => display);
}

function educationLevel(text: string): number {
  const levels: Array<[number, string[]]> = [
    [5, ['phd', 'doctorate', 'doctorat']],
    [4, ['master', 'msc', 'm sc', 'mba', 'bac+5', 'bac 5']],
    [
      3,
      [
        'bachelor',
        'licence',
        'bsc',
        'b sc',
        'ingenieur',
        'engineering degree',
        'bac+3',
        'bac 3',
        'bac+4',
        'bac 4',
      ],
    ],
    [2, ['associate degree', 'dut', 'bts', 'deug', 'bac+2', 'bac 2']],
    [1, ['high school', 'secondary school', 'baccalaureat', 'baccalaureate']],
  ];
  for (const [level, aliases] of levels) {
    if (containsAny(text, aliases)) return level;
  }
  return 0;
}

function educationName(level: number): string {
  return (
    {
      1: 'secondary-school diploma',
      2: 'two-year higher-education diploma',
      3: 'bachelor/engineering degree',
      4: 'master degree',
      5: 'doctorate',
    }[level] ?? 'unspecified education'
  );
}

function requirementWeight(text: string, occurrenceIndex: number): number {
  const requiredDistance = nearestMarkerDistance(
    text,
    occurrenceIndex,
    REQUIRED_MARKERS,
  );
  const preferredDistance = nearestMarkerDistance(
    text,
    occurrenceIndex,
    PREFERRED_MARKERS,
  );
  if (
    preferredDistance !== null &&
    (requiredDistance === null || preferredDistance < requiredDistance)
  ) return 0.65;
  if (requiredDistance !== null) return 1.35;
  return 1;
}

function nearestMarkerDistance(
  text: string,
  occurrenceIndex: number,
  markers: string[],
): number | null {
  const distances: number[] = [];
  for (const marker of markers) {
    const normalizedMarker = normalizeText(marker).trim();
    const previous = text.lastIndexOf(normalizedMarker, occurrenceIndex);
    if (previous >= 0 && occurrenceIndex - previous <= 180) {
      distances.push(occurrenceIndex - previous);
    }
    const next = text.indexOf(normalizedMarker, occurrenceIndex);
    if (next >= 0 && next - occurrenceIndex <= 80) {
      distances.push(next - occurrenceIndex);
    }
  }
  return distances.length ? Math.min(...distances) : null;
}

function findOccurrence(
  normalizedText: string,
  aliases: string[],
): { index: number } | null {
  let best = -1;
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias).trim();
    if (!normalizedAlias) continue;
    const index = normalizedText.indexOf(` ${normalizedAlias} `);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best >= 0 ? { index: best } : null;
}

function containsAny(normalizedText: string, aliases: string[]): boolean {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias).trim();
    return normalizedAlias && normalizedText.includes(` ${normalizedAlias} `);
  });
}

function calculateConfidence(
  normalizedJob: string,
  normalizedResume: string,
  components: Array<[Category, CategoryResult]>,
): number {
  const jobEvidence = Math.min(20, Math.floor(normalizedJob.length / 40));
  const resumeEvidence = Math.min(
    15,
    Math.floor(normalizedResume.length / 60),
  );
  const categoryEvidence = components.length * 10;
  const confidence = clamp(
    15 + jobEvidence + resumeEvidence + categoryEvidence,
  );
  return normalizedResume.trim().length < 50
    ? Math.min(30, confidence)
    : confidence;
}

function emptyResult(message: string): MatchScoreResult {
  return {
    score: 0,
    confidence: 0,
    matchedKeywords: [],
    missingKeywords: [],
    weakSections: [],
    breakdown: {
      skills: null,
      experience: null,
      responsibilities: null,
      education: null,
      languages: null,
      certifications: null,
    },
    explanation: [message],
  };
}

function notApplicable(detail: string): CategoryResult {
  return { score: null, matched: [], missing: [], hardMissing: [], detail };
}

function term(name: string, ...aliases: string[]): TermDefinition {
  return { name, aliases };
}

function normalizeText(value: string): string {
  return ` ${value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\bGo\b/g, ' golang ')
    .replace(/\bR\b/g, ' r language ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\.net\b/g, ' dotnet ')
    .replace(/([a-z])\.js\b/g, '$1 js')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function stem(value: string): string {
  if (value.length <= 4 || /[+#]/.test(value)) return value;
  return value
    .replace(/(?:issements?|atrices?|ateurs?|ations?|ements?|iques?)$/i, '')
    .replace(/(?:ingly|edly|ing|ed|ies|es|s)$/i, '')
    .replace(/(?:euses?|eux|aux)$/i, '');
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (isRecord(value)) return Object.values(value).flatMap(flattenStrings);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function maxNullable(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatYears(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
