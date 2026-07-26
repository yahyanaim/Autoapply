export interface MatchScoreDto {
  resumeId: string;
  jobId: string;
}

export interface OptimizeResumeAiDto {
  resumeId: string;
  jobId: string;
}

export interface CoverLetterDto {
  resumeId: string;
  jobId: string;
  tone?: string;
}
