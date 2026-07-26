export interface UploadResumeDto {
  file: File;
  jobId?: string;
}

export interface OptimizeResumeDto {
  jobId: string;
}
