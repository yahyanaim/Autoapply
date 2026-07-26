export interface Skill {
  id: string;
  name: string;
}

export interface ParsedResume {
  skills: string[];
  experience: ParsedExperience[];
  education: ParsedEducation[];
  projects: ParsedProject[];
  languages: string[];
  certifications: string[];
}

export interface ParsedExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  description: string;
  highlights: string[];
}

export interface ParsedEducation {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface ParsedProject {
  name: string;
  description: string;
  url?: string;
  technologies: string[];
}

export interface Resume {
  id: string;
  userId: string;
  originalFileUrl: string;
  parsedJson: ParsedResume | null;
  parseStatus: 'pending' | 'processing' | 'ready' | 'failed';
  parseError: string | null;
  isPrimary: boolean;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  jobId: string | null;
  optimizedFileUrl: string | null;
  optimizedText: string | null;
  matchScore: number | null;
  missingKeywords: string[];
  weakSections: string[];
  generatedAt: string;
}
