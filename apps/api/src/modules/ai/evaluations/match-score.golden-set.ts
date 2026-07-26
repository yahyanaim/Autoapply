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
    expectedScore: { min: 25, max: 55 },
    expectedMissingKeywords: ['docker', 'kubernetes'],
  },
  {
    name: 'unrelated background remains a poor match',
    resume:
      'Brand marketer focused on editorial calendars and campaign strategy.',
    jobDescription:
      'Backend engineer with 5 years of experience building Python services on AWS and Kubernetes.',
    expectedScore: { min: 0, max: 30 },
    expectedMissingKeywords: ['python', 'aws', 'kubernetes'],
  },
];
