export interface MatchScoreGoldenCase {
  name: string;
  resume: string;
  jobDescription: string;
  expectedScore: { min: number; max: number };
  expectedMissingKeywords: string[];
}

export const matchScoreGoldenSet: MatchScoreGoldenCase[] = [
  {
    name: 'strong platform match',
    resume:
      'Software engineer with 6 years of experience. Built and deployed TypeScript, Node, PostgreSQL, Redis, Docker, Kubernetes and AWS services. Bachelor of Computer Science.',
    jobDescription:
      'Requires 5+ years of experience building and deploying TypeScript Node services with PostgreSQL, Redis, Docker, Kubernetes and AWS. Bachelor of Computer Science.',
    expectedScore: { min: 85, max: 100 },
    expectedMissingKeywords: [],
  },
  {
    name: 'partial match exposes infrastructure gaps',
    resume:
      'Frontend engineer who built React and TypeScript applications.',
    jobDescription:
      'Build TypeScript services with Docker and Kubernetes. 4 years of experience required.',
    expectedScore: { min: 20, max: 55 },
    expectedMissingKeywords: ['Docker', 'Kubernetes'],
  },
  {
    name: 'unrelated background remains a poor match',
    resume:
      'Brand marketer focused on editorial calendars and campaign strategy.',
    jobDescription:
      'Backend engineer with 5 years of experience building Python services on AWS and Kubernetes.',
    expectedScore: { min: 0, max: 30 },
    expectedMissingKeywords: ['Python', 'AWS', 'Kubernetes'],
  },
  {
    name: 'French bilingual data analyst match',
    resume:
      'Data Analyst avec 4 ans d experience. SQL, Python, Excel et Power BI. Master en Data Science. Francais courant et anglais B2. Creation de tableaux de bord et automatisation du reporting.',
    jobDescription:
      'Data Analyst. Minimum 3 ans d experience. SQL, Python, Excel et Power BI obligatoires. Bac+5 requis. Francais et anglais requis. Creer des tableaux de bord et automatiser le reporting.',
    expectedScore: { min: 80, max: 100 },
    expectedMissingKeywords: [],
  },
];
