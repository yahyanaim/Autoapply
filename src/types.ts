export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  summary: string;
  skills: {
    skillName: string;
    skillType: 'technical' | 'soft' | 'language' | 'certification';
    proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsExp: number;
    source: string;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startYear: number;
    endYear: number;
    gpa?: number;
    honors?: string;
  }[];
  workExperience: {
    id: string;
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    achievements: string[];
    technologies: string[];
  }[];
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  remoteType: 'remote' | 'hybrid' | 'onsite';
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  requirements: string[];
  requiredSkills: string[];
  sourceBoard: string;
  sourceUrl: string;
  postedAt: string;
  isActive: boolean;
}

export interface JobMatch {
  id: string;
  candidateId: string;
  jobId: string;
  fitScore: number;
  skillsScore: number;
  experienceScore: number;
  industryScore: number;
  seniorityScore: number;
  matchAnalysis: string;
  matchedAt: string;
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  status: 'draft' | 'ready' | 'submitted' | 'rejected' | 'interview';
  resumeText: string;
  coverLetterText: string;
  critiqueNotes: {
    atsScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    feedback: string;
    formatScore: number;
    toneReview: string;
  };
  atsScore: number;
  iterationCount: number;
  createdAt: string;
  submittedAt?: string;
}

export interface AgentRun {
  id: string;
  agentName: string;
  status: 'running' | 'success' | 'failed';
  inputData: any;
  outputData: any;
  errorMessage?: string;
  tokensUsed?: number;
  costUsd: number;
  startedAt: string;
  finishedAt: string;
}
