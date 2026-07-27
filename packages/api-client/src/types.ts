export interface UserSummary {
  id: string;
  email: string;
  role: string;
}

export interface AuthLoginRequest { email: string; password: string }
export interface AuthRegisterRequest { email: string; password: string; fullName?: string }
export interface AuthRefreshRequest { refreshToken?: string }
export interface AuthResponse { accessToken: string; refreshToken?: string; user: UserSummary }
export type AuthLoginResponse = AuthResponse;
export type AuthRegisterResponse = AuthResponse;
export type AuthRefreshResponse = AuthResponse;

export interface ResumeRecord {
  id: string;
  userId: string;
  originalFileUrl: string;
  parsedJson: Record<string, unknown> | null;
  parseStatus: 'pending' | 'processing' | 'ready' | 'failed';
  parseError: string | null;
  isPrimary: boolean;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ResumeUploadRequest { file: File }
export type ResumeUploadResponse = ResumeRecord;
export type ResumeListResponse = ResumeRecord[];
export interface ResumeVersionRecord {
  id: string;
  resumeId: string;
  jobId: string | null;
  optimizedText: string | null;
  documentJson: GeneratedResumeDocument | null;
  matchScore: number | null;
  missingKeywords: string[];
  weakSections: string[];
  generatedAt: string;
}
export type ResumeVersionsResponse = ResumeVersionRecord[];

export interface JobSearchRequest {
  query?: string;
  location?: string;
  remoteType?: 'remote' | 'hybrid' | 'onsite';
  salaryMin?: number;
  salaryMax?: number;
  page?: number;
  limit?: number;
}
export interface JobRecord {
  id: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  location: string | null;
  remoteType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  company: { id: string; name: string } | null;
  skills: Array<{ id: string; name: string }>;
  createdAt: string;
}
export interface JobSearchResponse { jobs: JobRecord[]; total: number; page: number; limit: number }

export interface ApplicationCreateRequest { jobId: string; resumeVersionId?: string; coverLetterId?: string }
export interface ApplicationCreateResponse { id: string; jobId: string; status: string; createdAt: string }
export interface ApplicationUpdateRequest { status: 'draft' | 'submitted' | 'viewed' | 'interview' | 'offer' | 'rejected' }
export interface ApplicationUpdateResponse { id: string; status: string; updatedAt: string }

export interface AiMatchScoreRequest { resumeId: string; jobId: string }
export interface AiMatchScoreTextRequest { resumeId: string; jobDescription: string }
export interface AiMatchScoreResponse { score: number; missingKeywords: string[]; weakSections: string[]; explanation: string }
export interface AiOptimizeRequest { resumeId: string; jobId: string }
export interface AiOptimizeResponse {
  versionId: string;
  optimizedText: string;
  matchScore: number;
  missingKeywords: string[];
  weakSections: string[];
  fabrications: unknown[];
  document: GeneratedResumeDocument;
}
export interface GeneratedResumeDocument {
  template: 'classic-ats-v1';
  contact: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedInUrl?: string;
    portfolioUrl?: string;
  };
  profile: string;
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    description: string;
    highlights: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  skills: string[];
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string;
  }>;
  certifications: string[];
  languages: string[];
}
export interface AiCoverLetterRequest { resumeId: string; jobId: string; tone?: string }
export interface AiCoverLetterResponse { id: string; userId: string; jobId: string | null; content: string; tone: string | null; generatedAt: string }

export interface BillingCheckoutRequest { plan: 'pro' | 'premium' }
export interface BillingCheckoutResponse { sessionId: string; url: string }
export interface BillingPortalResponse { url: string }

export interface AdminUsersResponse { users: Array<UserSummary & { isEmailVerified: boolean; createdAt: string; updatedAt: string }>; total: number; page: number; limit: number }
export interface AdminMetricsResponse { totalUsers: number; totalApplications: number; totalJobs: number; activeSubscriptions: number }
